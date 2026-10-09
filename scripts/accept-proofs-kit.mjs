// bb2dash :: scripts/accept-proofs-kit.mjs
// What the test files of the proofs script share: the packs as the working tree has them (Phase 21's
// and Phase 23's), a command line for one proof, the face of the in-process database, and what the
// migrations say a table's or a view's columns are. No test here.

import fs from 'node:fs';
import path from 'node:path';

export const REPO = path.resolve(import.meta.dirname, '..');
const readPack = (phase) => JSON.parse(fs.readFileSync(path.join(REPO, 'acceptance', phase, 'proofs.json'), 'utf8'));
export const PACK_21 = readPack('21');
export const PACK_23 = readPack('23');
export const SHA = '4ed9eee0c1a2b3c4d5e6f708192a3b4c5d6e7f80';

/** The command line of one proof of a phase: `<phase> <name> --sha <commit> --param key=value …`. */
export const argvForPhase = (phase, name, params = {}) => [
  phase,
  name,
  '--sha',
  SHA,
  ...Object.entries(params).flatMap(([key, value]) => ['--param', `${key}=${value}`]),
];

/** The command line of one proof of Phase 21's pack. */
export const argvFor = (name, params = {}) => argvForPhase('21', name, params);

/**
 * The in-process database behind a pg.Client's face. A query is sent the way node-postgres sends
 * it: by the extended protocol when it is asked for (`queryMode: 'extended'`) or has values, and
 * by the simple protocol, where one text may hold several statements, when it is a bare text.
 */
export function clientOn(database) {
  return {
    async connect() {},
    async end() {},
    async query(first, second) {
      const asked = typeof first === 'string' ? { text: first, values: second } : first;
      const extended = asked.queryMode === 'extended' || (asked.values ?? []).length > 0;
      if (extended) return database.query(asked.text, asked.values ?? []);
      const results = await database.exec(asked.text);
      return results.length === 1 ? results[0] : results;
    },
  };
}

const MIGRATIONS = path.join(REPO, 'db', 'migrations');
const NOT_A_COLUMN = new Set(['constraint', 'check', 'unique', 'primary', 'foreign', 'references', 'exclude', 'like']);
const WORD_CHARACTER = /[A-Za-z0-9_]/;

const migrationTexts = () =>
  fs.readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort().map((file) => fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));

/** The end of the string literal that opens at `from` (just past its closing quote); doubled quotes stay inside. */
function endOfLiteral(sql, from) {
  let i = from + 1;
  while (i < sql.length) {
    if (sql[i] !== "'") i += 1;
    else if (sql[i + 1] === "'") i += 2;
    else return i + 1;
  }
  return sql.length;
}

/** The text with every `--` comment taken out, read past string literals (a quote inside a comment opens nothing). */
function withoutComments(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "'") {
      const end = endOfLiteral(sql, i);
      out += sql.slice(i, end);
      i = end;
    } else if (sql[i] === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

/** The items of the select list that opens at `from`, up to the top-level `from`: split at top-level commas. */
function selectItems(sql, from) {
  const items = [];
  let depth = 0;
  let start = from;
  let i = from;
  while (i < sql.length) {
    const character = sql[i];
    if (character === "'") {
      i = endOfLiteral(sql, i);
      continue;
    }
    if (character === '(') depth += 1;
    else if (character === ')') depth -= 1;
    else if (depth === 0 && character === ',') {
      items.push(sql.slice(start, i));
      start = i + 1;
    } else if (depth === 0 && /^from\b/i.test(sql.slice(i, i + 5)) && !WORD_CHARACTER.test(sql[i - 1] ?? ' ')) {
      break;
    }
    i += 1;
  }
  items.push(sql.slice(start, i));
  return items;
}

/** The name a select item gives its column: its `as <name>`, else the last name of a plain `alias.column`. */
function nameOfItem(item) {
  const text = item.trim();
  return /\bas\s+([a-z_][a-z0-9_]*)\s*$/i.exec(text)?.[1] ?? /([a-z_][a-z0-9_]*)\s*$/i.exec(text)?.[1] ?? null;
}

/** The columns of a view, as a migration's `create [or replace] view <name> … as select …` gives them. */
function viewColumnsIn(sql, view) {
  const head = new RegExp(`create (?:or replace )?view (?:public\\.)?${view}\\b`, 'i').exec(sql);
  if (head === null) return [];
  const text = withoutComments(sql.slice(head.index));
  const select = /\bas\s+select\b/i.exec(text);
  if (select === null) return [];
  return selectItems(text, select.index + select[0].length).map(nameOfItem).filter((name) => name !== null);
}

/** The columns the migrations give a table or a view: a `create table` block, every `add column`, a view's select list. */
export function columnsOf(table) {
  const columns = new Set();
  for (const sql of migrationTexts()) {
    const created = new RegExp(`^create table (?:if not exists )?(?:public\\.)?${table} \\(\\r?\\n([\\s\\S]*?)^\\);`, 'm').exec(sql);
    for (const line of created ? created[1].split(/\r?\n/) : []) {
      const word = /^\s+([a-z_][a-z0-9_]*)\s/.exec(line)?.[1];
      if (word && !NOT_A_COLUMN.has(word)) columns.add(word);
    }
    for (const statement of sql.matchAll(new RegExp(`alter table (?:only )?(?:if exists )?(?:public\\.)?${table}\\b([^;]*);`, 'g'))) {
      for (const match of statement[1].matchAll(/add column (?:if not exists )?([a-z_][a-z0-9_]*)/g)) columns.add(match[1]);
    }
    for (const name of viewColumnsIn(sql, table)) columns.add(name);
  }
  return columns;
}
