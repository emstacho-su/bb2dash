/**
 * The SQL guard (Phase 23, rewritten in review round 1): what text the two tools accept. Pure.
 *
 * WHAT THE DATABASE ALREADY HOLDS, measured on prod 2026-10-07. The role `inbox_apply_runner` has
 * usage on four schemas: public, information_schema, pg_catalog and `net` (pg_net, through PUBLIC,
 * which the project's owner cannot revoke). In `public` it can read and write only what migration
 * 181 grants. So the one thing a grant does not stop is a post to another host through `net`, and
 * that needs a write (pg_net queues a request with an insert).
 *
 *   query        runs inside a READ ONLY transaction (`server.ts`). The database itself refuses
 *                every write there: pg_net, the worker's bookkeeping functions, a data-modifying
 *                CTE. The guard only keeps it to one select and refuses the few functions that
 *                act on the session rather than on rows.
 *
 *   write        one statement of the writer's, run inside the transaction the server opens for an
 *                item. Here the guard is an ALLOW-list on real tokens, not a deny-list on text:
 *                the statement is an insert or an update on one of the skill's tables, or a call of
 *                raise_attention, and every name that is called must be one the list holds. A
 *                function the list does not hold is refused by name, whatever it is, so a new way
 *                to reach outside the database is refused without being known here first.
 *
 * The text is read by `lexer.ts`, as the server's lexer reads it. What that cannot read is refused.
 */

import { lex, statements, type Token } from './lexer.js';

export type SqlVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export const SQL_MAX_CHARS = 20_000;

/** Tables the writer inserts into, and the wider set it updates (`courses` for group_notes; 181 grants that column alone). */
export const INSERT_TABLES: readonly string[] = ['assignments', 'assignment_progress', 'course_staff'];
export const UPDATE_TABLES: readonly string[] = [...INSERT_TABLES, 'courses'];
const RAISE = 'raise_attention';

/** Schemas no statement names. The role has usage on `net` alone among them; the rest are refused on principle. */
const FORBIDDEN_SCHEMAS = new Set([
  'net', 'vault', 'storage', 'auth', 'extensions', 'pgsodium', 'cron', 'realtime', 'graphql', 'graphql_public',
  'supabase_functions', 'supabase_migrations', 'pgbouncer', 'pg_catalog', 'information_schema', 'pg_temp', 'pg_toast',
]);

/** What a read may not call: functions that act on the session or run a query given as text. */
const QUERY_DENIED = /^(pg_sleep.*|pg_advisory.*|pg_try_advisory.*|set_config|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|query_to_xml.*|cursor_to_xml.*|table_to_xml.*|schema_to_xml.*|database_to_xml.*|ts_stat|ts_rewrite|dblink.*|lo_.*|pg_read_.*|pg_ls_.*|pg_stat_file|http.*)$/;

/** Functions a write statement may call. */
const WRITE_FUNCTIONS = new Set([
  RAISE,
  'now', 'clock_timestamp', 'current_date', 'coalesce', 'nullif', 'greatest', 'least',
  'lower', 'upper', 'initcap', 'btrim', 'ltrim', 'rtrim', 'trim', 'concat', 'concat_ws', 'format', 'length', 'char_length',
  'replace', 'substring', 'substr', 'left', 'right', 'split_part', 'regexp_replace', 'position', 'overlay', 'strpos',
  'to_char', 'to_timestamp', 'to_date', 'to_number', 'date_trunc', 'make_date', 'make_timestamptz', 'extract', 'age', 'timezone',
  'round', 'abs', 'ceil', 'floor', 'trunc',
  'jsonb_build_object', 'jsonb_build_array', 'to_jsonb', 'jsonb_set', 'jsonb_strip_nulls',
  'array_append', 'array_remove', 'array_length', 'unnest',
  'max', 'min', 'count', 'sum', 'string_agg', 'array_agg', 'bool_or', 'bool_and',
]);

/** Keywords and type names that are followed by `(` without being a call. */
const PAREN_WORDS = new Set([
  'values', 'in', 'exists', 'any', 'all', 'some', 'select', 'from', 'where', 'and', 'or', 'not', 'on', 'as', 'when', 'then', 'else',
  'case', 'set', 'using', 'returning', 'by', 'having', 'limit', 'offset', 'between', 'like', 'ilike', 'is', 'distinct', 'filter',
  'over', 'conflict', 'cast', 'array', 'row', 'join', 'union', 'except', 'intersect', 'with', 'lateral',
  'numeric', 'decimal', 'varchar', 'char', 'character', 'timestamp', 'timestamptz', 'time', 'interval', 'bit', 'float',
]);

/**
 * Words that never appear in what the writer sends, wherever they stand. Short on purpose: the
 * statement's first word and the call list already decide what it is, and `do` is not here because
 * an upsert reads `on conflict (...) do update`.
 */
const WRITE_DENIED_WORDS = new Set(['delete', 'truncate', 'merge', 'copy', 'grant', 'revoke', 'create', 'alter', 'drop']);

const deny = (reason: string): SqlVerdict => ({ ok: false, reason });

const isSymbol = (token: Token | undefined, text: string): boolean => token?.kind === 'symbol' && token.text === text;
/** True for the keyword `text`: an unquoted word of that name. */
const isWord = (token: Token | undefined, text: string): boolean => token?.kind === 'word' && token.text === text && token.quoted !== true;

/** The one statement of the text as tokens, or the reason there is not exactly one readable statement. */
function oneStatement(sql: unknown): { readonly tokens: readonly Token[] } | { readonly reason: string } {
  if (typeof sql !== 'string' || sql.trim() === '') return { reason: 'sql must be non-empty text' };
  if (sql.length > SQL_MAX_CHARS) return { reason: `sql is longer than ${SQL_MAX_CHARS} characters` };
  const lexed = lex(sql);
  if (!lexed.ok) return { reason: lexed.reason };
  const parts = statements(lexed.tokens);
  if (parts.length === 0) return { reason: 'sql holds no statement' };
  if (parts.length > 1) return { reason: 'one statement at a time' };
  return { tokens: parts[0]! };
}

/** The first name of a forbidden schema that is used as a qualifier (`net.x`), or null. */
function forbiddenSchema(tokens: readonly Token[]): string | null {
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i]!;
    if (token.kind === 'word' && FORBIDDEN_SCHEMAS.has(token.text) && isSymbol(tokens[i + 1], '.')) return token.text;
  }
  return null;
}

/** Every name directly followed by `(`, with the index it stands at and its qualifier when it has one. */
function calls(tokens: readonly Token[]): { readonly name: Token; readonly at: number; readonly qualifier: string | null }[] {
  const found = [];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const token = tokens[i]!;
    if (token.kind !== 'word' || !isSymbol(tokens[i + 1], '(')) continue;
    const qualified = isSymbol(tokens[i - 1], '.') && tokens[i - 2]?.kind === 'word';
    found.push({ name: token, at: i, qualifier: qualified ? tokens[i - 2]!.text : null });
  }
  return found;
}

/** Whether the query tool may run this text: one select, nothing that acts on the session. */
export function checkQuery(sql: unknown): SqlVerdict {
  const read = oneStatement(sql);
  if ('reason' in read) return deny(read.reason);
  const { tokens } = read;
  const lead = tokens[0]!;
  if (!isWord(lead, 'select') && !isWord(lead, 'with')) {
    return deny(`the query tool runs one select; this starts with "${lead.text.slice(0, 20)}"`);
  }
  const schema = forbiddenSchema(tokens);
  if (schema !== null) return deny(`sql names the schema ${schema}; only public is used`);
  for (const call of calls(tokens)) {
    if (QUERY_DENIED.test(call.name.text)) return deny(`sql calls ${call.name.text}, which is not allowed`);
  }
  return { ok: true };
}

/** The table a write statement targets, with the index of its name, or null when the statement has no such shape. */
function target(tokens: readonly Token[], after: number): { readonly table: string; readonly at: number } | null {
  let at = after;
  if (isWord(tokens[at], 'public') && isSymbol(tokens[at + 1], '.')) at += 2;
  const name = tokens[at];
  return name?.kind === 'word' ? { table: name.text, at } : null;
}

/** Whether the writer may run this statement inside an item's transaction. */
export function checkWrite(sql: unknown): SqlVerdict {
  const read = oneStatement(sql);
  if ('reason' in read) return deny(read.reason);
  const { tokens } = read;
  const lead = tokens[0]!;

  let tableAt = -1;
  if (isWord(lead, 'insert')) {
    if (!isWord(tokens[1], 'into')) return deny('an insert must read: insert into <table> ...');
    const into = target(tokens, 2);
    if (into === null || !INSERT_TABLES.includes(into.table)) return deny(`an insert goes into one of: ${INSERT_TABLES.join(', ')}`);
    tableAt = into.at;
  } else if (isWord(lead, 'update')) {
    const updated = target(tokens, 1);
    if (updated === null || !UPDATE_TABLES.includes(updated.table)) return deny(`an update is on one of: ${UPDATE_TABLES.join(', ')}`);
    tableAt = updated.at;
  } else if (isWord(lead, 'select')) {
    const called = target(tokens, 1);
    if (called === null || called.table !== RAISE || !isSymbol(tokens[called.at + 1], '(')) {
      return deny(`the only select a write may be is: select ${RAISE}(...); read with the query tool`);
    }
  } else {
    return deny(`a write statement is an insert, an update, or select ${RAISE}(...); this starts with "${lead.text.slice(0, 20)}"`);
  }

  for (const token of tokens) {
    if (token.kind === 'word' && token.quoted !== true && WRITE_DENIED_WORDS.has(token.text)) return deny(`"${token.text}" is not part of a write statement`);
  }
  const schema = forbiddenSchema(tokens);
  if (schema !== null) return deny(`sql names the schema ${schema}; only public is used`);

  for (const call of calls(tokens)) {
    // `insert into assignments (id, ...)`: the table's name before its column list is not a call.
    if (call.at === tableAt) continue;
    if (call.qualifier !== null && call.qualifier !== 'public') return deny(`sql calls ${call.qualifier}.${call.name.text}; only public's functions are called`);
    if (call.name.quoted !== true && call.qualifier === null && PAREN_WORDS.has(call.name.text)) continue;
    if (!WRITE_FUNCTIONS.has(call.name.text)) return deny(`sql calls ${call.name.text}, which a write statement may not call`);
  }
  return { ok: true };
}
