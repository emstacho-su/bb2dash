/**
 * Phase 10b's standing audits, run over the source so a file no test mounts is
 * covered too.
 *
 * 1. The files this phase adds or edits never write V-1's tables, the planner's
 *    progress rows or the gradebook mirror: no `.from('assignments' |
 *    'assignment_progress' | 'bb_gradebook' | 'grading_schemes' |
 *    'grade_components')` chain ends in insert / update / upsert / delete. The
 *    only write left is `grade_column_links` — and the audit proves it can see
 *    that one, so a pass is not a blind pass. Phase 12b's G-1 removed the
 *    `grade_scenarios` writes with the what-if layer; the table stays in the
 *    database, unused.
 * 2. No `service_role` / `sb_secret` anywhere under `web/src`.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = process.cwd();
const SRC = join(WEB, 'src');

/**
 * `src/` is walked and read ONCE, here, rather than inside each audit.
 *
 * The two credential audits below each did their own recursive walk — a
 * `readdirSync` plus a `statSync` per entry, then a `readFileSync` of every
 * file — inside the test body. On Windows, with a virus scanner in front of
 * every open and the rest of the suite spawning workers beside it, that put
 * them within reach of vitest's 5 s default timeout: measured here, the pair
 * went from 354 ms / 434 ms idle to 1221 ms / 1231 ms with one other suite run
 * alongside, and the cold run straight after `npm ci` is far harsher than that.
 * A test that goes red because the machine was busy says nothing about whether
 * a service-role key reached the bundle.
 *
 * `withFileTypes` drops the per-entry `statSync`; the map drops the repeat
 * reads. The assertions are unchanged.
 */
function walkSrc(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkSrc(full, out);
    else out.push(full);
  }
  return out;
}

const SRC_SOURCES: ReadonlyArray<readonly [string, string]> = walkSrc(SRC).map(
  (file) => [file, readFileSync(file, 'utf8')] as const,
);

/** Everything Phase 10b adds, plus the three screens/tables it edits. */
const PHASE_FILES = [
  'src/lib/queries.grade-model.ts',
  'src/lib/grade-model-input.ts',
  'src/lib/grade-model-view.ts',
  'src/lib/grade-model-format.ts',
  'src/lib/grade-figure-run.ts',
  'src/lib/graded-so-far.ts',
  'src/components/grades/GradedSoFarFigure.tsx',
  'src/components/grades/ScoreHistory.tsx',
  'src/components/grades/LinkColumnControl.tsx',
  'src/components/grades/useCourseGradeModel.ts',
  'src/components/grades/useCourseLinkActions.ts',
  'src/components/grades/GradebookTable.tsx',
  'src/app/(app)/grades/GradesModelScreen.tsx',
  'src/app/(app)/grades/GradesScreen.tsx',
  'src/app/(app)/course/[id]/grades/CourseGrades.tsx',
];

const PROTECTED = ['assignments', 'assignment_progress', 'bb_gradebook', 'grading_schemes', 'grade_components'];
const WRITE = /\.(insert|update|upsert|delete)\s*\(/;

function read(relative: string): string {
  return readFileSync(join(WEB, relative), 'utf8');
}

interface Chain {
  relation: string;
  text: string;
}

/**
 * Every `.from('<relation>')` in a source file with the statement it belongs
 * to: the text from the call up to the end of the statement. A client stored
 * in a variable (`const table = … .from('x');`) is followed to where that
 * variable is used, so a write split across two statements is still seen.
 */
function chains(source: string): Chain[] {
  const found: Chain[] = [];
  for (const match of source.matchAll(/\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/g)) {
    const start = match.index ?? 0;
    const end = source.indexOf(';', start);
    const statement = source.slice(start, end === -1 ? undefined : end);
    const before = source.slice(Math.max(0, source.lastIndexOf('\n', start - 1)), start);
    const assigned = /const\s+(\w+)\s*=\s*[^;]*$/.exec(before);
    const uses = assigned
      ? [...source.slice(end).matchAll(new RegExp(`\\b${assigned[1]}\\b[^;]*`, 'g'))].map((m) => m[0]).join('\n')
      : '';
    found.push({ relation: match[1], text: `${statement}\n${uses}` });
  }
  return found;
}

describe('the grade feature writes only its own link table', () => {
  it.each(PHASE_FILES)('%s exists (the list is not stale)', (relative) => {
    expect(() => read(relative)).not.toThrow();
  });

  it('no phase file writes assignments, assignment_progress, bb_gradebook, grading_schemes or grade_components', () => {
    const offenders = PHASE_FILES.flatMap((relative) =>
      chains(read(relative))
        .filter((chain) => PROTECTED.includes(chain.relation) && WRITE.test(chain.text))
        .map((chain) => `${relative}: ${chain.relation}`),
    );
    expect(offenders).toEqual([]);
  });

  it('sees the write it allows, so the audit is not vacuous', () => {
    const writes = ['src/lib/queries.grade-model.ts']
      .flatMap((relative) => chains(read(relative)))
      .filter((chain) => WRITE.test(chain.text))
      .map((chain) => chain.relation);
    expect(new Set(writes)).toEqual(new Set(['grade_column_links']));
  });

  it('G-1: nothing in the grade feature writes grade_scenarios any more', () => {
    const scenarioWrites = PHASE_FILES.flatMap((relative) =>
      chains(read(relative))
        .filter((chain) => chain.relation === 'grade_scenarios' && WRITE.test(chain.text))
        .map(() => relative),
    );
    expect(scenarioWrites).toEqual([]);
  });

  it('catches a protected write when one is planted', () => {
    const planted = "const t = supabase.from('grading_schemes');\nawait t.update({ method: 'points' });";
    expect(chains(planted).some((c) => PROTECTED.includes(c.relation) && WRITE.test(c.text))).toBe(true);
    const inline = "await supabase.from('assignments').select('id').eq('id', 1);\nawait supabase.from('grade_column_links').upsert({});";
    expect(chains(inline).filter((c) => PROTECTED.includes(c.relation) && WRITE.test(c.text))).toEqual([]);
  });
});

describe('no service-role credential under web/src', () => {
  it.each(['service_role', 'sb_secret'])('finds no "%s"', (needle) => {
    expect(SRC_SOURCES.filter(([, source]) => source.includes(needle)).map(([file]) => file)).toEqual(
      [],
    );
  });
});
