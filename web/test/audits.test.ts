/**
 * Two standing audits over the whole of `web/src`, run as tests so they cannot
 * be forgotten at review time.
 *
 * 1. No control anywhere reads "Submit". bb2dash cannot submit to Blackboard,
 *    and a button that says it can is the one lie this feature could tell. The
 *    staged-file label is the only call to action, and it points at Blackboard.
 *
 * 2. No service-role key, ever. The browser bundle carries the publishable anon
 *    key and RLS is the security boundary; a `service_role` JWT or an
 *    `sb_secret_…` key in this tree would hand every row to anyone who opened
 *    dev tools.
 *
 * Both scan the source rather than a rendered tree, so a screen no test mounts
 * is covered too.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// `process.cwd()` rather than `import.meta.url`: under the jsdom environment
// the module URL is an http one and `fileURLToPath` refuses it. Vitest runs
// from `web/`, which is where `vitest.config.mts` lives.
const SRC = join(process.cwd(), 'src');

/**
 * `withFileTypes` so the directory entry already says what it is: the older
 * `statSync` per entry doubled the syscalls for no information.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const FILES = walk(SRC);

/**
 * Every file is read from disk ONCE, at module load, and the audits below read
 * the strings. Each audit used to re-read the whole of `src/` for itself, so a
 * file was opened five times over; on Windows, with a virus scanner in front of
 * every open and the rest of the suite spawning workers beside it, that put
 * these tests within reach of the 5 s default timeout — a red run that means
 * "the machine was busy", not "a service-role key reached the bundle". The
 * assertions below are unchanged; only the number of syscalls is.
 */
const SOURCES = new Map(FILES.map((file) => [file, readFileSync(file, 'utf8')]));

function read(file: string): string {
  const cached = SOURCES.get(file);
  return cached ?? readFileSync(file, 'utf8');
}

describe('no control anywhere reads "Submit"', () => {
  /**
   * The text of every JSX element that is, or could become, a control: the
   * literal children of a button, an anchor, a label, a summary or an option.
   * A word inside a comment or a variable name is not a claim to the reader, so
   * only rendered text is matched.
   */
  const CONTROL_TEXT = /<(button|a|label|summary|option)\b[^>]*>([\s\S]*?)<\/\1>/gi;

  it('finds no rendered control text containing the word', () => {
    const offenders: string[] = [];

    for (const file of FILES) {
      if (!/\.(tsx|jsx)$/.test(file)) continue;
      const source = read(file);
      for (const match of source.matchAll(CONTROL_TEXT)) {
        // Strip the JSX expressions; what is left is the literal text.
        const text = match[2].replace(/\{[\s\S]*?\}/g, ' ').replace(/<[^>]*>/g, ' ');
        if (/\bSubmit\b/.test(text)) offenders.push(`${file}: ${text.trim()}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('finds no string literal that would render as a Submit control label', () => {
    const offenders: string[] = [];
    // Case-sensitive on purpose: a control label is capitalised, while prose
    // about what bb2dash cannot do ("bb2dash cannot submit for you") is not a
    // control and is exactly the honest copy this audit exists to protect.
    const LABEL = /(?:label|action|text|title|cta)\s*[:=]\s*(['"`])([^'"`]*\bSubmit\b[^'"`]*)\1/g;

    for (const file of FILES) {
      if (!/\.(tsx?|jsx?)$/.test(file)) continue;
      for (const match of read(file).matchAll(LABEL)) {
        offenders.push(`${file}: ${match[2]}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('the Grades layer uses the typed client', () => {
  /**
   * `queries.grades.ts` and `queries.submissions.ts` read relations that did
   * not exist in `database.types.ts` while Phase 10a was being built, and went
   * through a cast to an untyped client to do it. 046-051 are applied and the
   * types are regenerated, so that escape hatch is closed: a cast reappearing
   * here means a column list nothing is checking.
   */
  it.each(['src/lib/queries.grades.ts', 'src/lib/queries.submissions.ts'])(
    '%s casts the client to nothing',
    (relative) => {
      const source = read(join(SRC, '..', relative));
      expect(source).not.toContain('as unknown as SupabaseClient');
      expect(source).not.toContain('untypedClient');
    },
  );
});

describe('no service-role credential reaches the browser bundle', () => {
  it.each(['service_role', 'sb_secret'])('finds no "%s" anywhere under src/', (needle) => {
    const offenders = FILES.filter((file) => read(file).includes(needle));
    expect(offenders).toEqual([]);
  });

  it('only ever reads the two public env vars', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const match of read(file).matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        const name = match[1];
        if (!name.startsWith('NEXT_PUBLIC_') && name !== 'NODE_ENV') {
          offenders.push(`${file}: ${name}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
