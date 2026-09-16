/**
 * "Counts toward…": offered on a scored unlinked column and on an unsure link
 * (preselected, marked "unsure"), writing a component, "Not graded", a confirm
 * of the link as it stands, or clearing Stack's own override.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LinkColumnControl, linkTargetFor, selectedLinkValue } from '@/components/grades/LinkColumnControl';
import { GradebookTable } from '@/components/grades/GradebookTable';
import { linkStates, type LinkState } from '@/lib/grade-model-view';
import { makeGradebookRow } from './factories.grades';
import { IST466_SYNCHRONY, makeItem } from './factories.grade-model';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const OPTIONS = [
  { id: 24, name: 'Two Major Case Studies (Synchrony, SU IT)' },
  { id: 25, name: 'Team Ethics Case Presentations' },
];

const UNLINKED: LinkState = { shellCourseId: 'IST.323', columnId: '_3560541_1', componentId: null, excluded: false, unsure: false, override: false };
const UNSURE: LinkState = { shellCourseId: 'IST.466', columnId: '_3562496_1', componentId: 24, excluded: false, unsure: true, override: false };

function select(): HTMLSelectElement {
  return screen.getByRole('combobox', { name: /Counts toward…/ }) as HTMLSelectElement;
}

describe('LinkColumnControl', () => {
  it('on a scored unlinked row: nothing selected, a component writes a link', () => {
    const onChange = vi.fn();
    render(<LinkColumnControl state={UNLINKED} options={OPTIONS} columnName="Lab #1" onChange={onChange} />);
    expect(select().value).toBe('');
    expect([...select().options].map((o) => o.textContent)).toEqual([
      'Counts toward…', 'Two Major Case Studies (Synchrony, SU IT)', 'Team Ethics Case Presentations', 'Not graded',
    ]);
    expect(screen.queryByText('unsure')).toBeNull();

    fireEvent.change(select(), { target: { value: '25' } });
    expect(onChange).toHaveBeenCalledWith(UNLINKED, { kind: 'component', componentId: 25 });
  });

  it('on an unsure row: the current component preselected and marked "unsure", confirmable as it stands', () => {
    const onChange = vi.fn();
    render(<LinkColumnControl state={UNSURE} options={OPTIONS} columnName="Synchrony Major Case #1" onChange={onChange} />);
    expect(select().value).toBe('24');
    expect(screen.getByText('unsure')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm link: Synchrony Major Case #1' }));
    expect(onChange).toHaveBeenCalledWith(UNSURE, { kind: 'component', componentId: 24 });
  });

  it('"Not graded" writes an exclusion', () => {
    const onChange = vi.fn();
    render(<LinkColumnControl state={UNLINKED} options={OPTIONS} columnName="Lab #1" onChange={onChange} />);
    fireEvent.change(select(), { target: { value: 'not-graded' } });
    expect(onChange).toHaveBeenCalledWith(UNLINKED, { kind: 'excluded' });
  });

  it('shows the database refusal beside the picker', () => {
    render(<LinkColumnControl state={UNLINKED} options={OPTIONS} columnName="Lab #1" onChange={vi.fn()} error="Could not save the link: nope" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save the link: nope');
  });

  it('maps select values both ways, clearing only an override', () => {
    expect(selectedLinkValue({ componentId: 5, excluded: false })).toBe('5');
    expect(selectedLinkValue({ componentId: null, excluded: true })).toBe('not-graded');
    expect(linkTargetFor('', { override: true })).toEqual({ kind: 'clear' });
    expect(linkTargetFor('', { override: false })).toBeNull();
    expect(linkTargetFor('abc', { override: false })).toBeNull();
  });
});

describe('the picker in the gradebook table', () => {
  const lab = makeGradebookRow({ course_id: 'IST.323', column_id: '_3560541_1', name: 'Lab #1', effective_score: 4, counts_toward_grade: false });
  const quiz = makeGradebookRow({ course_id: 'IST.323', column_id: '_3560530_1', name: 'Quiz #1', effective_score: 10 });
  const attendance = makeGradebookRow({
    course_id: 'GEO.103.recitation', column_id: '_3602445_1', name: 'Attendance', column_kind: 'attendance', effective_score: 0, counts_toward_grade: false,
  });

  const rows = [
    makeItem({ item_key: 'col:IST.323:_3560541_1', shell_course_id: 'IST.323', column_id: '_3560541_1', score: 4, component_id: null, link_source: null, link_confidence: null }),
    makeItem({ item_key: 'col:IST.323:_3560530_1', shell_course_id: 'IST.323', column_id: '_3560530_1', score: 10 }),
    makeItem({ item_key: 'col:GEO.103.recitation:_3602445_1', shell_course_id: 'GEO.103.recitation', column_id: '_3602445_1', score: 0, component_id: 5, link_source: 'override', link_confidence: 'confirmed' }),
    IST466_SYNCHRONY,
  ];

  it('appears on the unlinked row only, not on a confirmed link', () => {
    render(<GradebookTable rows={[lab, quiz]} links={{ states: linkStates(rows), options: OPTIONS, onChange: vi.fn() }} />);
    const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;
    expect(within(rowOf('Lab #1')).getByRole('combobox')).toBeInTheDocument();
    expect(within(rowOf('Quiz #1')).queryByRole('combobox')).toBeNull();
  });

  it('moves an override-linked attendance column up among the items with the "counts toward grade" tag', () => {
    render(<GradebookTable rows={[quiz, attendance]} links={{ states: linkStates(rows), options: OPTIONS, onChange: vi.fn() }} />);
    expect(screen.queryByRole('button', { name: /bookkeeping columns/ })).toBeNull();
    const row = screen.getByText('Attendance').closest('tr') as HTMLElement;
    expect(within(row).getByText('counts toward grade')).toBeInTheDocument();
  });
});
