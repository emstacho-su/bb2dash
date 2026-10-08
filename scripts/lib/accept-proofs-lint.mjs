// bb2dash :: scripts/lib/accept-proofs-lint.mjs
// The lint of one proof statement (acceptance/README.md, "The rules every pack is held to").
//
// The server is the first lock: the statement goes by the extended protocol, which takes one
// statement, inside a read-only transaction (scripts/accept-proofs.mjs). This lint is the second,
// and it reads the statement the way a reviewer would. It also covers what a read-only
// transaction allows: a setting changed, a backend signalled, an advisory lock taken, a secret or
// a message's text read out.
//
// A lint is only worth its rules when it reads the same text the server does. So before any rule
// about words, it refuses everything that could make the two read differently: a double-quoted
// name, a comment, a backslash, and a "$" that is not a parameter. What is left is plain words
// and string literals, and the literals are emptied before the words are read.

import { TEXT_NAMES } from './accept-proofs-shapes.mjs';

/** Words a read never needs. Each is matched whole, so `updated_at` is not `update`. */
const WRITE_WORDS = [
  'insert', 'update', 'delete', 'merge', 'truncate', 'alter', 'drop', 'create', 'grant', 'revoke', 'copy', 'call', 'do',
  'set', 'reset', 'commit', 'begin', 'start', 'rollback', 'savepoint', 'release', 'prepare', 'execute', 'deallocate',
  'listen', 'notify', 'unlisten', 'vacuum', 'analyze', 'cluster', 'reindex', 'refresh', 'lock', 'comment', 'security',
  'load', 'discard', 'into', 'share',
];
/** Functions that act: settings, sequences, the server's own controls, large objects, other servers. */
const ACTING_FUNCTION = /\b(set_config|nextval|setval|currval|pg_[a-z0-9_]*|lo_[a-z0-9_]*|dblink[a-z0-9_]*)\b/i;
/** Schemas a proof has no business in: the network, the secrets, the logins, the scheduler. */
const OTHER_SCHEMA = /\b(net|vault|auth|storage|realtime|cron|pgsodium|extensions|supabase_functions|graphql|pg_catalog|information_schema)\s*\./i;

/**
 * The two ways a statement may name a column of TEXT_NAMES without reading its text out: the md5
 * of a message's text, to hold against the md5 it was given; and a title held against a literal.
 */
const ALLOWED_TEXT_USES = [/\bmd5\(\s*[a-z_][a-z0-9_]*\.content\s*\)/gi, /\b[a-z_][a-z0-9_]*\.title\s*=\s*'[^']*'/gi];

const NAME_CHARACTER = /[A-Za-z0-9_$]/;
const PARAMETER_AT_START = /^\$[0-9]+(?![A-Za-z0-9_$])/;

const wordIn = (words, text) => words.find((word) => new RegExp(`\\b${word}\\b`, 'i').test(text)) ?? null;

/** Where the string literal that opens at `from` ends (just past its closing quote), or -1 when it never closes. */
function endOfLiteral(sql, from) {
  let i = from + 1;
  while (i < sql.length) {
    if (sql[i] !== "'") i += 1;
    else if (sql[i + 1] === "'") i += 2;
    else return i + 1;
  }
  return -1;
}

/**
 * The statement with each string literal emptied: `{ code }`. Or `{ rule }`, when it holds
 * something the server could read another way than this lint does:
 *
 *   "name"     a quoted name hides the name from every rule about words;
 *   -- or /*   the server ends a comment where a scanner may not (a lone carriage return);
 *   \          inside an E'' literal a backslash can hide the closing quote;
 *   $          `x$y$` is a name to the server and the start of a quoted body to a scanner.
 */
function readStatement(sql) {
  if (sql.includes('\\')) return { rule: 'a proof holds no backslash' };
  let code = '';
  let i = 0;
  while (i < sql.length) {
    const character = sql[i];
    if (character === "'") {
      const end = endOfLiteral(sql, i);
      if (end === -1) return { rule: 'a string literal is never closed' };
      code += "''";
      i = end;
    } else if (character === '"') {
      return { rule: 'a proof holds no double-quoted name: a name is written plain, so every rule can read it' };
    } else if ((character === '-' && sql[i + 1] === '-') || (character === '/' && sql[i + 1] === '*')) {
      return { rule: 'a proof holds no comment: what it is for is said in "expect"' };
    } else if (character === '$') {
      const parameter = PARAMETER_AT_START.exec(sql.slice(i))?.[0];
      if (parameter === undefined || NAME_CHARACTER.test(sql[i - 1] ?? '')) {
        return { rule: 'a "$" is only ever a parameter ($1, $2): no dollar-quoted text, and no "$" inside a name' };
      }
      code += parameter;
      i += parameter.length;
    } else {
      code += character;
      i += 1;
    }
  }
  return { code };
}

function placeholderRule(code, paramCount) {
  const used = new Set([...code.matchAll(/\$(\d+)/g)].map((match) => Number(match[1])));
  const beyond = [...used].find((n) => n < 1 || n > paramCount);
  if (beyond !== undefined) return `the statement uses $${beyond}, and the proof declares ${paramCount} parameter(s)`;
  for (let n = 1; n <= paramCount; n += 1) {
    if (!used.has(n)) return `the statement does not use $${n}: every declared parameter is bound`;
  }
  return null;
}

/** The first name of TEXT_NAMES the statement uses outside the two allowed uses, or null. Read in the raw text: a json key is a literal. */
function textNameIn(raw) {
  const rest = ALLOWED_TEXT_USES.reduce((text, allowedUse) => text.replace(allowedUse, ' '), raw);
  return wordIn(TEXT_NAMES, rest);
}

/** Lint one proof statement. Returns null when it is one plain read, or the rule it broke. */
export function lintProofSql(sql, paramCount) {
  const raw = String(sql ?? '');
  const { code, rule } = readStatement(raw);
  if (rule !== undefined) return rule;
  const statements = code.split(';').map((part) => part.trim()).filter((part) => part.length > 0);
  if (statements.length === 0) return 'no statement found';
  if (statements.length > 1) return `a proof is one statement, and this is ${statements.length}`;
  if (!/^(select|with)\b/i.test(statements[0])) return 'a proof must start with select or with';
  const write = wordIn(WRITE_WORDS, code);
  if (write !== null) return `a proof only reads: the word "${write}" is not allowed`;
  const acting = ACTING_FUNCTION.exec(code);
  if (acting !== null) return `a proof calls no function that acts: ${acting[1]} (pg_*, lo_*, dblink*, set_config and the sequence functions are refused)`;
  const schema = OTHER_SCHEMA.exec(code);
  if (schema !== null) return `a proof reads schema public only, not schema "${schema[1].toLowerCase()}"`;
  const text = textNameIn(raw);
  if (text !== null) {
    return `a proof never reads text out: the word "${text}" is not allowed (but for md5(<alias>.content), and <alias>.title = '<a literal>')`;
  }
  return placeholderRule(code, paramCount);
}
