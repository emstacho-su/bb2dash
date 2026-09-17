/**
 * Scoring and the markdown report for task G-0.
 *
 * Deterministic on purpose: the same fixtures produce the same bytes, so
 * `80e_GRADE_METHOD_COMPARISON.md` only changes when a fixture or a method
 * changes. No clock, no randomness.
 */

import type { ComparisonMethod, MethodOutcome } from './methods';
import type { ComparisonFixture } from './types';

/** What one method did on one fixture, measured against the hand-derived truth. */
export type Verdict =
  /** Both the truth and the method have a number. `absError` is set. */
  | 'measured'
  /** The truth is that there is no grade, and the method agreed. */
  | 'agreed_no_grade'
  /** The truth is that there is no grade; the method printed one anyway. */
  | 'invented'
  /** A true grade exists; the method refused to state one. */
  | 'refused';

export interface Cell {
  readonly methodId: string;
  readonly outcome: MethodOutcome;
  readonly verdict: Verdict;
  /** Absolute percentage-point error; null unless the verdict is `measured`. */
  readonly absError: number | null;
}

export interface Row {
  readonly fixture: ComparisonFixture;
  readonly cells: readonly Cell[];
}

export interface Summary {
  readonly methodId: string;
  readonly label: string;
  readonly measured: number;
  readonly meanAbsError: number | null;
  readonly maxAbsError: number | null;
  /** The fixture id carrying `maxAbsError`. */
  readonly worstFixtureId: string | null;
  readonly invented: readonly string[];
  readonly refused: readonly string[];
}

export function scoreCell(fixture: ComparisonFixture, method: ComparisonMethod): Cell {
  const outcome = method.run(fixture.input);
  const base = { methodId: method.id, outcome } as const;
  if (fixture.truth.state === 'not_computed') {
    return outcome.state === 'computed'
      ? { ...base, verdict: 'invented', absError: null }
      : { ...base, verdict: 'agreed_no_grade', absError: null };
  }
  if (outcome.state === 'not_computed') return { ...base, verdict: 'refused', absError: null };
  return { ...base, verdict: 'measured', absError: Math.abs(outcome.pct - fixture.truth.pct) };
}

export function scoreAll(
  fixtures: readonly ComparisonFixture[],
  methods: readonly ComparisonMethod[],
): readonly Row[] {
  return fixtures.map((fixture) => ({
    fixture,
    cells: methods.map((method) => scoreCell(fixture, method)),
  }));
}

function cellsFor(rows: readonly Row[], methodId: string): readonly { row: Row; cell: Cell }[] {
  return rows.flatMap((row) => row.cells.filter((cell) => cell.methodId === methodId).map((cell) => ({ row, cell })));
}

export function summarise(rows: readonly Row[], method: ComparisonMethod): Summary {
  const mine = cellsFor(rows, method.id);
  const measured = mine.filter((entry) => entry.cell.verdict === 'measured');
  const errors = measured.map((entry) => entry.cell.absError as number);
  const max = errors.length === 0 ? null : Math.max(...errors);
  const worst = measured.find((entry) => entry.cell.absError === max);
  return {
    methodId: method.id,
    label: method.label,
    measured: measured.length,
    meanAbsError: errors.length === 0 ? null : errors.reduce((a, b) => a + b, 0) / errors.length,
    maxAbsError: max,
    worstFixtureId: worst?.row.fixture.id ?? null,
    invented: mine.filter((entry) => entry.cell.verdict === 'invented').map((entry) => entry.row.fixture.id),
    refused: mine.filter((entry) => entry.cell.verdict === 'refused').map((entry) => entry.row.fixture.id),
  };
}

/* ---------------------------------------------------------------------------
 * Markdown
 * ------------------------------------------------------------------------ */

const NONE = '—';

function pctText(value: number): string {
  return `${value.toFixed(2)} %`;
}

function truthText(fixture: ComparisonFixture): string {
  return fixture.truth.state === 'computed' ? pctText(fixture.truth.pct) : `no grade (${fixture.truth.why})`;
}

function cellText(cell: Cell): string {
  if (cell.outcome.state === 'not_computed') {
    return cell.verdict === 'agreed_no_grade'
      ? `no grade (\`${cell.outcome.reason}\`)`
      : `**no number** (\`${cell.outcome.reason}\`)`;
  }
  return cell.verdict === 'invented' ? `**${pctText(cell.outcome.pct)}** (invented)` : pctText(cell.outcome.pct);
}

function errorText(cell: Cell): string {
  if (cell.absError === null) return cell.verdict === 'agreed_no_grade' ? 'ok' : 'fail';
  return cell.absError.toFixed(4);
}

function resultsTable(rows: readonly Row[], methods: readonly ComparisonMethod[]): readonly string[] {
  const head = ['| fixture | true grade so far |', ...methods.map((m) => ` ${m.label} | Δ |`)].join('');
  const rule = ['|---|---|', ...methods.map(() => '---|---|')].join('');
  const body = rows.map((row) =>
    [
      `| ${row.fixture.id} ${row.fixture.title} | ${truthText(row.fixture)} |`,
      ...row.cells.map((cell) => ` ${cellText(cell)} | ${errorText(cell)} |`),
    ].join(''),
  );
  return [head, rule, ...body];
}

function summaryTable(summaries: readonly Summary[], total: number): readonly string[] {
  return [
    '| method | stated a number | mean abs error | max abs error | worst fixture | invented a grade | refused a real grade |',
    '|---|---|---|---|---|---|---|',
    ...summaries.map((s) =>
      `| ${s.label} | ${s.measured} of ${total} measurable `
      + `| ${s.meanAbsError === null ? NONE : s.meanAbsError.toFixed(4)} `
      + `| ${s.maxAbsError === null ? NONE : s.maxAbsError.toFixed(4)} `
      + `| ${s.worstFixtureId ?? NONE} `
      + `| ${s.invented.length === 0 ? 'none' : s.invented.join(', ')} `
      + `| ${s.refused.length === 0 ? 'none' : s.refused.join(', ')} |`,
    ),
  ];
}

function failureLines(rows: readonly Row[], method: ComparisonMethod, summary: Summary): readonly string[] {
  const mine = cellsFor(rows, method.id);
  const bad = mine.filter(
    (entry) => entry.cell.verdict !== 'agreed_no_grade' && (entry.cell.absError ?? 1) > 0.0001,
  );
  if (bad.length === 0) return [`**${method.label}** — no fixture separates it from the hand-derived truth.`, ''];
  return [
    `**${method.label}** — mean ${summary.meanAbsError?.toFixed(4) ?? NONE}, max `
    + `${summary.maxAbsError?.toFixed(4) ?? NONE} percentage points.`,
    '',
    ...bad.map((entry) => {
      const { cell, row } = entry;
      const what =
        cell.verdict === 'invented'
          ? `printed ${pctText((cell.outcome as { pct: number }).pct)} where there is no grade`
          : cell.verdict === 'refused'
            ? `stated nothing where the true grade is ${truthText(row.fixture)}`
            : `read ${cellText(cell)} against ${truthText(row.fixture)} (${cell.absError?.toFixed(4)} off)`;
      return `* \`${row.fixture.id}\` ${row.fixture.title} — ${what}. Probe: ${row.fixture.probes}`;
    }),
    '',
  ];
}

export interface ReportInput {
  readonly rows: readonly Row[];
  readonly methods: readonly ComparisonMethod[];
  readonly summaries: readonly Summary[];
  /** Plain-language recommendation, written by hand in the test file. */
  readonly recommendation: readonly string[];
  /** The date the suite was written. Fixed, so a re-run produces the same bytes. */
  readonly asOf: string;
}

export function buildReport({ rows, methods, summaries, recommendation, asOf }: ReportInput): string {
  const measurable = rows.filter((row) => row.fixture.truth.state === 'computed').length;
  return [
    '# 80e — Grade method comparison (Phase 12b, task G-0)',
    '',
    `Generated by \`web/test/grade-method-comparison/comparison.test.ts\`. Do not edit by hand —`,
    `re-run \`npm test\` in \`web/\` instead. Fixtures as of ${asOf}.`,
    '',
    "Stack's answer 1 asks for the numbers before anything is deleted. Three ways of saying",
    '"grade so far" are run over the same input and scored against a grade derived by hand in',
    'each fixture file. **Every fixture is dummy data** — invented scores on real scheme shapes.',
    'Nothing here is his gradebook and nothing here reaches a screen.',
    '',
    '## What "grade so far" is taken to mean',
    '',
    'One definition, applied to every fixture before any code runs:',
    '',
    '> A part that has at least one graded, countable item stands at whatever the syllabus rule',
    '> for that part makes of its graded items, and carries its full weight (or points) in the',
    '> figure. A part with nothing graded is out of both sides. A countable item has positive',
    '> points, is not exempt and is not excluded — a zero-point completion column is a tick',
    "> (Stack's answer 2). Extra credit raises what is earned and never what it is out of.",
    '',
    '## The methods',
    '',
    ...methods.map((method) => `* **${method.label}** — ${method.note}`),
    '',
    '## Absolute error per fixture',
    '',
    'Δ is percentage points away from the hand-derived truth; `ok` means the method agreed that',
    'there is no grade, `fail` means it disagreed about whether a grade exists at all.',
    '',
    ...resultsTable(rows, methods),
    '',
    '## Per method',
    '',
    ...summaryTable(summaries, measurable),
    '',
    '## Where each method fails, and why',
    '',
    ...methods.flatMap((method) =>
      failureLines(rows, method, summaries.find((s) => s.methodId === method.id) as Summary),
    ),
    '## Recommendation',
    '',
    ...recommendation,
    '',
  ].join('\n');
}
