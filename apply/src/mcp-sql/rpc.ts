/**
 * The SQL server's protocol and tools (Phase 23), without the process: one JSON-RPC message in,
 * one answer out. `server.ts` is the stdio loop and the database connection around it.
 *
 * Two tools. `query` runs one read statement inside a read-only transaction. `execute_sql` runs a
 * writer's batch as sent, and is always followed by a rollback, so a batch that forgot its commit
 * or failed half-way leaves no transaction open for the next call. Both pass the guard first; the
 * database's own grants are what a refused text could not have got past anyway.
 */

import { checkSql, type SqlMode } from './guard.js';

export const PROTOCOL_VERSION = '2024-11-05';
export const SERVER_NAME = 'bb2dash-apply-sql';
export const ROWS_MAX = 200;
export const TEXT_MAX_CHARS = 60_000;

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;

type Json = Record<string, unknown>;

/** One statement's outcome, as the database driver reports it. */
export interface StatementResult {
  readonly command: string | null;
  readonly rowCount: number | null;
  readonly rows: readonly Json[];
}

export interface SqlRunner {
  /** One statement in a read-only transaction. */
  query(sql: string): Promise<StatementResult>;
  /** A batch as sent, then a rollback of whatever it left open. */
  execute(sql: string): Promise<readonly StatementResult[]>;
}

const SQL_INPUT = { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'], additionalProperties: false };

export const TOOLS = Object.freeze([
  {
    name: 'query',
    description:
      'Run ONE read-only SQL statement (select or with) and get its rows as JSON, at most 200. It runs in a read-only transaction: it cannot write.',
    inputSchema: SQL_INPUT,
  },
  {
    name: 'execute_sql',
    description:
      "Run the writer's batch for one Inbox item: begin; select inbox_apply_begin_item(request, item); the writes; select inbox_apply_archive(request, item, record); commit. Anything left open is rolled back.",
    inputSchema: SQL_INPUT,
  },
]);

const MODE_OF: Readonly<Record<string, SqlMode>> = Object.freeze({ query: 'query', execute_sql: 'execute' });

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

/** The first line of a database error with its SQLSTATE: enough to act on, and never a DSN. */
function errorText(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? 'error';
  const code = (error as { code?: unknown })?.code;
  return typeof code === 'string' ? `${message} (SQLSTATE ${code})` : message;
}

/** Run one tool call. Never throws: a refusal and a database error are both a tool result. */
export async function callTool(name: unknown, args: unknown, runner: SqlRunner): Promise<Json | null> {
  const mode = typeof name === 'string' ? MODE_OF[name] : undefined;
  if (mode === undefined) return null;
  const sql = isRecord(args) ? args.sql : undefined;
  const verdict = checkSql(sql, mode);
  if (!verdict.ok) return textResult(`refused: ${verdict.reason}`, true);
  try {
    if (mode === 'query') return textResult(JSON.stringify(shape(await runner.query(sql as string))));
    const results = await runner.execute(sql as string);
    return textResult(JSON.stringify(results.map(shape)));
  } catch (error) {
    return textResult(`error: ${errorText(error)}`, true);
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
