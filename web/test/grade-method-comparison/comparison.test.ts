/**
 * G-0 — the grade-method comparison suite (Phase 12b).
 *
 * `docs/planning/80c_PHASE12B_page_pass.md`, Stack's answer 1: before any grade
 * code is removed, measure the candidates. Three methods, one input shape, and
 * a grade derived by hand in every fixture file.
 *
 * Running this writes `docs/planning/80e_GRADE_METHOD_COMPARISON.md`. The report
 * is generated, never hand-edited; it is deterministic, so a clean re-run leaves
 * the file byte-identical.
 *
 * It is a gate, not a decision: nothing here deletes anything. Stack reads
 * `80e` and picks.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIXTURES } from './fixtures';
import { METHODS } from './methods';
import { buildReport, scoreAll, summarise } from './report';

/** The date the fixtures were written. Fixed so the report does not churn. */
const AS_OF = '2026-09-17';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = resolve(HERE, '../../../docs/planning/80e_GRADE_METHOD_COMPARISON.md');

/**
 * Written by hand from the table this run produces. Keep it in step with the
 * numbers beside it — a recommendation that outlives its measurements is worse
 * than none.
 */
const RECOMMENDATION: readonly string[] = [
  '**The syllabus rules are what make the difference, and only the engine has them.**',
  '',
  '* On the nine fixtures where nothing unusual happens the methods agree to within four tenths',
  '  of a point. Every gap in the table above comes from a syllabus rule the two slim methods',
  '  cannot see: dropping a lowest quiz (`F03`, 15 points), averaging quizzes of different sizes',
  '  instead of pooling their points (`F10`, 20.5 points), ranking exams by how well they went',
  '  (`F11`), and giving a normalised category the points the syllabus gives it rather than the',
  '  points its columns happen to add up to (`F15`: 13.5 points out for the points ratio, 7.8 for',
  '  the weighted calculation).',
  '* The **points ratio** adds two failures of its own: it counts a column the syllabus never',
  '  mentions (`F07`, 7 points) and prints 100 % for a course that is not graded numerically at',
  '  all (`F17`). The second is the one that decides it — a fabricated number on a screen.',
  '* The **weighted calculation** never invents a grade and always states one. It is the safer of',
  '  the two slim methods, and it is still 3.0 points out on average and 20.5 at worst. `F18` is',
  '  there because a review found it losing a whole subtree of a syllabus that weights its',
  '  sub-parts; it now rolls up to the outermost weighted row instead, and the fixture guards it.',
  '* The **10b engine** is within 0.12 points on average wherever it answers, and it fails in one',
  '  direction only: it goes quiet. On three of the six real course shapes (`F12`, `F13`, `F14`) a',
  '  hand-graded part carries no score yet and the whole course goes blank — which is exactly what',
  '  the preview shows today, where no course displays a model at all. Its one wrong number (`F16`,',
  '  1.5 points) comes from the same instinct: a part whose syllabus link is marked "unsure" is',
  '  dropped from the headline, taking a graded 135/150 with it.',
  '',
  "**What the numbers say to do.** The engine's arithmetic is the only one that tracks the",
  'syllabus, and its two silencing rules are the only places it is wrong. With both turned off —',
  'no engine code changed; the muting side-stepped in the input and the hand-graded gate through',
  "the engine's own ungated entry point — it reproduces all sixteen hand-derived grades exactly",
  'and never invents one. That is the last row of the table, and it is a variant of the engine,',
  'not a fourth candidate.',
  '',
  'The ranking on these fixtures: the engine with its two gates relaxed, then the engine as built,',
  'then the weighted calculation, then the points ratio.',
  '',
  "Read as a decision — Stack's to make, and nothing is deleted before he makes it:",
  '',
  "1. **Keep the engine's graded-so-far and relax the two gates.** An unscored hand-graded part",
  '   becomes ordinary ungraded work, out of both sides — which the engine already does for every',
  '   other ungraded part — and an unsure link stops hiding a graded score, keeping its "unsure"',
  '   label on screen instead. Everything else Phase 10b built (what-if cells, the target solver,',
  '   the scenario table, the zeros-on-the-rest and best-case projections) still goes, per',
  '   P-grades-3. Cost: the engine is 24 files and about 1,750 lines that have to stay.',
  '2. **Take the weighted calculation** if the engine\'s size is the objection rather than its',
  '   numbers. It is one file of under 300 lines with no database objects behind it, at a cost of',
  '   roughly 3 points of accuracy and up to 20 on a course that averages work of different sizes.',
  '   `IST.352` and `GEO.103` are such courses.',
  '3. **Do not take the points ratio.** It is the only method here that states a grade where none',
  '   exists.',
  '',
  'Whatever wins, `v_gradebook_history` and `ScoreHistory` stay — the desktop poller reads that',
  'view and no method here touches it.',
];

const rows = scoreAll(FIXTURES, METHODS);
const summaries = METHODS.map((method) => summarise(rows, method));

describe('fixtures', () => {
  it('covers at least the twelve cases the brief names', () => {
    expect(FIXTURES.length).toBeGreaterThanOrEqual(12);
  });

  it('has no duplicate ids', () => {
    expect(new Set(FIXTURES.map((fixture) => fixture.id)).size).toBe(FIXTURES.length);
  });

  it.each(FIXTURES.map((fixture) => [fixture.id, fixture] as const))(
    '%s states a truth its own written-out arithmetic reproduces',
    (_id, fixture) => {
      const derived = fixture.derivation();
      if (fixture.truth.state === 'not_computed') {
        expect(derived).toBeNull();
        return;
      }
      expect(derived).not.toBeNull();
      expect(derived as number).toBeCloseTo(fixture.truth.pct, 10);
    },
  );

  it.each(FIXTURES.map((fixture) => [fixture.id, fixture] as const))(
    '%s is labelled dummy data, so no figure here can be mistaken for Blackboard',
    (_id, fixture) => {
      expect(fixture.input.scheme?.courseId).toMatch(/^DUMMY\./);
    },
  );
});

describe('methods', () => {
  it.each(
    FIXTURES.flatMap((fixture) =>
      METHODS.map((method) => [`${fixture.id} · ${method.label}`, fixture, method] as const),
    ),
  )('%s returns a well-formed outcome', (_label, fixture, method) => {
    const outcome = method.run(fixture.input);
    if (outcome.state === 'computed') {
      expect(Number.isFinite(outcome.pct)).toBe(true);
    } else {
      expect(outcome.reason).not.toBe('');
    }
  });

  it('scores every fixture against every method', () => {
    expect(rows).toHaveLength(FIXTURES.length);
    rows.forEach((row) => expect(row.cells).toHaveLength(METHODS.length));
  });
});

describe('the report', () => {
  it('writes 80e_GRADE_METHOD_COMPARISON.md from this run', () => {
    const markdown = buildReport({
      rows,
      methods: METHODS,
      summaries,
      recommendation: RECOMMENDATION,
      asOf: AS_OF,
    });

    // Every other doc in the repo is CRLF (core.autocrlf = true, no
    // .gitattributes), so this one is too.
    mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, markdown.replace(/\n/g, '\r\n'), 'utf8');

    FIXTURES.forEach((fixture) => expect(markdown).toContain(fixture.id));
    METHODS.forEach((method) => expect(markdown).toContain(method.label));
    expect(markdown).toContain('## Recommendation');
  });
});
