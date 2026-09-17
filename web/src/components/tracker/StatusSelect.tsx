'use client';

import type { WorkItem } from '@/lib/queries.today';
import { OFFERED_STATUSES, foldStatus, statusLabel } from '@/lib/progress-status';
import type { ProgressStatus } from '@/lib/queries';
import styles from './StatusSelect.module.css';

/**
 * The status quick-edit (T-06). Lifted out of Today.tsx so the tracker's detail
 * panel, the undated tray and the assignment popout all offer the same control
 * instead of three copies drifting apart.
 *
 * It writes nothing itself: the owner supplies `onChange` and the pending flag,
 * because the mutation (and its optimistic patch) belongs to the screen.
 *
 * S-1 (P-grades-7): the vocabulary is `@/lib/progress-status` and nowhere else.
 */

/**
 * The options every status menu in the app offers: the six, in Stack's order,
 * plus — only when the row holds one — a disabled entry for a retired value.
 *
 * That last one matters. The Postgres enum keeps its nine values (migrations
 * are additive), and until migration 078 folds the rows, `assignment_progress`
 * still holds `planned`, `waived` and `not_applicable`. A controlled <select>
 * whose value matches no option renders as its FIRST option — so a `waived` row
 * would have silently displayed "not opened", and the first time Stack touched
 * anything on that row it would have been written as such. The disabled entry
 * makes the control show the value's fold ("excused") and offer no way to
 * choose it, so nothing is rewritten by being looked at.
 */
export function StatusOptions({ value }: { value: ProgressStatus | null | undefined }) {
  const stored = value ?? null;
  const retired =
    stored !== null && !(OFFERED_STATUSES as readonly string[]).includes(stored);

  return (
    <>
      {OFFERED_STATUSES.map((status) => (
        <option key={status} value={status}>
          {statusLabel(status)}
        </option>
      ))}
      {retired && (
        <option
          value={stored}
          disabled
          title={`stored as "${stored}", which reads as ${statusLabel(foldStatus(stored))}`}
        >
          {statusLabel(stored)}
        </option>
      )}
    </>
  );
}
export function StatusSelect({
  item,
  onChange,
  pending,
}: {
  item: WorkItem;
  onChange: (item: WorkItem, status: ProgressStatus) => void;
  pending: boolean;
}) {
  return (
    <select
      className={styles.statusSelect}
      value={item.status}
      disabled={pending}
      aria-label={`Status for ${item.title}`}
      onChange={(e) => onChange(item, e.target.value as ProgressStatus)}
    >
      <StatusOptions value={item.status} />
    </select>
  );
}
