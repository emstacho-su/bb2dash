'use client';

/**
 * "Not in Blackboard yet" (Phase 10b, PM call 7; course tab only).
 *
 * The syllabus items linked to a grade component that Blackboard has no column
 * for yet (ECN.304's exams, IST.323's later quizzes and labs). They sit under
 * the gradebook, in their own group, so a hypothetical can be typed on them
 * with the same cell the table uses. Blackboard has recorded nothing for any of
 * them, so the score column is always the dash. A placeholder's link cannot be
 * confirmed here — there is no column to attach an override to.
 *
 * A placeholder the engine dropped as surplus (round 2, R2-4: a part with more
 * items than it expects drops placeholders, earliest due first) is not drawn:
 * IST.323's seeded "Lab #1" disappears once the real Lab #1 column is linked.
 */

import { useState } from 'react';
import { PLACEHOLDER_GROUP } from '@/lib/grade-model/labels';
import { NO_FIGURE, formatPoints } from '@/lib/grade-model-format';
import type { GradeModelItemRow } from '@/lib/grade-model-input';
import { WhatIfCell, type WhatIfProps } from './WhatIfCell';
import styles from './GradeModel.module.css';

function PlaceholderRow({ item, whatIf }: { item: GradeModelItemRow; whatIf: WhatIfProps }) {
  const target = whatIf.targets.get(item.item_key);
  return (
    <tr data-column-kind="placeholder">
      <th scope="row">{item.name}</th>
      <td>
        <span className={styles.dash}>
          {item.possible === null ? NO_FIGURE : `${NO_FIGURE} / ${formatPoints(item.possible)}`}
        </span>
        {target && (
          <WhatIfCell
            target={target}
            value={whatIf.values[item.item_key]}
            onCommit={whatIf.onCommit}
            disabled={whatIf.disabled}
          />
        )}
      </td>
    </tr>
  );
}

export function PlaceholderRows({
  items,
  whatIf,
  dropped,
}: {
  /** `v_grade_model_items` rows with `column_kind = 'placeholder'`. */
  items: readonly GradeModelItemRow[];
  whatIf: WhatIfProps;
  /** The engine's `itemStates().droppedPlaceholderKeys`. */
  dropped: readonly string[];
}) {
  const droppedKeys = new Set(dropped);
  const placeholders = items.filter((item) => item.column_kind === 'placeholder' && !droppedKeys.has(item.item_key));
  const anyValue = placeholders.some((item) => whatIf.values[item.item_key] !== undefined);
  // Derived until the owner toggles it (R2-9): a saved value that arrives after
  // the first render — the scenario read landing late — still opens the group,
  // so a what-if on a placeholder is never hidden behind a collapsed button.
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = toggled ?? anyValue;

  if (placeholders.length === 0) return null;

  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.groupToggle}
        aria-expanded={open}
        onClick={() => setToggled(!open)}
      >
        {PLACEHOLDER_GROUP} ({placeholders.length})
      </button>
      {open && (
        <table className={styles.table}>
          <caption className={styles.srOnly}>{PLACEHOLDER_GROUP}</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {placeholders.map((item) => (
              <PlaceholderRow key={item.item_key} item={item} whatIf={whatIf} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
