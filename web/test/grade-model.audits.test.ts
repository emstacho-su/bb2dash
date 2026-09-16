/**
 * Phase 10b's standing audits, run over the source so a file no test mounts is
 * covered too.
 *
 * 1. The files this phase adds or edits never write V-1's tables, the planner's
 *    progress rows or the gradebook mirror: no `.from('assignments' |
 *    'assignment_progress' | 'bb_gradebook' | 'grading_schemes' |
 *    'grade_components')` chain ends in insert / update / upsert / delete. The
 *    only writes are to `grade_scenarios` and `grade_column_links` — and the
 *    audit proves it can see those, so a pass is not a blind pass.
 * 2. No `service_role` / `sb_secret` anywhere under `web/src`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB = process.cwd();
const SRC = join(WEB, 'src');

/** Everything Phase 10b adds, plus the three screens/tables it edits. */
const PHASE_FILES = [
  'src/lib/queries.grade-model.ts',
  'src/lib/grade-model-input.ts',
  'src/lib/grade-model-view.ts',
  'src/lib/grade-model-format.ts',
  'src/lib/grade-model-run.ts',
  'src/components/grades/ModelStanding.tsx',
  'src/components/grades/WhatIfCell.tsx',
  'src/components/grades/PlaceholderRows.tsx',
  'src/components/grades/TargetSolver.tsx',
  'src/components/grades/ScoreHistory.tsx',
  'src/components/grades/LinkColumnControl.tsx',
  'src/components/grades/useCourseGradeModel.ts',
  'src/components/grades/useCourseModelActions.ts',
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

describe('Phase 10b writes only its own two tables', () => {
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

  it('sees the writes it allows, so the audit is not vacuous', () => {
    const writes = chains(read('src/lib/queries.grade-model.ts'))
      .filter((chain) => WRITE.test(chain.text))
      .map((chain) => chain.relation);
    expect(new Set(writes)).toEqual(new Set(['grade_scenarios', 'grade_column_links']));
  });

  it('catches a protected write when one is planted', () => {
    const planted = "const t = supabase.from('grading_schemes');\nawait t.update({ method: 'points' });";
    expect(chains(planted).some((c) => PROTECTED.includes(c.relation) && WRITE.test(c.text))).toBe(true);
    const inline = "await supabase.from('assignments').select('id').eq('id', 1);\nawait supabase.from('grade_scenarios').upsert({});";
    expect(chains(inline).filter((c) => PROTECTED.includes(c.relation) && WRITE.test(c.text))).toEqual([]);
  });
});

describe('no service-role credential under web/src', () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else out.push(full);
    }
    return out;
  }

  it.each(['service_role', 'sb_secret'])('finds no "%s"', (needle) => {
    expect(walk(SRC).filter((file) => readFileSync(file, 'utf8').includes(needle))).toEqual([]);
  });
});
