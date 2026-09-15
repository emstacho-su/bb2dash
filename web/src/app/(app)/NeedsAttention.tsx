'use client';

/**
 * Home "needs attention" row — GUI decision 5a, Phase 9.
 *
 * Replaces the last-sync line that stood here through Phases 5–8. Collapsed it
 * is typed counts plus one honest freshness line ("last synced 3 hrs ago ·
 * files stale 2 days"); clicking it expands the top five open items in place,
 * with a link to the full Inbox.
 *
 * Everything on the row traces to `v_sync_status` — counts by kind, the latest
 * run, and the `v_data_freshness` rows. Nothing is derived from a guess: when
 * there is no sync run yet the row says so rather than showing a zero that
 * looks like good news.
 */

import { useState } from 'react';
import Link from 'next/link';
import tokens from '@/styles/tokens.module.css';
import styles from './NeedsAttention.module.css';
import {
  ATTENTION_KIND_LABEL,
  HOME_COUNT_KINDS,
  HOME_TOP_N,
  freshnessLine,
  totalOpen,
  useAttentionItems,
  useSyncStatus,
  type AttentionItem,
  type SyncStatus,
} from '@/lib/queries.sync';

export function NeedsAttentionRow() {
  const statusQuery = useSyncStatus();
  const itemsQuery = useAttentionItems('open');

  return (
    <NeedsAttentionView
      status={statusQuery.data ?? null}
      items={itemsQuery.data ?? []}
      loading={statusQuery.isPending}
      error={statusQuery.error ?? null}
    />
  );
}

export interface NeedsAttentionViewProps {
  status: SyncStatus | null;
  items: readonly AttentionItem[];
  loading?: boolean;
  error?: Error | null;
}

export function NeedsAttentionView({
  status,
  items,
  loading = false,
  error = null,
}: NeedsAttentionViewProps) {
  const [expanded, setExpanded] = useState(false);

  const open = totalOpen(status);
  const counts = HOME_COUNT_KINDS.map((kind) => ({
    kind,
    n: status?.open_attention[kind] ?? 0,
  })).filter((entry) => entry.n > 0);

  const top = items.slice(0, HOME_TOP_N);

  return (
    <section className={styles.wrap} aria-label="Needs attention">
      <button
        type="button"
        className={styles.row}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={styles.caret} aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
        <span className={styles.title}>Needs attention</span>

        <span className={styles.counts}>
          {loading && <span className={styles.muted}>checking…</span>}
          {!loading && counts.length === 0 && (
            <span className={styles.muted}>{error ? 'counts unavailable' : 'nothing open'}</span>
          )}
          {counts.map((entry) => (
            <span key={entry.kind} className={styles.count}>
              <b>{entry.n}</b> {ATTENTION_KIND_LABEL[entry.kind]}
            </span>
          ))}
        </span>

        <span className={styles.freshness}>
          {error ? `sync status unavailable: ${error.message}` : freshnessLine(status)}
        </span>
      </button>

      {expanded && (
        <div className={styles.panel}>
          {top.length === 0 ? (
            <p className={styles.empty}>
              {open > 0
                ? 'The counts are in, the items have not loaded yet.'
                : 'Nothing needs you right now.'}
            </p>
          ) : (
            top.map((item) => (
              <div key={item.id} className={styles.item}>
                <span className={tokens.mono}>{item.course_id ?? '—'}</span>
                <span className={styles.itemKind}>{ATTENTION_KIND_LABEL[item.kind]}</span>
                <span className={styles.itemQuestion}>{item.question}</span>
              </div>
            ))
          )}

          <div className={styles.panelFoot}>
            {open > top.length && (
              <span className={styles.muted}>
                {open - top.length} more not shown
              </span>
            )}
            <Link href="/inbox" className={tokens.btnGhost} style={{ fontSize: 'var(--text-sm)' }}>
              Open inbox →
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
