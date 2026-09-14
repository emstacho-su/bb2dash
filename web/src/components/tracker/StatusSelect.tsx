'use client';

import { STATUS_LABEL, STATUS_OPTIONS, type WorkItem } from '@/lib/queries.today';
import type { ProgressStatus } from '@/lib/queries';
import styles from './StatusSelect.module.css';

/**
 * The status quick-edit (T-06). Lifted out of Today.tsx so the tracker's detail
 * panel, the undated tray and the assignment popout all offer the same control
 * instead of three copies drifting apart.
 *
 * It writes nothing itself: the owner supplies `onChange` and the pending flag,
 * because the mutation (and its optimistic patch) belongs to the screen.
 */
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
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
