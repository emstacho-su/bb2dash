/**
 * The token audit's scanner (Phase 22, tasks 1 and 2; P-15, P-16, R-53).
 *
 * Pure: a path and a source string in, facts out. It reads no file and imports
 * nothing. It is written by hand because D-19 rules out stylelint, postcss and
 * css-tree, and because a regex over raw text cannot tell a comment from code
 * or a JSX apostrophe from a string. So it holds two small readers:
 *
 *   * CSS: comments blanked, then every declaration with its selector, the
 *     at-rules around it, its property and its value;
 *   * TypeScript and TSX: a lexer that knows comments, strings, template
 *     literals, regex literals and JSX (tags, attributes, children), so a
 *     string is a string and a `style=` is an attribute.
 *
 * `token-audit.test.ts` owns the rules about what a count means: the cluster
 * map, the baselines and what is let through. This file only finds things.
 */

/* ---------------------------------------------------------------------------
 * What a scan returns
 * ------------------------------------------------------------------------ */

/** Which of the audit's four counted rules a finding falls under. */
export type FindingRule = 'colour' | 'color-mix' | 'size' | 'style-key';

/** One thing the audit counts: a literal that is not a token. */
export interface Finding {
  rule: FindingRule;
  /** 1-based line in the scanned source. */
  line: number;
  /** The literal as written, or the inline style key. */
  text: string;
}

/** One `var(--name)` use outside a comment. */
export interface Reference {
  name: string;
  line: number;
}

/** What one source file holds, as far as the audit is concerned. */
export interface FileScan {
  findings: readonly Finding[];
  references: readonly Reference[];
  /** Custom properties this file declares: a CSS declaration, or a TSX inline style key. */
  declared: readonly string[];
}

/** A declaration named by its rule's whole selector, its property and its whole value. */
export interface DeclarationKey {
  selector: string;
  property: string;
  value: string;
}

/** What the caller lets through for one file. Each list counts 0 what it names. */
export interface Allowance {
  /** Size literals, sign ignored: `1px` also lets `-1px` through. */
  sizes?: readonly string[];
  /** Declarations of top-level rules, each let through whole. */
  declarations?: readonly DeclarationKey[];
  /** Colour strings in TypeScript, compared without case. */
  colours?: readonly string[];
  /** TSX inline style keys. */
  styleKeys?: readonly string[];
}

/** A `var(--name)` that nothing declares. */
export interface UnresolvedReference extends Reference {
  path: string;
}

/** One CSS declaration, with where it sits. */
export interface CssDeclaration {
  /** The rule's selector, whitespace collapsed. Straight inside an at-rule, that at-rule's prelude. */
  selector: string;
  /** The at-rules around the rule, outermost first, e.g. `@media (max-width: 720px)`. */
  at: readonly string[];
  property: string;
  /** The value, whitespace collapsed. */
  value: string;
  /** The value as written, and the offset it starts at. */
  rawValue: string;
  valueOffset: number;
}

/** One at-rule: `@media (max-width: 720px)` is `media` and `(max-width: 720px)`. */
export interface CssAtRule {
  name: string;
  prelude: string;
}

export interface ParsedCss {
  declarations: readonly CssDeclaration[];
  atRules: readonly CssAtRule[];
}

/* ---------------------------------------------------------------------------
 * Shared
 * ------------------------------------------------------------------------ */

/** A finding or a reference, with the offset that orders it. */
interface Located<T> {
  offset: number;
  item: T;
}

const squash = (text: string): string => text.trim().replace(/\s+/g, ' ');

const lineOf = (source: string, offset: number): number => source.slice(0, offset).split('\n').length;

function inOrder<T>(located: readonly Located<T>[]): T[] {
  return [...located].sort((a, b) => a.offset - b.offset).map(({ item }) => item);
}

/** `1px`, `-1px` and `+1.0PX` are one size: the sign and the spelling drop out. */
function sizeKey(literal: string): string {
  const match = /^[+-]?([\d.]+)([a-z]+)$/i.exec(literal.trim());
  return match ? `${Number(match[1])}${match[2].toLowerCase()}` : literal.trim().toLowerCase();
}

/* ---------------------------------------------------------------------------
 * Colours
 * ------------------------------------------------------------------------ */

/** The colour functions the audit names. `color-mix()` is its own rule. */
const COLOUR_FUNCTIONS: ReadonlySet<string> = new Set([
  'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch',
]);

/**
 * The CSS named colours (CSS Color 4, 148 names). `transparent`,
 * `currentColor`, `inherit`, `initial`, `unset` and `revert` are not in it and
 * are never counted.
 */
const NAMED_COLOURS: ReadonlySet<string> = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
    'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
    'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
    'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
    'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
    'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
    'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
    'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise ' +
    'mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab ' +
    'orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru ' +
    'pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
    'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan ' +
    'teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' '),
);

/**
 * Properties whose identifiers are names the author chose (a class, a
 * keyframe, a font, a grid area), so a word there is never read as a colour.
 */
const NAME_VALUED_PROPERTIES: ReadonlySet<string> = new Set([
  'composes', 'animation', 'animation-name', 'font', 'font-family', 'grid-area', 'container', 'container-name',
]);

const HEX_COLOUR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Whether a whole TypeScript string is a colour: a hex, a colour function or a named colour. */
function isColourText(text: string): boolean {
  const trimmed = text.trim();
  if (HEX_COLOUR.test(trimmed)) return true;
  const call = /^([a-z]+)\([\s\S]*\)$/i.exec(trimmed);
  if (call) return COLOUR_FUNCTIONS.has(call[1].toLowerCase());
  return NAMED_COLOURS.has(trimmed.toLowerCase());
}

/* ---------------------------------------------------------------------------
 * CSS: comments, declarations, at-rules
 * ------------------------------------------------------------------------ */

/** Every comment character becomes a space. Newlines stay, so offsets and lines still hold. */
function blankCssComments(source: string): string {
  const out: string[] = [];
  let quote = '';
  let index = 0;
  while (index < source.length) {
    const ch = source[index];
    let stop = index + 1;
    let text: string | null = null;
    if (quote !== '') {
      // A CSS string cannot run past its line, so a stray quote costs one line at most.
      if (ch === quote || ch === '\n') quote = '';
      else if (ch === '\\') stop = index + 2;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '/' && source[index + 1] === '*') {
      const close = source.indexOf('*/', index + 2);
      stop = close === -1 ? source.length : close + 2;
      text = source.slice(index, stop).replace(/[^\n]/g, ' ');
    }
    out.push(text ?? source.slice(index, stop));
    index = stop;
  }
  return out.join('');
}

/** Where statements end: every `{` and `}`, and each `;` outside parentheses (a data URL holds one). */
function* statementCuts(text: string): Generator<{ index: number; ch: string }> {
  let parens = 0;
  let quote = '';
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (quote !== '') {
      if (ch === '\\') index += 1;
      else if (ch === quote || ch === '\n') quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(') {
      parens += 1;
    } else if (ch === ')') {
      parens = Math.max(0, parens - 1);
    } else if (ch === '{' || ch === '}') {
      parens = 0;
      yield { index, ch };
    } else if (ch === ';' && parens === 0) {
      yield { index, ch };
    }
  }
  yield { index: text.length, ch: ';' };
}

/**
 * Every declaration and at-rule of a stylesheet.
 *
 * One loop for every block: text that ends at `{` opens a rule or an at-rule,
 * text that ends at `;` or `}` is a declaration. That reads `@media`,
 * `@container`, `@keyframes` and nested rules alike.
 */
export function parseCss(source: string): ParsedCss {
  const text = blankCssComments(source);
  const declarations: CssDeclaration[] = [];
  const atRules: CssAtRule[] = [];
  const scopes: { selector: string; at: readonly string[] }[] = [{ selector: '', at: [] }];
  let from = 0;

  for (const { index, ch } of statementCuts(text)) {
    const raw = text.slice(from, index);
    const statement = squash(raw);
    const scope = scopes[scopes.length - 1];
    const atRule = /^@([\w-]+)\s*([\s\S]*)$/.exec(statement);
    const colon = raw.indexOf(':');

    if (atRule) atRules.push({ name: atRule[1].toLowerCase(), prelude: atRule[2] });
    if (ch === '{') {
      scopes.push({ selector: statement, at: atRule ? [...scope.at, statement] : scope.at });
    } else if (!atRule && colon !== -1) {
      const rawValue = raw.slice(colon + 1);
      const property = raw.slice(0, colon).trim();
      declarations.push({ ...scope, property, value: squash(rawValue), rawValue, valueOffset: from + colon + 1 });
    }
    if (ch === '}' && scopes.length > 1) scopes.pop();
    from = index + 1;
  }
  return { declarations, atRules };
}

/**
 * Whether `declaration` is the one `key` names: a declaration of a top-level
 * rule with that whole selector, that property and that whole value. The same
 * line inside an at-rule, or with one length changed, is another declaration.
 */
export function sameDeclaration(declaration: CssDeclaration, key: DeclarationKey): boolean {
  return (
    declaration.at.length === 0 &&
    declaration.selector === squash(key.selector) &&
    declaration.property === key.property &&
    declaration.value === squash(key.value)
  );
}

const WIDTH_FEATURE = /(?<![\w-])(?:min-|max-)?(?:width|inline-size)(?![\w-])/i;
/** A pair of parentheses with no pair inside it. */
const INNERMOST_PAIR = /\(([^()]*)\)/g;

/**
 * The prelude with every pair of parentheses that names no width turned into
 * brackets, innermost first, until nothing changes. The pairs left are the
 * width conditions, each whole: a `calc()` or a group nested inside one, however
 * deep, no longer ends it early, and a height beside it is not read with it.
 */
function widthConditionsOnly(prelude: string): string {
  const next = prelude.replace(INNERMOST_PAIR, (pair: string, inside: string) =>
    WIDTH_FEATURE.test(inside) ? pair : `[${inside}]`,
  );
  return next === prelude ? prelude : widthConditionsOnly(next);
}

/**
 * The lengths an at-rule's prelude compares a width with: `(max-width: 720px)`
 * gives `720px`, and so does `(width <= 720px)`. A number inside `calc()` is
 * read too, so `(max-width: calc(700px + 1px))` gives both. A height, or a
 * condition with no length, gives nothing.
 */
export function widthLengths(prelude: string): string[] {
  return [...widthConditionsOnly(prelude).matchAll(INNERMOST_PAIR)].flatMap(
    ([, condition]) => condition.match(/(?<![\w.-])\d*\.?\d+[a-z%]*/gi) ?? [],
  );
}

/* ---------------------------------------------------------------------------
 * CSS: what a value holds
 * ------------------------------------------------------------------------ */

const CSS_STRING_OR_URL = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|url\(\s*[^"'\s)][^)]*\)/gi;
const CSS_HASH = /#[\w-]+/g;
const CSS_CALL = /(?<![\w-])([a-z][a-z0-9-]*)\(/gi;
const CSS_WORD = /(?<![\w#.-])[a-z]+(?![\w(-])/gi;
const SIZE_LITERAL = /(?<![\w.#-])[+-]?(?:\d+\.?\d*|\.\d+)(?:px|rem)(?![\w-])/gi;
const VAR_REFERENCE = /(?<![\w-])var\(\s*(--[\w-]+)/gi;
const COLOR_MIX = /(?<![\w-])color-mix\(/gi;

/** Strings and bare URLs blanked, length kept: text inside them is not a colour or a size. */
const withoutStrings = (value: string): string => value.replace(CSS_STRING_OR_URL, (text) => ' '.repeat(text.length));

/** The call from its name to its closing parenthesis, for a message a reader can find. */
function callText(value: string, from: number): string {
  let depth = 0;
  for (let index = value.indexOf('(', from); index !== -1 && index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    if (value[index] === ')') depth -= 1;
    if (depth === 0) return squash(value.slice(from, index + 1));
  }
  return squash(value.slice(from));
}

type LocatedLiteral = Located<Omit<Finding, 'line'>>;

/** The colour literals in one declaration value, already cleared of strings. */
function colourLiterals(property: string, value: string): LocatedLiteral[] {
  const found: LocatedLiteral[] = [];
  for (const match of value.matchAll(CSS_HASH)) {
    if (HEX_COLOUR.test(match[0])) found.push({ offset: match.index, item: { rule: 'colour', text: match[0] } });
  }
  for (const match of value.matchAll(CSS_CALL)) {
    const name = match[1].toLowerCase();
    const rule: FindingRule | null = name === 'color-mix' ? 'color-mix' : COLOUR_FUNCTIONS.has(name) ? 'colour' : null;
    if (rule) found.push({ offset: match.index, item: { rule, text: callText(value, match.index) } });
  }
  if (NAME_VALUED_PROPERTIES.has(property.toLowerCase())) return found;
  for (const match of value.matchAll(CSS_WORD)) {
    if (NAMED_COLOURS.has(match[0].toLowerCase())) {
      found.push({ offset: match.index, item: { rule: 'colour', text: match[0] } });
    }
  }
  return found;
}

/** The size literals in one declaration value, already cleared of strings. */
function sizeLiterals(value: string, allow: Allowance): LocatedLiteral[] {
  const allowed = new Set((allow.sizes ?? []).map(sizeKey));
  return [...value.matchAll(SIZE_LITERAL)]
    .filter((match) => !allowed.has(sizeKey(match[0])))
    .map((match) => ({ offset: match.index, item: { rule: 'size', text: match[0] } }));
}

function scanCss(source: string, allow: Allowance): FileScan {
  const findings: Located<Finding>[] = [];
  const references: Located<Reference>[] = [];
  const declared = new Set<string>();

  for (const declaration of parseCss(source).declarations) {
    const { property, rawValue, valueOffset } = declaration;
    if (property.startsWith('--')) declared.add(property);
    const value = withoutStrings(rawValue);
    const letThrough = (allow.declarations ?? []).some((key) => sameDeclaration(declaration, key));
    const literals = letThrough ? [] : [...colourLiterals(property, value), ...sizeLiterals(value, allow)];
    for (const { offset, item } of literals) {
      const at = valueOffset + offset;
      findings.push({ offset: at, item: { ...item, line: lineOf(source, at) } });
    }
    for (const match of value.matchAll(VAR_REFERENCE)) {
      const at = valueOffset + match.index;
      references.push({ offset: at, item: { name: match[1], line: lineOf(source, at) } });
    }
  }
  return { findings: inOrder(findings), references: inOrder(references), declared: [...declared] };
}

/* ---------------------------------------------------------------------------
 * TypeScript and TSX: the lexer
 * ------------------------------------------------------------------------ */

/**
 * `word` is a name, a keyword or a number. `attr` is a JSX attribute name.
 * `jsx` marks where a JSX element ended, so what follows is not taken for the
 * start of an expression. A template literal is one `template` token whose
 * text holds `${}` for each substitution, followed by the substitution's own
 * tokens between `{` and `}`.
 */
type TokenKind = 'word' | 'string' | 'template' | 'regex' | 'punct' | 'attr' | 'jsx';

interface Token {
  kind: TokenKind;
  text: string;
  start: number;
}

/** Where the lexer is. `pos` and `tokens` move; nothing else does. */
interface Cursor {
  readonly source: string;
  readonly jsx: boolean;
  readonly tokens: Token[];
  pos: number;
}

/** Words after which a `/` starts a regex and a `<` may start JSX. */
const EXPRESSION_KEYWORDS: ReadonlySet<string> = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield',
  'await', 'default',
]);

/** Punctuation after which a value has just ended, so a `/` divides and a `<` compares. */
const VALUE_ENDS: readonly string[] = [')', ']', '}', '++', '--'];

// Sticky patterns: each is tried at the cursor and nowhere else.
/** Whitespace and comments. This is the one place a comment is dropped. */
const TRIVIA = /(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)+/y;
const WORD = /[\w$]+/y;
const STRING = /'(?:[^'\\\n]|\\[\s\S])*'|"(?:[^"\\\n]|\\[\s\S])*"/y;
const REGEX = /\/(?:[^\\/[\n]|\\.|\[(?:[^\]\\\n]|\\.)*\])+\/[\w$]*/y;
const OPERATOR = /\.\.\.|=>|[=!]==?|[<>]=|&&=?|\|\|=?|\?\?=?|\?\.|\+\+|--|[+\-*/%&|^]=|[\s\S]/y;
const TAG_NAME = /[\w$.:-]*/y;
const ATTRIBUTE_NAME = /[A-Za-z_$][\w$:-]*/y;
/** A JSX string has no escapes and may run over lines. */
const JSX_STRING = /"[^"]*"|'[^']*'/y;

/** The text `pattern` matches at the cursor, which then moves past it. Null when it does not match there. */
function take(cursor: Cursor, pattern: RegExp): string | null {
  pattern.lastIndex = cursor.pos;
  const text = pattern.exec(cursor.source)?.[0] ?? null;
  if (text !== null) cursor.pos += text.length;
  return text;
}

/** `take`, and the match becomes a token. A string token holds what is between its quotes. */
function takeToken(cursor: Cursor, kind: TokenKind, pattern: RegExp): string | null {
  const start = cursor.pos;
  const text = take(cursor, pattern);
  if (text !== null) cursor.tokens.push({ kind, text: kind === 'string' ? text.slice(1, -1) : text, start });
  return text;
}

/** Whether the next token may start an expression, going by the one before it. */
function expressionMayStart({ tokens }: Cursor): boolean {
  const previous = tokens[tokens.length - 1];
  if (previous === undefined) return true;
  if (previous.kind === 'word') return EXPRESSION_KEYWORDS.has(previous.text);
  return previous.kind === 'punct' && !VALUE_ENDS.includes(previous.text);
}

function readTemplate(cursor: Cursor): void {
  const { source, tokens } = cursor;
  const start = cursor.pos;
  const slot = tokens.length;
  const parts: string[] = [];
  tokens.push({ kind: 'template', text: '', start });
  cursor.pos += 1;
  while (cursor.pos < source.length && source[cursor.pos] !== '`') {
    if (source[cursor.pos] === '$' && source[cursor.pos + 1] === '{') {
      parts.push('${}');
      cursor.pos += 1;
      readBraced(cursor);
    } else {
      const length = source[cursor.pos] === '\\' ? 2 : 1;
      parts.push(source.slice(cursor.pos, cursor.pos + length));
      cursor.pos += length;
    }
  }
  cursor.pos += 1;
  tokens[slot] = { kind: 'template', text: parts.join(''), start };
}

/**
 * Whether the `<` at the cursor opens JSX. It must sit where an expression may
 * start and be followed by a name or `>`. A type parameter list reads the same
 * that far, so its shapes are ruled out: `<T,`, `<T =`, `<T extends`, and
 * `<T>(` with no `</T` later in the file.
 */
function jsxStartsHere(cursor: Cursor): boolean {
  const { source, pos } = cursor;
  if (!cursor.jsx || !expressionMayStart(cursor)) return false;
  if (source[pos + 1] === '>') return true;
  const name = /^[A-Za-z_$][\w$.:-]*/.exec(source.slice(pos + 1, pos + 200))?.[0];
  if (name === undefined) return false;
  const after = pos + 1 + name.length;
  const rest = source.slice(after, after + 40);
  if (/^\s*(?:,|=|extends\s)/.test(rest)) return false;
  return !(/^>\s*\(/.test(rest) && !source.includes(`</${name}`, after));
}

/** A `{`, the code inside it, and its `}`: a substitution, an attribute value or a child. */
function readBraced(cursor: Cursor): void {
  cursor.tokens.push({ kind: 'punct', text: '{', start: cursor.pos });
  cursor.pos += 1;
  readCode(cursor, true);
  cursor.tokens.push({ kind: 'punct', text: '}', start: cursor.pos });
  cursor.pos += 1;
}

/** What sits between an opening tag and its closing tag. Text is skipped: an apostrophe there is a letter. */
function readChildren(cursor: Cursor): void {
  const { source } = cursor;
  while (cursor.pos < source.length) {
    const ch = source[cursor.pos];
    if (ch === '{') {
      readBraced(cursor);
    } else if (ch === '<' && source[cursor.pos + 1] === '/') {
      const end = source.indexOf('>', cursor.pos);
      cursor.pos = end === -1 ? source.length : end + 1;
      return;
    } else if (ch === '<') {
      readElement(cursor);
    } else {
      cursor.pos += 1;
    }
  }
}

/** One attribute: its name, and its value when it has one. */
function readAttribute(cursor: Cursor): void {
  takeToken(cursor, 'attr', ATTRIBUTE_NAME);
  take(cursor, TRIVIA);
  if (cursor.source[cursor.pos] !== '=') return;
  cursor.tokens.push({ kind: 'punct', text: '=', start: cursor.pos });
  cursor.pos += 1;
  take(cursor, TRIVIA);
  const first = cursor.source[cursor.pos];
  if (first === '{') readBraced(cursor);
  else if (first === '<') readElement(cursor);
  else takeToken(cursor, 'string', JSX_STRING);
}

/** Past the type arguments a component may carry between its name and its attributes. */
function skipTypeArguments(cursor: Cursor): void {
  const { source } = cursor;
  let depth = 0;
  while (cursor.pos < source.length) {
    if (source[cursor.pos] === '<') depth += 1;
    if (source[cursor.pos] === '>') depth -= 1;
    cursor.pos += 1;
    if (depth === 0) return;
  }
}

/** One JSX element, from its `<` to the end of its closing tag. */
function readElement(cursor: Cursor): void {
  const { source } = cursor;
  cursor.pos += 1;
  take(cursor, TAG_NAME);
  if (source[cursor.pos] === '<') skipTypeArguments(cursor);
  for (take(cursor, TRIVIA); cursor.pos < source.length; take(cursor, TRIVIA)) {
    const ch = source[cursor.pos];
    if (ch === '/' && source[cursor.pos + 1] === '>') {
      cursor.pos += 2;
      break;
    }
    if (ch === '>') {
      cursor.pos += 1;
      readChildren(cursor);
      break;
    }
    if (ch === '{') readBraced(cursor);
    else if (/[A-Za-z_$]/.test(ch)) readAttribute(cursor);
    else cursor.pos += 1;
  }
  cursor.tokens.push({ kind: 'jsx', text: '', start: cursor.pos });
}

/** Code up to the end of the file, or up to the `}` that closes the brace the caller opened. */
function readCode(cursor: Cursor, untilBrace: boolean): void {
  const { source } = cursor;
  let depth = 0;
  for (take(cursor, TRIVIA); cursor.pos < source.length; take(cursor, TRIVIA)) {
    const ch = source[cursor.pos];
    if (ch === '`') {
      readTemplate(cursor);
    } else if (ch === '<' && jsxStartsHere(cursor)) {
      readElement(cursor);
    } else if (ch === '}' && depth === 0 && untilBrace) {
      return;
    } else if (takeToken(cursor, 'string', STRING) === null && takeToken(cursor, 'word', WORD) === null) {
      const regex = ch === '/' && expressionMayStart(cursor) ? takeToken(cursor, 'regex', REGEX) : null;
      const operator = regex ?? takeToken(cursor, 'punct', OPERATOR);
      if (operator === '{') depth += 1;
      if (operator === '}') depth -= 1;
    }
  }
}

function lexScript(source: string, jsx: boolean): Token[] {
  const cursor: Cursor = { source, jsx, tokens: [], pos: 0 };
  readCode(cursor, false);
  return cursor.tokens;
}

/* ---------------------------------------------------------------------------
 * TypeScript and TSX: inline style keys
 * ------------------------------------------------------------------------ */

const isPunct = (token: Token | undefined, text: string): boolean =>
  token !== undefined && token.kind === 'punct' && token.text === text;

const isWord = (token: Token | undefined, text: string): boolean =>
  token !== undefined && token.kind === 'word' && token.text === text;

const opens = (token: Token): boolean => token.kind === 'punct' && ['(', '[', '{'].includes(token.text);
const closes = (token: Token): boolean => token.kind === 'punct' && [')', ']', '}'].includes(token.text);

/** The index of the token that closes the bracket at `open`, or -1. */
function closeOf(tokens: readonly Token[], open: number): number {
  let depth = 0;
  for (let index = open; index < tokens.length; index += 1) {
    if (opens(tokens[index])) depth += 1;
    if (closes(tokens[index])) depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

/** One key of a style object. A `custom` key is a custom property and counts 0. */
interface StyleKey {
  key: string;
  custom: boolean;
  start: number;
}

/**
 * The key of one object-literal entry, `tokens[from..to)`.
 *
 * A custom property is written `'--x'` or, to get past React's types,
 * `['--x' as string]`. Anything that is not a plain key (a spread, another
 * computed key) is one unknown key, and it counts.
 */
function entryKey(tokens: readonly Token[], from: number, to: number): StyleKey {
  const first = tokens[from];
  if (first.kind === 'string' || first.kind === 'word') {
    return { key: first.text, custom: first.kind === 'string' && first.text.startsWith('--'), start: first.start };
  }
  const shown = tokens.slice(from, Math.min(to, from + 4)).map((token) => token.text);
  const unknown: StyleKey = { key: shown.join(' '), custom: false, start: first.start };
  const close = isPunct(first, '[') ? closeOf(tokens, from) : -1;
  if (close === -1 || close >= to) return unknown;
  const name = tokens[from + 1];
  const cast = close === from + 2 || isWord(tokens[from + 2], 'as');
  if (name.kind !== 'string' || !name.text.startsWith('--') || !cast) return unknown;
  return { key: name.text, custom: true, start: name.start };
}

/** The keys of the object literal whose braces sit at `open` and `close`. */
function objectKeys(tokens: readonly Token[], open: number, close: number): StyleKey[] {
  const keys: StyleKey[] = [];
  let depth = 0;
  let from = open + 1;
  for (let index = open + 1; index <= close; index += 1) {
    const token = tokens[index];
    if (index === close || (depth === 0 && isPunct(token, ','))) {
      if (index > from) keys.push(entryKey(tokens, from, index));
      from = index + 1;
    } else if (opens(token)) {
      depth += 1;
    } else if (closes(token)) {
      depth -= 1;
    }
  }
  return keys;
}

/**
 * From a `const name`, the index of the `{` its `=` is followed by, or -1.
 * Only a type annotation may stand between the name and the `=`, so the
 * `const style of styles` of a loop is not taken for a declaration.
 */
function initialiserBrace(tokens: readonly Token[], afterName: number): number {
  let at = afterName;
  if (isPunct(tokens[at], ':')) {
    while (at < tokens.length && !isPunct(tokens[at], '=')) {
      if (isPunct(tokens[at], ';') || closes(tokens[at])) return -1;
      const close = opens(tokens[at]) ? closeOf(tokens, at) : at;
      if (close === -1) return -1;
      at = close + 1;
    }
  }
  return isPunct(tokens[at], '=') && isPunct(tokens[at + 1], '{') ? at + 1 : -1;
}

/**
 * Where `const name = {` opens its object literal: the declaration nearest
 * above `before`, or else the first one in the file. -1 when `name` is not a
 * `const` object literal here.
 */
function constObject(tokens: readonly Token[], name: string, before: number): number {
  const found: number[] = [];
  for (let index = 0; index + 2 < tokens.length; index += 1) {
    if (!isWord(tokens[index], 'const') || !isWord(tokens[index + 1], name)) continue;
    const brace = initialiserBrace(tokens, index + 2);
    if (brace !== -1) found.push(brace);
  }
  const above = found.filter((brace) => brace < before);
  return above.length > 0 ? above[above.length - 1] : (found[0] ?? -1);
}

/**
 * The keys one `style=` sets, or null when they cannot be read.
 *
 * `style={{ … }}` is read as written. `style={name}` is read as the `const`
 * object literal of that name in the same file. Any other expression is null,
 * and the caller counts it once. `open` and `close` are the attribute's braces.
 */
function styleKeys(tokens: readonly Token[], open: number, close: number): StyleKey[] | null {
  const first = open + 1;
  if (isPunct(tokens[first], '{') && closeOf(tokens, first) === close - 1) return objectKeys(tokens, first, close - 1);
  if (close - open !== 2 || tokens[first].kind !== 'word') return null;
  const literal = constObject(tokens, tokens[first].text, open);
  return literal === -1 ? null : objectKeys(tokens, literal, closeOf(tokens, literal));
}

/** The keys of the `style=` whose name is `tokens[index]`, or null. Undefined when that token is no `style=`. */
function styleSite(tokens: readonly Token[], index: number): StyleKey[] | null | undefined {
  const token = tokens[index];
  if (token.kind !== 'attr' || token.text !== 'style' || !isPunct(tokens[index + 1], '=')) return undefined;
  const close = isPunct(tokens[index + 2], '{') ? closeOf(tokens, index + 2) : -1;
  return close === -1 ? null : styleKeys(tokens, index + 2, close);
}

function scanScript(source: string, jsx: boolean, allow: Allowance): FileScan {
  const tokens = lexScript(source, jsx);
  const findings: Located<Finding>[] = [];
  const references: Located<Reference>[] = [];
  const declared = new Set<string>();
  const allowedColours = new Set((allow.colours ?? []).map((colour) => colour.trim().toLowerCase()));
  const allowedKeys = new Set(allow.styleKeys ?? []);
  const find = (rule: FindingRule, text: string, offset: number): void => {
    findings.push({ offset, item: { rule, text, line: lineOf(source, offset) } });
  };

  tokens.forEach((token, index) => {
    if (token.kind === 'string' || token.kind === 'template') {
      const colour = isColourText(token.text) && !allowedColours.has(token.text.trim().toLowerCase());
      if (colour) find('colour', token.text, token.start);
      for (const match of token.text.matchAll(COLOR_MIX)) find('color-mix', callText(token.text, match.index), token.start);
      for (const match of token.text.matchAll(VAR_REFERENCE)) {
        references.push({ offset: token.start, item: { name: match[1], line: lineOf(source, token.start) } });
      }
    }
    const keys = styleSite(tokens, index);
    if (keys === null) find('style-key', 'style={…}', token.start);
    for (const key of keys ?? []) {
      if (key.custom) declared.add(key.key);
      else if (!allowedKeys.has(key.key)) find('style-key', key.key, key.start);
    }
  });

  return { findings: inOrder(findings), references: inOrder(references), declared: [...declared] };
}

/* ---------------------------------------------------------------------------
 * The two entry points
 * ------------------------------------------------------------------------ */

/** What one file holds. The path decides how it is read: `.css`, `.tsx`, or anything else as TypeScript. */
export function scanSource(path: string, source: string, allow: Allowance = {}): FileScan {
  if (path.endsWith('.css')) return scanCss(source, allow);
  return scanScript(source, path.endsWith('.tsx'), allow);
}

/**
 * Every `var(--name)` whose name is declared nowhere it could come from: the
 * token file, the same stylesheet, or a TSX inline style key anywhere.
 */
export function unresolvedReferences(
  scans: ReadonlyMap<string, FileScan>,
  globalsPath: string,
): UnresolvedReference[] {
  const everywhere = new Set<string>(scans.get(globalsPath)?.declared ?? []);
  for (const [path, scan] of scans) {
    if (!path.endsWith('.css')) scan.declared.forEach((name) => everywhere.add(name));
  }
  const unresolved: UnresolvedReference[] = [];
  for (const [path, scan] of scans) {
    const own = new Set(path.endsWith('.css') ? scan.declared : []);
    for (const { name, line } of scan.references) {
      if (!everywhere.has(name) && !own.has(name)) unresolved.push({ path, name, line });
    }
  }
  return unresolved;
}
