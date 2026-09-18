/**
 * S-1 / P-grades-7 — one status vocabulary, and no way back to two.
 *
 * The bug was not that any single screen was wrong; it was that four of them
 * each knew their own answer. `queries.today.ts` declared a nine-option menu
 * and a label map saying "not started" / "missed" / "n/a"; the Classwork row
 * spelled labels by replacing underscores; the popout read the query layer's
 * map; and `progress-status.ts`, the PM-owned file every screen was supposed to
 * read, was imported by nothing at all.
 *
 * Fixing the four call sites does not stop a fifth appearing, so this scans
 * `src/` for the two shapes that would start the drift again: a hard-coded list
 * of enum values outside the one file that owns them, and a second label map.
 * Same approach as test/audits.test.ts.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

/** The file that is allowed to know the enum, and the tests' view of it. */
const VOCABULARY = 'lib/progress-status.ts';

/** Re-export only: it may name the module, it must not redefine the values. */
const RE_EXPORTERS = new Set(['lib/queries.today.ts']);

/**
 * `queries.grades.ts` glosses Blackboard's OWN `submission_status` free text,
 * which happens to include an "UNOPENED" that reads "not opened". That is a
 * different vocabulary about a different column — what Blackboard says about a
 * submission, not what Stack has recorded as his plan — and the two must not be
 * merged just because one word coincides.
 */
const LABEL_EXEMPT = new Set(['lib/queries.grades.ts']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * Comments explain the rule; they do not break it. Without stripping them,
 * every file that documents why it defers to the shared vocabulary would be
 * reported as defining a rival one.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const files = walk(SRC)
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => ({
    path: relative(SRC, file).split('\\').join('/'),
    raw: readFileSync(file, 'utf8'),
    text: stripComments(readFileSync(file, 'utf8')),
  }))
  // The generated database types are the enum's definition, not a copy of it.
  .filter(({ path }) => path !== 'lib/supabase/database.types.ts');

/** The three values migration 078 retires — nothing should offer them. */
const RETIRED = ['planned', 'waived', 'not_applicable'] as const;

describe('the status vocabulary lives in one file', () => {
  it('is imported by every screen that shows a status', () => {
    const importers = files
      // Either spelling of the same module: the alias, or a relative path from
      // inside `lib/` itself.
      .filter(({ text }) => /from\s+['"](?:@\/lib|\.)\/progress-status['"]/.test(text))
      .map(({ path }) => path);

    for (const screen of [
      'components/tracker/StatusSelect.tsx',
      'components/popout/AssignmentPopout.tsx',
      'app/(app)/course/[id]/classwork/CourseScreen.tsx',
      // F-1: the course Stream was the one screen this list had missed, and it
      // was spelling its own labels the whole time.
      'app/(app)/course/[id]/stream/CourseStream.tsx',
      'lib/queries.today.ts',
    ]) {
      expect(importers, `${screen} must read the shared vocabulary`).toContain(screen);
    }
  });

  it('is the only file that writes the labels down', () => {
    // "not opened" and "DNF" are Stack's words for `not_started` and `missed`.
    // Anywhere else spelling them is a second label map in the making.
    const offenders = files
      .filter(({ path }) => path !== VOCABULARY && !LABEL_EXEMPT.has(path))
      .filter(({ text }) => /['"]not opened['"]|['"]DNF['"]/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  it('is the only file that names a retired enum value', () => {
    const offenders = files
      .filter(({ path }) => path !== VOCABULARY && !RE_EXPORTERS.has(path))
      .filter(({ text }) =>
        RETIRED.some((value) => new RegExp(`['"]${value}['"]`).test(text)),
      )
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });

  /**
   * F-1, found on the PM's browser walk. The scan above asks whether a file
   * IMPORTS the vocabulary; the Stream did not, and nothing noticed, because
   * `status.replace(/_/g, ' ')` looks like ordinary formatting rather than a
   * label map. It is one: it is a screen deciding for itself what a status is
   * called. That is the shape to forbid, not the list of files to enumerate.
   */
  it('lets no screen spell a status for itself', () => {
    // Checked per occurrence, not per file: `session.kind.replace(/_/g, ' ')`
    // and `assignment.type.replace(...)` are fine and live in the same files.
    const offenders: string[] = [];
    for (const { path, text } of files) {
      for (const match of text.matchAll(/(.{0,60})\.replace\(\s*\/_\/g/g)) {
        const before = match[1];
        if (!/status/i.test(before)) continue;
        // A fallback for a value the enum does not carry is fine — but only
        // once statusLabel() has been asked, which is what `?? x.replace` is.
        if (/statusLabel\(/i.test(before)) continue;
        offenders.push(`${path}: ${before.trim()}.replace(/_/g`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('leaves no second options list behind', () => {
    const offenders = files
      .filter(({ text }) => /\bSTATUS_OPTIONS\b/.test(text))
      .map(({ path }) => path);
    expect(offenders).toEqual([]);
  });
});
