/**
 * Round 3, R3-1: every `<th>` / `<td>` in the grades tables stays a table cell.
 *
 * A cell that carries `display: flex` leaves table layout, so the browser wraps
 * it in an anonymous cell and every later cell in the row slides one column
 * over (the status pill under the name, the score under "Submission"). jsdom
 * does not apply the CSS Modules, so the stylesheets are read here: any class
 * whose rule sets `display` to something other than `table-cell` — directly or
 * through `composes` — is a layout class, and no rendered cell may carry one.
 * Every row branch is rendered: link picker, counted tag, ambiguous note,
 * feedback row, bookkeeping group. The score history left the table in Phase
 * 12b (G-5) and the what-if cell and placeholder rows went with the what-if
 * layer in G-1; the feedback row now only appears on a column with no
 * assignment to open, which is what `QUIZ` is here.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import gradebookStyles from '@/components/grades/GradebookTable.module.css';
import modelStyles from '@/components/grades/GradeModel.module.css';
import tokenStyles from '@/styles/tokens.module.css';
import { columnItemKey, type LinkState } from '@/lib/grade-model-view';
import { makeGradebookRow } from './factories.grades';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn(), auth: { getSession: vi.fn() } }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const { GradebookTable } = await import('@/components/grades/GradebookTable');

/* ---------------------------------------------------------------------------
 * Which classes lay a box out as something other than a table cell
 * ------------------------------------------------------------------------ */

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const TOKENS_IMPORT = '@/styles/tokens.module.css';

interface Sheet {
  readonly file: string;
  /** Source class name → the class name the module renders. */
  readonly names: Readonly<Record<string, string>>;
}

const SHEETS: Readonly<Record<string, Sheet>> = {
  gradebook: { file: 'components/grades/GradebookTable.module.css', names: gradebookStyles },
  model: { file: 'components/grades/GradeModel.module.css', names: modelStyles },
  tokens: { file: 'styles/tokens.module.css', names: tokenStyles },
};

interface Rule {
  readonly selectors: readonly string[];
  readonly body: string;
}

function rulesOf(css: string): readonly Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Innermost blocks only, so a rule inside @media is read like any other.
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1].split(',').map((selector) => selector.trim()),
    body: match[2],
  }));
}

/** The last compound of a selector: `.table thead th` → `th`, `.row > td` → `td`. */
function subjectOf(selector: string): string {
  const parts = selector.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

const setsNonCellDisplay = (body: string) =>
  [...body.matchAll(/display\s*:\s*([a-z-]+)/g)].some((match) => match[1] !== 'table-cell');

/** Rendered class names of every layout class, and any rule that restyles th/td display directly. */
function layoutClasses(): { readonly rendered: ReadonlySet<string>; readonly cellRules: readonly string[] } {
  const local = new Map<string, { sheet: string; body: string }[]>();
  const cellRules: string[] = [];
  for (const [sheet, { file }] of Object.entries(SHEETS)) {
    for (const rule of rulesOf(readFileSync(path.join(SRC, file), 'utf8'))) {
      for (const selector of rule.selectors) {
        const subject = subjectOf(selector);
        if (/^(th|td)\b/.test(subject) && setsNonCellDisplay(rule.body)) cellRules.push(`${file}: ${selector}`);
        for (const [, name] of subject.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
          local.set(`${sheet}:${name}`, [...(local.get(`${sheet}:${name}`) ?? []), { sheet, body: rule.body }]);
        }
      }
    }
  }
  const isLayout = (key: string, seen: ReadonlySet<string>): boolean => {
    if (seen.has(key)) return false;
    return (local.get(key) ?? []).some(({ sheet, body }) => {
      if (setsNonCellDisplay(body)) return true;
      return [...body.matchAll(/composes\s*:\s*([\w\s-]+?)(?:\s+from\s+['"]([^'"]+)['"])?\s*;/g)].some(([, names, from]) =>
        names.trim().split(/\s+/).some((name) => {
          const target = from === TOKENS_IMPORT ? 'tokens' : sheet;
          return isLayout(`${target}:${name}`, new Set([...seen, key]));
        }),
      );
    });
  };
  const rendered = new Set<string>();
  for (const key of local.keys()) {
    const [sheet, name] = key.split(':');
    const hashed = SHEETS[sheet].names[name];
    if (hashed && isLayout(key, new Set())) rendered.add(hashed);
  }
  return { rendered, cellRules };
}

/* ---------------------------------------------------------------------------
 * Every branch of both tables, on screen
 * ------------------------------------------------------------------------ */

const LINKED = makeGradebookRow({ course_id: 'IST.466', column_id: '_3562496_1', name: 'Synchrony Major Case #1', possible: 150, assignment_id: null, submission_status: 'SUBMITTED', last_attempt_status: 'NEEDS_GRADING' });
const QUIZ = makeGradebookRow({ column_id: '_3560532_1', name: 'Quiz #3', effective_score: 9.5, possible: 10, display_grade: 'A', feedback: 'Well done.\nSee me.', assignment_id: null, linked_assignments: 0 });
const UNGRADED = makeGradebookRow({ column_id: '_3560541_1', name: 'Lab #2', possible: 50 });
const AMBIGUOUS = makeGradebookRow({ column_id: '_3560600_1', name: 'Reading check', column_kind: 'attendance', linked_assignments: 3, counts_toward_grade: true });
const BOOKKEEPING = makeGradebookRow({ column_id: '_3560700_1', name: 'Attendance', column_kind: 'attendance', counts_toward_grade: false });

const linkKey = columnItemKey('IST.466', '_3562496_1');
const linkState: LinkState = { shellCourseId: 'IST.466', columnId: '_3562496_1', componentId: 24, excluded: false, unsure: true, override: false };
const links = { states: new Map([[linkKey, linkState]]), options: [{ id: 24, name: 'Two Major Case Studies (Synchrony, SU IT)' }], onChange: vi.fn() };

function renderEveryBranch() {
  const view = render(
    <GradebookTable
      rows={[LINKED, QUIZ, UNGRADED, AMBIGUOUS, BOOKKEEPING]}
      links={links}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Attendance and bookkeeping columns/ }));
  return view;
}

describe('grades tables — every th/td stays a table cell (R3-1)', () => {
  it('finds the layout classes in the stylesheets, and no rule restyles a th/td display', () => {
    const { rendered, cellRules } = layoutClasses();
    expect(cellRules).toEqual([]);
    expect(rendered.has(gradebookStyles.nameStack)).toBe(true);
    expect(rendered.has(gradebookStyles.submissionStack)).toBe(true);
    expect(rendered.has(modelStyles.link)).toBe(true);
    expect(rendered.has(tokenStyles.tagNeutral)).toBe(true);
  });

  it('renders every branch with no layout class on a cell itself', () => {
    const { container } = renderEveryBranch();
    const { rendered } = layoutClasses();
    const cells = [...container.querySelectorAll('th, td')];

    expect(container.querySelectorAll('table')).toHaveLength(2);
    expect(screen.getByText('Well done.', { exact: false })).toBeInTheDocument();
    expect(cells.length).toBeGreaterThan(20);

    const offenders = cells
      .filter((cell) => [...cell.classList].some((name) => rendered.has(name)))
      .map((cell) => `${cell.tagName.toLowerCase()}.${cell.className}: ${cell.textContent?.slice(0, 40)}`);
    expect(offenders).toEqual([]);
  });

  it('keeps each cell’s layout on a wrapper inside it', () => {
    const { container } = renderEveryBranch();
    const name = screen.getByText('Synchrony Major Case #1').closest('th') as HTMLElement;
    expect(name.querySelector(`.${gradebookStyles.nameStack}`)).not.toBeNull();
    const submission = container.querySelector(`.${gradebookStyles.submissionStack}`)?.parentElement;
    expect(submission?.tagName).toBe('TD');
  });
});
