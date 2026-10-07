/**
 * The SQL guard (Phase 23): what text the two SQL tools accept. Pure.
 *
 * The boundary is the database's: the role `inbox_apply_runner` can read and write only what
 * migration 181 grants, and a write that names no answered Inbox item is refused there. This guard
 * is the second line, for what a grant cannot express:
 *   * `net.http_post` and its neighbours are executable by PUBLIC on this platform and cannot be
 *     revoked by the project's owner, so a SQL session could post what it reads to any host. No
 *     statement may name another schema's functions, change the search path, or name an HTTP,
 *     dblink, file or large-object function.
 *   * the worker's own bookkeeping functions (claim, prepare, close, run_facts) and its write log
 *     are not Claude's to call or write.
 *   * a statement must be one of the few kinds a run needs.
 *
 * The check is on the text with comments and string contents removed, so a quoted answer that
 * mentions `net.` is fine and a forbidden name cannot hide inside a comment. It is a deny rule on
 * text, not a parser: when in doubt it refuses.
 */

export type SqlMode = 'query' | 'execute';
export type SqlVerdict = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export const SQL_MAX_CHARS = 20_000;

const QUERY_LEADS = new Set(['select', 'with']);
const EXECUTE_LEADS = new Set(['select', 'with', 'insert', 'update', 'begin', 'commit', 'rollback']);

/** Schemas whose objects no statement may name. `public` and unqualified names are the only ones used. */
const FORBIDDEN_SCHEMAS = [
  'net', 'vault', 'storage', 'auth', 'extensions', 'pgsodium', 'cron', 'realtime', 'graphql', 'graphql_public',
  'supabase_functions', 'supabase_migrations', 'pgbouncer', 'pg_catalog', 'information_schema', 'pg_temp', 'pg_toast',
];
const FORBIDDEN_SCHEMA = new RegExp(`\\b(${FORBIDDEN_SCHEMAS.join('|')})\\s*\\.`);

/** Functions that reach outside the database, read files, or change the session. */
const FORBIDDEN_FUNCTION =
  /\b(http_get|http_post|http_put|http_patch|http_delete|http_head|http_collect_response|http|dblink\w*|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|lo_import|lo_export|lo_get|lo_put|pg_sleep|set_config|pg_terminate_backend|pg_cancel_backend|pg_reload_conf|query_to_xml|xpath)\s*\(/;

/**
 * The worker's own functions and table, and the sync runner's functions: bookkeeping Claude does
 * not do. The table `sync_runs` is read (the latest run id, for raise_attention), so only a call
 * of a `sync_` function is refused.
 */
const WORKER_ONLY =
  /\b(inbox_apply_claim|inbox_apply_prepare|inbox_apply_close|inbox_apply_run_facts|inbox_apply_is_own_claim|inbox_apply_log_write|inbox_apply_writes|apply_resolutions|archive_attention_item)\b|\b(sync_\w+)\s*\(/;

const SESSION_WORDS = /\b(search_path|session_authorization|pg_read_all_data|pg_write_all_data)\b/;

const deny = (reason: string): SqlVerdict => ({ ok: false, reason });

/**
 * The text with comments removed and every string's contents emptied, lower-cased, and with the
 * double quotes of quoted identifiers dropped (`"net".http_post` reads as `net.http_post`).
 * Null when a string or a comment is never closed.
 */
export function maskSql(sql: string): string | null {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    const ch = sql[i]!;
    if (two === '--') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
    } else if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) return null;
      out += ' ';
      i = end + 2;
    } else if (ch === "'") {
      // A standard or E'' string: '' and \' both stay inside it.
      let j = i + 1;
      for (;;) {
        if (j >= sql.length) return null;
        if (sql[j] === '\\') j += 2;
        else if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j += 1;
      }
      out += "''";
      i = j + 1;
    } else if (ch === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))?.[0];
      if (tag === undefined) {
        out += ch;
        i += 1;
      } else {
        const end = sql.indexOf(tag, i + tag.length);
        if (end === -1) return null;
        out += "''";
        i = end + tag.length;
      }
    } else if (ch === '"') {
      i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out.toLowerCase();
}

/** The statements of masked text: split on `;`, blank ones dropped. */
function statements(masked: string): string[] {
  return masked
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/** Whether the tool may run this text. `query` is one read statement; `execute` is a writer's batch. */
export function checkSql(sql: unknown, mode: SqlMode): SqlVerdict {
  if (typeof sql !== 'string' || sql.trim() === '') return deny('sql must be non-empty text');
  if (sql.length > SQL_MAX_CHARS) return deny(`sql is longer than ${SQL_MAX_CHARS} characters`);
  if (sql.includes('\u0000')) return deny('sql holds a NUL character');

  const masked = maskSql(sql);
  if (masked === null) return deny('sql holds a string or a comment that is never closed');

  const parts = statements(masked);
  if (parts.length === 0) return deny('sql holds no statement');
  if (mode === 'query' && parts.length !== 1) return deny('the query tool runs one statement; use one select');

  const leads = mode === 'query' ? QUERY_LEADS : EXECUTE_LEADS;
  for (const part of parts) {
    const lead = /^[a-z]+/.exec(part)?.[0] ?? '';
    if (!leads.has(lead)) {
      return deny(`a statement starts with "${lead || part.slice(0, 12)}"; allowed here: ${[...leads].join(', ')}`);
    }
  }

  const schema = FORBIDDEN_SCHEMA.exec(masked);
  if (schema) return deny(`sql names the schema ${schema[1]}; only public is used`);
  const fn = FORBIDDEN_FUNCTION.exec(masked);
  if (fn) return deny(`sql calls ${fn[1]}, which is not allowed`);
  const worker = WORKER_ONLY.exec(masked);
  if (worker) return deny(`sql names ${worker[1] ?? worker[2]}, which is not Claude's to use`);
  const session = SESSION_WORDS.exec(masked);
  if (session) return deny(`sql names ${session[1]}, which is not allowed`);
  if (mode === 'query' && /\b(insert|update|delete|into|inbox_apply_begin_item|inbox_apply_archive|raise_attention|nextval|setval)\b/.test(masked)) {
    return deny('the query tool only reads; writes go through the writer');
  }
  if (/\bdelete\b|\btruncate\b|\bmerge\b/.test(masked)) return deny('rows are never deleted or merged here');
  return { ok: true };
}
