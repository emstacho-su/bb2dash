/**
 * "Our model": what the container says for each engine answer, in the frozen
 * wording, and the honesty rule that every computed percentage sits inside it.
 * The engine is not involved — these are typed `ModelResult` fixtures.
 */

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DeltaReason, NotComputableReason } from '@/lib/grade-model/types';
import { DELTA_REASON_TEXT } from '@/lib/grade-model/labels';
import { ModelStanding } from '@/components/grades/ModelStanding';
import { COMPUTED_PARTS, NOT_COMPUTED_MANUAL, makeComputed } from './factories.grade-model';

/** Blackboard's own scores grade the same parts `makeComputed` does: no part is graded by what-if values alone. */
const REAL = makeComputed();
/** No item behind a muted part: the tests that are not about the left-out line. */
const NO_UNSURE = { items: [], unsureItemKeys: [] } as const;

function container(): HTMLElement {
  return screen.getByRole('region', { name: 'Our model' });
}

/** Every text node that prints a percentage, anywhere in the document. */
function percentageNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (/\d%/.test(node.textContent ?? '')) found.push(node as Text);
  }
  return found;
}

describe('ModelStanding — a computed course', () => {
  it('leads with graded so far, then zeros on the rest and best case on one line', () => {
    render(<ModelStanding realResult={REAL} {...NO_UNSURE} components={COMPUTED_PARTS} result={makeComputed()} />);
    const model = container();
    expect(within(model).getByText('87.4% (B+)')).toBeInTheDocument();
    expect(within(model).getByText('graded so far')).toBeInTheDocument();
    expect(model.textContent).toContain('zeros on the rest 41.3% (F) · best case 96.0% (A)');
    expect(within(model).getByText('2 of 3 parts graded: Blackboard Quizzes, Exams')).toBeInTheDocument();
  });

  it('says so when a standing uses what-if values, and not otherwise', () => {
    const { rerender } = render(<ModelStanding realResult={REAL} {...NO_UNSURE} components={COMPUTED_PARTS} result={makeComputed()} />);
    expect(screen.queryByText('includes what-if values')).toBeNull();
    rerender(<ModelStanding realResult={REAL} {...NO_UNSURE} components={COMPUTED_PARTS} result={makeComputed({ usesHypotheticals: true })} />);
    expect(within(container()).getByText('includes what-if values')).toBeInTheDocument();
  });

  it('counts a part graded only by what-if values apart from the graded ones (R3-2)', () => {
    const base = makeComputed();
    const withWhatIf = makeComputed({
      usesHypotheticals: true,
      components: base.components.map((c) => (c.componentId === 16 ? { ...c, state: 'partly_graded' as const, usesHypothetical: true } : c)),
    });
    render(<ModelStanding realResult={REAL} {...NO_UNSURE} components={COMPUTED_PARTS} result={withWhatIf} />);
    expect(
      within(container()).getByText('2 of 3 parts graded: Blackboard Quizzes, Exams · what-if on Required Labs'),
    ).toBeInTheDocument();
  });

  describe('a part left out because a link is unsure (R3-3)', () => {
    // IST.466 live: two tentative major-case columns, and the AI Team assignment only as a placeholder.
    const base = makeComputed();
    const mutedPart = (componentId: number, name: string) => ({ ...base.components[2], componentId, name, state: 'muted' as const });
    const muted = makeComputed({
      components: [
        ...base.components,
        mutedPart(24, 'Two Major Case Studies (Synchrony, SU IT)'),
        mutedPart(36, 'AI Team Assignment'),
        mutedPart(40, 'Reflections'),
      ],
    });
    const parts = [
      ...COMPUTED_PARTS,
      { id: 24, parentId: null, isExtraCredit: false },
      { id: 36, parentId: null, isExtraCredit: false },
      { id: 40, parentId: null, isExtraCredit: false },
    ];
    const items = [
      { key: 'col:IST.466:_3562492_1', name: 'SU IT - Major Case #2', kind: 'item' as const, componentId: 24 },
      { key: 'col:IST.466:_3562496_1', name: 'Synchrony Major Case #1', kind: 'item' as const, componentId: 24 },
      { key: 'asg:IST.466/ai-team-assignment', name: 'AI Team Assignment', kind: 'placeholder' as const, componentId: 36 },
      { key: 'col:reflection-1', name: 'Reflection 1', kind: 'item' as const, componentId: 40 },
      { key: 'asg:reflection-2', name: 'Reflection 2', kind: 'placeholder' as const, componentId: 40 },
      { key: 'asg:reflection-3', name: 'Reflection 3', kind: 'placeholder' as const, componentId: 40 },
    ];
    const everyKey = items.map((item) => item.key);

    it('writes one sentence per part, naming the items to confirm and counting the rest', () => {
      render(<ModelStanding realResult={REAL} components={parts} items={items} unsureItemKeys={everyKey} result={muted} />);
      const lines = within(container()).getAllByText(/^Left out:/).map((line) => line.textContent);
      expect(lines).toEqual([
        'Left out: Two Major Case Studies (Synchrony, SU IT) — confirm the unsure links on SU IT - Major Case #2 and Synchrony Major Case #1',
        "Left out: AI Team Assignment — its link is unsure and it isn't in Blackboard yet",
        'Left out: Reflections — confirm the unsure link on Reflection 1; 2 more not in Blackboard yet',
      ]);
    });

    it('names only the item still unsure after one is confirmed', () => {
      const confirmed = everyKey.filter((key) => key !== 'col:IST.466:_3562496_1');
      render(<ModelStanding realResult={REAL} components={parts} items={items} unsureItemKeys={confirmed} result={muted} />);
      expect(
        within(container()).getByText('Left out: Two Major Case Studies (Synchrony, SU IT) — confirm the unsure link on SU IT - Major Case #2'),
      ).toBeInTheDocument();
    });
  });

  it("agrees with Blackboard's number", () => {
    render(
      <ModelStanding realResult={REAL} {...NO_UNSURE} components={COMPUTED_PARTS}
        result={makeComputed({ agreement: { status: 'agrees', modelValue: 14.8, blackboardValue: 14.8, unit: 'points', delta: 0, reasons: [] } })}
      />,
    );
    expect(within(container()).getByText("Agrees with Blackboard's number")).toBeInTheDocument();
  });

  it('differs, and lists every reason in its own words', () => {
    const reasons = Object.keys(DELTA_REASON_TEXT) as DeltaReason[];
    render(
      <ModelStanding realResult={REAL} {...NO_UNSURE} components={COMPUTED_PARTS}
        result={makeComputed({ agreement: { status: 'differs', modelValue: 12.5, blackboardValue: 14.8, unit: 'points', delta: -2.3, reasons } })}
      />,
    );
    const model = container();
    expect(within(model).getByText("Differs from Blackboard's number by 2.3 points:")).toBeInTheDocument();
    for (const reason of reasons) {
      expect(within(model).getByText(DELTA_REASON_TEXT[reason])).toBeInTheDocument();
    }
  });

  it('reports a percentage-unit difference in percentage points', () => {
    render(
      <ModelStanding realResult={REAL} {...NO_UNSURE} components={COMPUTED_PARTS}
        result={makeComputed({ agreement: { status: 'differs', modelValue: 80, blackboardValue: 81.26, unit: 'pct', delta: -1.26, reasons: ['extra_credit'] } })}
      />,
    );
    expect(within(container()).getByText("Differs from Blackboard's number by 1.3 percentage points:")).toBeInTheDocument();
  });

  it('counts scored columns no rule is attached to', () => {
    render(<ModelStanding realResult={REAL} {...NO_UNSURE} components={COMPUTED_PARTS} result={makeComputed({ unlinkedScoredKeys: ['col:IST.323:a', 'col:IST.323:b'] })} />);
    expect(within(container()).getByText('2 scored Blackboard columns are not linked to a syllabus rule')).toBeInTheDocument();
  });

  it('keeps every computed percentage inside the labelled container', () => {
    const { container: root } = render(
      <div>
        <p>Blackboard’s number, as of Sep 16, 1:14 PM</p>
        <p>14.8 / 104</p>
        <ModelStanding realResult={REAL} {...NO_UNSURE} components={COMPUTED_PARTS}
          result={makeComputed({
            usesHypotheticals: true,
            agreement: { status: 'differs', modelValue: 80, blackboardValue: 81, unit: 'pct', delta: -1, reasons: ['muted_component'] },
          })}
        >
          <p>For A- (≥ 90.0%) you need 91.2% average on the 7 remaining items (61.3% of the grade left).</p>
        </ModelStanding>
      </div>,
    );
    const nodes = percentageNodes(root);
    expect(nodes.length).toBeGreaterThanOrEqual(4);
    for (const node of nodes) {
      expect(node.parentElement?.closest('[data-model]')).not.toBeNull();
    }
    expect(container()).toHaveAttribute('data-model');
  });
});

describe('ModelStanding — a course the model cannot speak for', () => {
  const cases: [NotComputableReason, string][] = [
    ['qualitative_method', 'Model not computed — this course is graded qualitatively'],
    ['no_scheme', 'Model not computed — no grading rules recorded'],
    ['unknown_method', 'Model not computed — a grading rule is unknown'],
    ['unknown_aggregation', 'Model not computed — a grading rule is unknown'],
    ['nothing_graded', 'Model not computed yet — nothing that counts has been graded'],
  ];

  it.each(cases)('%s says exactly why', (reason, text) => {
    render(<ModelStanding realResult={REAL} {...NO_UNSURE} components={COMPUTED_PARTS} result={{ state: 'not_computable', reason, unscoredManual: [] }} />);
    expect(within(container()).getByText(text)).toBeInTheDocument();
    expect(percentageNodes(container())).toEqual([]);
  });

  it('names the hand-graded parts that are not scored yet', () => {
    render(<ModelStanding realResult={REAL} {...NO_UNSURE} components={COMPUTED_PARTS} result={NOT_COMPUTED_MANUAL} />);
    expect(within(container()).getByText('Model not computed — Class Participation not scored yet')).toBeInTheDocument();
  });

  it('names two parts with "and"', () => {
    render(
      <ModelStanding realResult={REAL} {...NO_UNSURE} components={COMPUTED_PARTS}
        result={{ state: 'not_computable', reason: 'manual_unscored', unscoredManual: ['Lecture Attendance', 'Discussion Section Attendance & Participation'] }}
      />,
    );
    expect(
      within(container()).getByText('Model not computed — Lecture Attendance and Discussion Section Attendance & Participation not scored yet'),
    ).toBeInTheDocument();
  });

  it('shows a failure as an alert, and loading as loading — never a number', () => {
    const { rerender } = render(<ModelStanding realResult={REAL} {...NO_UNSURE} components={COMPUTED_PARTS} result={null} error="Could not compute the model: boom" />);
    expect(within(container()).getByRole('alert')).toHaveTextContent('Could not compute the model: boom');
    rerender(<ModelStanding realResult={REAL} {...NO_UNSURE} components={COMPUTED_PARTS} result={null} loading />);
    expect(within(container()).getByText('loading…')).toBeInTheDocument();
  });
});
