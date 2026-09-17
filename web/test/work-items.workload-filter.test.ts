/**
 * H-4 / P-home-6 and P-home-7 — nothing reads the workload without the switch.
 *
 * Migration 073 turns `v_work_items.in_workload` into the flag that hides the
 * three series placeholders and the IST.466 case pool: `required is not false`
 * for readings, `not hidden_from_workload` for assignments. The column has
 * existed since migration 016 and is already in `database.types.ts`, so no row
 * type needs widening here — but it hides nothing unless the reader asks for
 * it, and a reader that forgets shows twelve phantom rows rather than an error.
 *
 * So this walks `src/` for every read of `v_work_items` and requires each one
 * to either filter the column or appear on the exemption list below with a
 * reason. A new workload surface that forgets fails here, at the point where
 * the mistake is cheap.
 *
 * Same shape and the same justification as test/audits.test.ts: a rule that
 * has to hold across files nobody is looking at is worth a scan, not a comment.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

/**
 * Reads that legitimately do not filter, each with the reason it is allowed.
 * Keys are paths relative to `src/`, in posix form.
 */
const EXEMPT: Record<string, string> = {
  'lib/queries.course.ts':
    'The course-wide listing behind both the Stream and Classwork. Classwork is ' +
    'a folder tree of everything Blackboard holds, so filtering it would hide ' +
    'real content; the Stream filters `in_workload !== false` itself, on the ' +
    'rows this read returns.',
  'lib/queries.popout.ts':
    'The assignment popout\u2019s series strip: the rest of a series by ' +
    '`series_key`, which is a listing of siblings and not a workload sum.',
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = walk(SRC).filter((file) => /\.tsx?$/.test(file));

/** Files that actually issue `.from('v_work_items')`, not just mention it. */
function readsWorkItems(text: string): boolean {
  return /\.from\(\s*['"]v_work_items['"]\s*\)/.test(text);
}

/**
 * Does the file actually CONSTRAIN `in_workload`, server-side or client-side?
 *
 * Deliberately not a bare /in_workload/ — every read names the column in its
 * select list, so that would pass a file that fetches the flag and then ignores
 * it, which is exactly the bug this guards against.
 */
function filtersWorkload(text: string): boolean {
  return (
    /\.eq\(\s*['"]in_workload['"]/.test(text) || /in_workload\s*(?:!==|===|!=|==)/.test(text)
  );
}

describe('v_work_items readers', () => {
  const readers = sourceFiles
    .map((file) => ({ file, text: readFileSync(file, 'utf8') }))
    .filter(({ text }) => readsWorkItems(text))
    .map(({ file, text }) => ({
      path: relative(SRC, file).split('\\').join('/'),
      text,
    }));

  it('finds the reads at all, so a rename cannot quietly empty this suite', () => {
    expect(readers.length).toBeGreaterThanOrEqual(3);
    expect(readers.map((r) => r.path)).toContain('lib/queries.today.ts');
  });

  it('filters in_workload in every read that is not listed as exempt', () => {
    const offenders = readers
      .filter((reader) => !(reader.path in EXEMPT) && !filtersWorkload(reader.text))
      .map((reader) => reader.path);
    expect(offenders).toEqual([]);
  });

  it('keeps the exemption list honest — every entry still reads the view', () => {
    const paths = new Set(readers.map((reader) => reader.path));
    for (const exempt of Object.keys(EXEMPT)) {
      expect(paths.has(exempt), `${exempt} no longer reads v_work_items`).toBe(true);
    }
  });

  it('every exemption carries a reason someone can argue with', () => {
    for (const [path, reason] of Object.entries(EXEMPT)) {
      expect(reason.length, `${path} needs a real reason`).toBeGreaterThan(40);
    }
  });
});

describe('the course Stream filters the rows it was handed', () => {
  // It reads through the exempt course-wide query, so its own filter is the
  // thing standing between a placeholder row and the Stream's tracker.
  const stream = readFileSync(
    join(SRC, 'app', '(app)', 'course', '[id]', 'stream', 'CourseStream.tsx'),
    'utf8',
  );

  it('drops in_workload = false before handing rows to the tracker', () => {
    expect(stream).toMatch(/in_workload\s*!==\s*false/);
  });

  it('drops undated rows too — the Stream tracker is the dated strip', () => {
    expect(stream).toMatch(/undated\s*!==\s*true/);
  });
});
