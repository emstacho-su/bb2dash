/**
 * A tokenizer for the SQL the two tools accept (Phase 23, review round 1). Pure.
 *
 * The first guard masked strings and comments with regular expressions and did not read SQL the
 * way Postgres does: a `$` inside an identifier opened a "dollar quote", a quote inside a quoted
 * identifier opened a "string", and a backslash was treated as an escape in a standard string. Each
 * hid the rest of the statement from the rules. This reads the text as the server's lexer does
 * (standard_conforming_strings on), and refuses what it does not read rather than guess:
 *
 *   comments        `--` to the end of the line, and nested block comments: dropped
 *   strings         '...' with '' for a quote, no backslash escapes; E'...' with them; $tag$...$tag$
 *   identifiers     words, lower-cased; "quoted" ones with "" for a quote, lower-cased too (the
 *                   rules compare names, and refusing a mixed-case spelling of a forbidden name
 *                   is the safe side)
 *   refused         U&'...' and U&"..." (Unicode escapes spell any name), a `$1` parameter, a NUL,
 *                   and anything never closed
 */

export type TokenKind = 'word' | 'string' | 'number' | 'symbol';

export interface Token {
  readonly kind: TokenKind;
  /** A word: its name, lower-cased. A symbol: the character(s). A string or number: a placeholder. */
  readonly text: string;
  /** True for a "quoted" identifier, which is never a keyword. */
  readonly quoted?: boolean;
}

export type LexResult = { readonly ok: true; readonly tokens: readonly Token[] } | { readonly ok: false; readonly reason: string };

const WORD_START = /[A-Za-z_\u0080-￿]/;
const WORD_PART = /[A-Za-z0-9_$\u0080-￿]/;
const DIGIT = /[0-9]/;
const SPACE = /\s/;
const DOLLAR_TAG = /^\$(?:[A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/;
const NUMBER = /^[0-9]+(?:\.[0-9]*)?(?:[eE][+-]?[0-9]+)?/;
/** Two-character symbols the rules care to keep whole. */
const DOUBLE_SYMBOLS = new Set(['::', '->', '>=', '<=', '<>', '!=', '||', '=>']);

const fail = (reason: string): LexResult => ({ ok: false, reason });

/** The index just past a block comment that opens at `start`, nesting included; -1 when it never closes. */
function endOfBlockComment(sql: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '/*') {
      depth += 1;
      i += 2;
    } else if (two === '*/') {
      depth -= 1;
      i += 2;
      if (depth === 0) return i;
    } else i += 1;
  }
  return -1;
}

/** The index just past a quoted run that opens at `start` with `quote`; -1 when it never closes. */
function endOfQuoted(sql: string, start: number, quote: string, backslashEscapes: boolean): number {
  let i = start + 1;
  while (i < sql.length) {
    const ch = sql[i];
    if (backslashEscapes && ch === '\\') i += 2;
    else if (ch === quote && sql[i + 1] === quote) i += 2;
    else if (ch === quote) return i + 1;
    else i += 1;
  }
  return -1;
}

/** The statement's tokens, or why the text was not read. */
export function lex(sql: string): LexResult {
  if (sql.includes('\u0000')) return fail('sql holds a NUL character');
  const tokens: Token[] = [];
  let i = 0;
  /** True when the previous token ended exactly where this one starts (no space or comment between). */
  let adjacent = false;

  while (i < sql.length) {
    const ch = sql[i]!;
    const two = sql.slice(i, i + 2);

    if (SPACE.test(ch)) {
      i += 1;
      adjacent = false;
      continue;
    }
    if (two === '--') {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      adjacent = false;
      continue;
    }
    if (two === '/*') {
      const end = endOfBlockComment(sql, i);
      if (end === -1) return fail('a comment is never closed');
      i = end;
      adjacent = false;
      continue;
    }

    const previous = tokens[tokens.length - 1];
    const prefix = adjacent && previous?.kind === 'word' && previous.quoted !== true ? previous.text : null;

    if (ch === "'" || ch === '"') {
      // `U&` directly before a quote: the token before is the symbol `&`, itself directly after the word `u`.
      const before = tokens[tokens.length - 2];
      if (adjacent && previous?.kind === 'symbol' && previous.text === '&' && before?.kind === 'word' && before.text === 'u') {
        return fail('a Unicode-escaped string or identifier (U&) is not accepted');
      }
      if (ch === "'") {
        const end = endOfQuoted(sql, i, "'", prefix === 'e');
        if (end === -1) return fail('a string is never closed');
        // The prefix letter (E, B, X, N) is part of the literal, not a name.
        if (prefix !== null && ['e', 'b', 'x', 'n'].includes(prefix)) tokens.pop();
        tokens.push({ kind: 'string', text: "''" });
        i = end;
      } else {
        const end = endOfQuoted(sql, i, '"', false);
        if (end === -1) return fail('a quoted identifier is never closed');
        const name = sql.slice(i + 1, end - 1).replace(/""/g, '"');
        if (name === '') return fail('an empty quoted identifier');
        tokens.push({ kind: 'word', text: name.toLowerCase(), quoted: true });
        i = end;
      }
      adjacent = true;
      continue;
    }

    if (ch === '$') {
      const tag = DOLLAR_TAG.exec(sql.slice(i))?.[0];
      if (tag !== undefined) {
        const end = sql.indexOf(tag, i + tag.length);
        if (end === -1) return fail('a dollar-quoted string is never closed');
        tokens.push({ kind: 'string', text: "''" });
        i = end + tag.length;
        adjacent = true;
        continue;
      }
      if (DIGIT.test(sql[i + 1] ?? '')) return fail('a $n parameter is not accepted: write the value');
      return fail('a stray $ is not accepted');
    }

    if (WORD_START.test(ch)) {
      let end = i + 1;
      while (end < sql.length && WORD_PART.test(sql[end]!)) end += 1;
      tokens.push({ kind: 'word', text: sql.slice(i, end).toLowerCase() });
      i = end;
      adjacent = true;
      continue;
    }

    if (DIGIT.test(ch)) {
      const number = NUMBER.exec(sql.slice(i))![0];
      tokens.push({ kind: 'number', text: '0' });
      i += number.length;
      adjacent = true;
      continue;
    }

    const symbol = DOUBLE_SYMBOLS.has(two) ? two : ch;
    tokens.push({ kind: 'symbol', text: symbol });
    i += symbol.length;
    adjacent = true;
  }
  return { ok: true, tokens };
}

/** The tokens split into statements on `;`, empty ones dropped. */
export function statements(tokens: readonly Token[]): Token[][] {
  const out: Token[][] = [];
  let current: Token[] = [];
  for (const token of tokens) {
    if (token.kind === 'symbol' && token.text === ';') {
      if (current.length > 0) out.push(current);
      current = [];
    } else current.push(token);
  }
  if (current.length > 0) out.push(current);
  return out;
}
