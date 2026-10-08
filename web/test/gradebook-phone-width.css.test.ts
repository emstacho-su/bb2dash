/**
 * Phase 22, task 14 (R-46): the gradebook scrolls inside its own box.
 *
 * At 390 px a gradebook table is wider than the page. The Contract wants one
 * horizontal scroll container around both tables (the items and the bookkeeping
 * group), so the table slides inside its box and the page does not move. Two
 * things must hold at the same time:
 *
 *   - the container carries `overflow-x: auto` and the frozen hook
 *     `data-scroll-box="gradebook"` (the phone-width spec reads the first such
 *     element on /course/IST.466/grades), and
 *   - no `th` / `td` rule gains `overflow` or `display`: a cell stays a cell
 *     (GradesTables.layout.test.tsx, round 3, R3-1).
 *
 * jsdom lays nothing out, so the rules are asserted from the stylesheets, the
 * way planner-css.test.ts does it, and the hook from the rendered DOM.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import gradebookStyles from '@/components/grades/GradebookTable.module.css';
import { makeGradebookRow } from './factories.grades';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn(), auth: { getSession: vi.fn() } }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    createElement('a', { href }, children),
}));

const { GradebookTable } = await import('@/components/grades/GradebookTable');

const COMPONENTS = join(process.cwd(), 'src/components/grades');
const HOOK = 'data-scroll-box';
const HOOK_VALUE = 'gradebook';

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

const GRADEBOOK_CSS = stripComments(readFileSync(join(COMPONENTS, 'GradebookTable.module.css'), 'utf8'));
const MODEL_CSS = stripComments(readFileSync(join(COMPONENTS, 'GradeModel.module.css'), 'utf8'));

interface Rule {
  readonly selectors: readonly string[];
  readonly body: string;
}

/** Innermost blocks only, so a rule inside @media is read like any other. */
function rulesOf(css: string): readonly Rule[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selectors: match[1].split(',').map((selector) => selector.trim()),
    body: match[2],
  }));
}

/** The last compound of a selector: `.table thead th` is `th`, `.row > td` is `td`. */
function subjectOf(selector: string): string {
  const parts = selector.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

function ruleBody(css: string, selector: string): string {
  const found = rulesOf(css).find((rule) => rule.selectors.includes(selector));
  if (!found) throw new Error(`no rule for "${selector}"`);
  return found.body;
}

const ROWS = [
  makeGradebookRow({ column_id: '_1_1', name: 'Quiz #3', effective_score: 9.5, possible: 10, assignment_id: null, linked_assignments: 0 }),
  makeGradebookRow({ column_id: '_2_1', name: 'Attendance', column_kind: 'attendance', counts_toward_grade: false }),
];

describe('gradebook at phone width: the table scrolls inside its box', () => {
  it('gives the wrapper rule overflow-x: auto and no vertical scroll', () => {
    const body = ruleBody(GRADEBOOK_CSS, '.wrap');
    expect(body).toMatch(/overflow-x\s*:\s*auto\s*;/);
    expect(body).not.toMatch(/overflow-y\s*:/);
    expect(body).not.toMatch(/(^|[;\s])overflow\s*:/);
  });

  it('lets the box shrink inside its parent, so it scrolls instead of widening the page', () => {
    expect(ruleBody(GRADEBOOK_CSS, '.wrap')).toMatch(/min-width\s*:\s*0\s*;/);
  });

  it('gives no th / td rule an overflow or a display, in either grades stylesheet', () => {
    const offenders: string[] = [];
    for (const [file, css] of [
      ['GradebookTable.module.css', GRADEBOOK_CSS],
      ['GradeModel.module.css', MODEL_CSS],
    ] as const) {
      for (const rule of rulesOf(css)) {
        for (const selector of rule.selectors) {
          if (!/^(th|td)\b/.test(subjectOf(selector))) continue;
          if (/(^|[;\s])(overflow(-[xy])?|display)\s*:/.test(rule.body)) offenders.push(`${file}: ${selector}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('puts the frozen hook on the wrapper, once, in the source', () => {
    const source = readFileSync(join(COMPONENTS, 'GradebookTable.tsx'), 'utf8');
    const hooks = source.match(new RegExp(`${HOOK}="${HOOK_VALUE}"`, 'g')) ?? [];
    expect(hooks).toHaveLength(1);
    expect(source).toMatch(
      new RegExp(`<div\\s+className=\\{styles\\.wrap\\}\\s+${HOOK}="${HOOK_VALUE}"\\s*>`),
    );
  });

  it('renders one box with the hook around both tables, carrying the wrapper class', () => {
    const { container, getByRole } = render(createElement(GradebookTable, { rows: ROWS }));
    fireEvent.click(getByRole('button', { name: /Attendance and bookkeeping columns/ }));

    const boxes = container.querySelectorAll(`[${HOOK}="${HOOK_VALUE}"]`);
    expect(boxes).toHaveLength(1);
    const box = boxes[0] as HTMLElement;
    expect(box.className).toContain(gradebookStyles.wrap);
    expect(box.querySelectorAll('table')).toHaveLength(2);
    expect(container.querySelectorAll('table')).toHaveLength(2);
  });
});
