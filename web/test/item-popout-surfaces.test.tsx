/**
 * `/planner` is the ONLY screen T-2 changed (P-planner-5).
 *
 * Stack asked for a small popover "on planner only"; every other surface keeps
 * opening the full `?item=` panel over the screen it is on. That is easy to
 * break by accident — the popover and the popout are one prop apart — so this
 * is the guard.
 *
 * Two kinds of check. A render of the two shared row components Home, the
 * course Grades tab and `/grades` all draw through, asserting the real `?item=`
 * href is still on the link; and a scan of the source for every other surface
 * that opens one, asserting it still goes through `itemQuery` and that nothing
 * in the planner does.
 *
 * `GradebookTable` is both Grades screens (`/grades` and the course tab render
 * the same component), and `UpcomingTracker` is Home's strip.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkItem } from './factories';
import { IST323_QUIZ } from './factories.grades';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn(), auth: { getSession: vi.fn() } }),
}));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
}));

const { GradebookTable } = await import('@/components/grades/GradebookTable');
const { UpcomingTracker } = await import('@/components/tracker/UpcomingTracker');

const TODAY = '2026-09-10';

/* ---------------------------------------------------------------------------
 * Rendered
 * ------------------------------------------------------------------------ */

describe('Grades still opens the `?item=` popout', () => {
  afterEach(() => window.localStorage.clear());

  it('links a gradebook item to the popout, not to the planner popover', () => {
    render(<GradebookTable rows={[IST323_QUIZ]} />);

    const link = screen.getByRole('link', { name: 'Quiz 2' });
    expect(link).toHaveAttribute('href', '?item=assignment%3AIST.323%2Fquiz-2');
    expect(link.getAttribute('href')).not.toContain('/assignment/');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Home still opens the `?item=` popout', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 10, 9, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('links a tracked item to the popout from the day panel', () => {
    render(
      <UpcomingTracker
        items={[makeWorkItem({ item_id: 'IST.323/lab-1', title: 'Lab #1', due_on: TODAY })]}
        onStatusChange={vi.fn()}
      />,
    );

    // The day panel opens on the column that was clicked; today is the first.
    fireEvent.click(screen.getAllByRole('tab')[0]);
    const link = within(document.body).getByRole('link', { name: 'Lab #1' });
    expect(link).toHaveAttribute('href', '?item=assignment%3AIST.323%2Flab-1');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Scanned
 * ------------------------------------------------------------------------ */

const SRC = join(process.cwd(), 'src');

function source(relative: string): string {
  return readFileSync(join(SRC, ...relative.split('/')), 'utf8');
}

describe('every surface but the planner opens the `?item=` popout', () => {
  /** Screen → the file that builds its assignment link. */
  const SURFACES = [
    'app/(app)/Today.tsx',
    'app/(app)/inbox/Inbox.tsx',
    'components/tracker/UpcomingTracker.tsx',
    'components/grades/GradebookTable.tsx',
  ];

  it.each(SURFACES)('%s still links through itemQuery', (path) => {
    const text = source(path);
    expect(text).toMatch(/from\s+['"]@\/lib\/queries\.popout['"]/);
    expect(text).toContain("itemQuery({ kind: 'assignment'");
  });

  it('the planner builds no `?item=` link at all', () => {
    for (const file of [
      'components/planner/PlannerItem.tsx',
      'components/planner/PlannerWeek.tsx',
      'components/planner/PlannerBoard.tsx',
      'components/planner/PlannerItemPopover.tsx',
    ]) {
      const text = source(file);
      expect(text, `${file} must not open the ?item= popout`).not.toMatch(
        /\bitemQuery\b|\bitemHref\b/,
      );
    }
  });

  it('the popout host is still mounted for every screen', () => {
    const layout = source('app/(app)/layout.tsx');
    expect(layout).toContain('<ItemPopout />');
  });
});
