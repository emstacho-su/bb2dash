/**
 * The Home needs-attention row (GUI decision 5a), rendered from a
 * `v_sync_status` fixture: typed counts, one honest freshness line, and the
 * top five open items with a link to the Inbox when it is expanded.
 *
 * Every number on this row has to come off the view. The last two cases exist
 * because the project rule is that a missing figure shows as missing, never as
 * a zero that reads like good news.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeAttentionItem, makeSyncStatusRow } from './factories';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { NeedsAttentionView } = await import('@/app/(app)/NeedsAttention');
const { normalizeSyncStatus } = await import('@/lib/queries.sync');

function renderRow(
  row: Record<string, unknown> | null = makeSyncStatusRow(),
  items: ReturnType<typeof makeAttentionItem>[] = [],
) {
  return render(<NeedsAttentionView status={normalizeSyncStatus(row)} items={items} />);
}

describe('needs-attention row — the typed counts', () => {
  it('renders one count per kind, in the order the GUI decision lists them', () => {
    renderRow();
    const row = screen.getByRole('button', { name: /Needs attention/ });
    // conflict / needs input / missing / deadline — data_gap is not a Home count.
    expect(row.textContent).toContain('2 conflict');
    expect(row.textContent).toContain('5 needs input');
    expect(row.textContent).toContain('1 missing');
    expect(row.textContent).toContain('3 deadline');
    expect(row.textContent).not.toContain('data gap');
  });

  it('drops a kind with no open rows rather than printing a zero', () => {
    renderRow(makeSyncStatusRow({ open_attention: { conflict: 2 } }));
    const row = screen.getByRole('button', { name: /Needs attention/ });
    expect(row.textContent).toContain('2 conflict');
    expect(row.textContent).not.toContain('missing');
  });

  it('says "nothing open" when the view reports no open rows at all', () => {
    renderRow(makeSyncStatusRow({ open_attention: {} }));
    expect(screen.getByText('nothing open')).toBeInTheDocument();
  });
});

describe('needs-attention row — the freshness line', () => {
  it('names the last sync and the stalest stage', () => {
    renderRow();
    expect(screen.getByText(/last synced .* · files stale \d+ days?/)).toBeInTheDocument();
  });

  it('says there is no sync yet rather than showing an age', () => {
    renderRow(null);
    expect(screen.getByText('no sync recorded yet')).toBeInTheDocument();
  });
});

describe('needs-attention row — expanding', () => {
  it('is collapsed until clicked', () => {
    renderRow(makeSyncStatusRow(), [makeAttentionItem({ id: 1, question: 'Quiz 2 moved.' })]);
    expect(screen.getByRole('button', { name: /Needs attention/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByText('Quiz 2 moved.')).toBeNull();
  });

  it('shows at most the top five items and says how many are left over', () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      makeAttentionItem({ id: i + 1, question: `Question ${i + 1}` }),
    );
    renderRow(makeSyncStatusRow({ open_attention: { conflict: 8 } }), items);

    fireEvent.click(screen.getByRole('button', { name: /Needs attention/ }));
    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.getByText('Question 5')).toBeInTheDocument();
    expect(screen.queryByText('Question 6')).toBeNull();
    expect(screen.getByText('3 more not shown')).toBeInTheDocument();
  });

  it('links to the Inbox from the expanded panel', () => {
    renderRow(makeSyncStatusRow(), [makeAttentionItem({ id: 1 })]);
    fireEvent.click(screen.getByRole('button', { name: /Needs attention/ }));
    expect(screen.getByRole('link', { name: /Open inbox/ })).toHaveAttribute('href', '/inbox');
  });

  it('says so plainly when nothing needs him', () => {
    renderRow(makeSyncStatusRow({ open_attention: {} }), []);
    fireEvent.click(screen.getByRole('button', { name: /Needs attention/ }));
    expect(screen.getByText('Nothing needs you right now.')).toBeInTheDocument();
  });
});

describe('needs-attention row — failure', () => {
  it('reports a failed read instead of rendering counts of zero', () => {
    render(
      <NeedsAttentionView status={null} items={[]} error={new Error('permission denied')} />,
    );
    expect(screen.getByText('counts unavailable')).toBeInTheDocument();
    expect(screen.getByText(/sync status unavailable: permission denied/)).toBeInTheDocument();
  });
});
