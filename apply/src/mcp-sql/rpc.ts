/**
 * The SQL server's protocol and tools (Phase 23), without the process: one JSON-RPC message in,
 * one answer out. `server.ts` is the stdio loop and the database connection around it.
 *
 * Two tools.
 *
 *   query        one select, inside a read-only transaction. The database refuses every write
 *                there, so this tool cannot change a row or queue a request whatever it is sent.
 *
 *   apply_item   one Inbox item, start to finish. The caller gives the request, the item, the
 *                write statements and the decision record; the transaction is the server's:
 *                begin, inbox_apply_begin_item, each statement, inbox_apply_archive, commit, or a
 *                rollback of all of it. The model never writes `begin`, `commit` or the archive
 *                call, and the record travels as a parameter, not as SQL text ("a skill step
 *                written as prose gets skipped": this one is code).
 *
 * Every text passes the guard first (`guard.ts`), and a refusal or a database error is a tool
 * result, never a thrown protocol error.
 */

import { checkQuery, checkWrite } from './guard.js';

export const PROTOCOL_VERSION = '2024-11-05';
export const SERVER_NAME = 'bb2dash-apply-sql';
export const ROWS_MAX = 200;
export const TEXT_MAX_CHARS = 60_000;
export const STATEMENTS_MAX = 12;
export const RECORD_MAX_CHARS = 20_000;
/**
 * Keys of a decision that only the database's own functions write. `closed_itself` marks a
 * question nobody answered (114, 162): `link_file_sessions` skips an archived answer that carries
 * it (163), so on Stack's answer it would undo the answer.
 */
export const RECORD_RESERVED_KEYS: readonly string[] = ['closed_itself'];

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

type Json = Record<string, unknown>;

/** One statement's outcome, as the database driver reports it. */
export interface StatementResult {
  readonly command: string | null;
  readonly rowCount: number | null;
  readonly rows: readonly Json[];
}

export interface ApplyItemInput {
  readonly request: number;
  readonly item: number;
  readonly statements: readonly string[];
  readonly record: Json;
}

export type ApplyItemResult =
  | { readonly outcome: 'archived'; readonly statements: readonly StatementResult[] }
  /** The item was taken back or archived since the batch was read: nothing was written. */
  | { readonly outcome: 'skipped' };

export interface SqlRunner {
  /** One select in a read-only transaction, at most `limit` rows fetched. */
  query(sql: string, limit: number): Promise<StatementResult>;
  /** One item's transaction. Throws when a statement or the archive is refused; all of it is then rolled back. */
  applyItem(input: ApplyItemInput): Promise<ApplyItemResult>;
}

export const TOOLS = Object.freeze([
  {
    name: 'query',
    description:
      'Run ONE read-only select (or with ... select) and get its rows as JSON, at most 200. It runs in a read-only transaction: it cannot write.',
    inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'], additionalProperties: false },
  },
  {
    name: 'apply_item',
    description:
      'Apply ONE answered Inbox item in one transaction and archive it with its record. Give the request id, the item id, the write statements (each ONE insert or update on assignments, assignment_progress, course_staff or courses, or select raise_attention(...); add "returning *" to see the row) and the inbox-decision/1 record as an object. Do not send begin, commit or the archive call: the server does. An empty statements list archives a record-only item. If any statement fails, nothing is written.',
    inputSchema: {
      type: 'object',
      properties: {
        request: { type: 'integer' },
        item: { type: 'integer' },
        statements: { type: 'array', items: { type: 'string' }, maxItems: STATEMENTS_MAX },
        record: { type: 'object' },
      },
      required: ['request', 'item', 'statements', 'record'],
      additionalProperties: false,
    },
  },
]);

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

function cut(text: string): string {
  return text.length <= TEXT_MAX_CHARS ? text : `${text.slice(0, TEXT_MAX_CHARS)}\n… cut at ${TEXT_MAX_CHARS} characters`;
}

function shape(result: StatementResult): Json {
  const rows = result.rows.slice(0, ROWS_MAX);
  return {
    command: result.command,
    row_count: result.rowCount,
    rows,
    ...(result.rows.length > ROWS_MAX ? { rows_cut_at: ROWS_MAX } : {}),
  };
}

const textResult = (text: string, isError = false): Json => ({ content: [{ type: 'text', text: cut(text) }], isError });
const refused = (reason: string): Json => textResult(`refused: ${reason}`, true);

/** The first line of a database error with its SQLSTATE: enough to act on, and never a DSN. */
function errorText(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? 'error';
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' ? `${message} (SQLSTATE ${code})` : message;
}

/** What an apply_item call must be before anything reaches the database, or why it is refused. */
export function readApplyItem(args: unknown): { readonly input: ApplyItemInput } | { readonly reason: string } {
  if (!isRecord(args)) return { reason: 'the arguments are not an object' };
  if (!isId(args.request)) return { reason: 'request must be the request id, a positive whole number' };
  if (!isId(args.item)) return { reason: 'item must be the item id, a positive whole number' };
  if (!Array.isArray(args.statements) || args.statements.some((s) => typeof s !== 'string')) return { reason: 'statements must be a list of SQL texts' };
  if (args.statements.length > STATEMENTS_MAX) return { reason: `at most ${STATEMENTS_MAX} statements for one item` };
  if (!isRecord(args.record)) return { reason: 'record must be the inbox-decision/1 object' };
  if (JSON.stringify(args.record).length > RECORD_MAX_CHARS) return { reason: `the record is longer than ${RECORD_MAX_CHARS} characters` };
  const reserved = RECORD_RESERVED_KEYS.find((key) => key in (args.record as Record<string, unknown>));
  if (reserved !== undefined) return { reason: `the record may not carry ${reserved}: it marks a question nobody answered` };
  for (const [index, statement] of (args.statements as string[]).entries()) {
    const verdict = checkWrite(statement);
    if (!verdict.ok) return { reason: `statement ${index + 1}: ${verdict.reason}` };
  }
  return { input: { request: args.request, item: args.item, statements: args.statements as string[], record: args.record } };
}

async function runQuery(args: unknown, runner: SqlRunner): Promise<Json> {
  const sql = isRecord(args) ? args.sql : undefined;
  const verdict = checkQuery(sql);
  if (!verdict.ok) return refused(verdict.reason);
  // One row more than is shown, so a cut result says so without the whole table crossing the wire.
  return textResult(JSON.stringify(shape(await runner.query(sql as string, ROWS_MAX + 1))));
}

async function runApplyItem(args: unknown, runner: SqlRunner): Promise<Json> {
  const read = readApplyItem(args);
  if ('reason' in read) return refused(read.reason);
  const result = await runner.applyItem(read.input);
  if (result.outcome === 'skipped') {
    return textResult(JSON.stringify({ item: read.input.item, outcome: 'skipped', why: 'the item was taken back or already archived; nothing was written' }));
  }
  return textResult(JSON.stringify({ item: read.input.item, outcome: 'archived', statements: result.statements.map(shape) }));
}

/** Run one tool call. Never throws: a refusal and a database error are both a tool result. Null for an unknown tool. */
export async function callTool(name: unknown, args: unknown, runner: SqlRunner): Promise<Json | null> {
  if (name !== 'query' && name !== 'apply_item') return null;
  try {
    return name === 'query' ? await runQuery(args, runner) : await runApplyItem(args, runner);
  } catch (error) {
    return textResult(`error: ${errorText(error)}${name === 'apply_item' ? '; nothing was written for this item' : ''}`, true);
  }
}

/** The answer to one JSON-RPC message, or null for a notification. */
export async function handle(message: unknown, runner: SqlRunner): Promise<Json | null> {
  if (!isRecord(message) || typeof message.method !== 'string') return null;
  const { id, method } = message;
  const params = isRecord(message.params) ? message.params : {};
  const reply = (result: Json): Json => ({ jsonrpc: '2.0', id, result });
  const fail = (code: number, text: string): Json => ({ jsonrpc: '2.0', id, error: { code, message: text } });
  if (id === undefined) return null;

  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: SERVER_NAME, version: '0.1.0' },
      });
    case 'ping':
      return reply({});
    case 'tools/list':
      return reply({ tools: TOOLS });
    case 'tools/call': {
      const result = await callTool(params.name, params.arguments, runner);
      return result === null ? fail(INVALID_PARAMS, 'no such tool') : reply(result);
    }
    default:
      return fail(METHOD_NOT_FOUND, `no method ${method.slice(0, 60)}`);
  }
}
