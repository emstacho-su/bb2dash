/**
 * A popout reopened inside its exit (Phase 22, round 3, S-5).
 *
 * Close item A and, inside the exit time, open item B. The leaving popout takes no presses, so the
 * click on B lands; the host goes back to open without a remount. Focus must still move into the
 * dialog, the dialog must show B, and closing B must put focus on B's opener, not A's. Reopening
 * the same item inside its exit must also end with focus in the dialog.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXIT_TOKEN_LG } from '@/components/shell/useExit';

let currentSearch = '';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(currentSearch),
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/components/popout/AssignmentPopout', () => ({
  AssignmentPopout: ({ assignmentId }: { assignmentId: string }) => <div data-testid="assignment-popout">{assignmentId}</div>,
}));
vi.mock('@/components/popout/SessionPopout', () => ({
  SessionPopout: ({ sessionId }: { sessionId: number }) => <div data-testid="session-popout">{sessionId}</div>,
}));

const { ItemPopout } = await import('@/components/popout/ItemPopout');

const EXIT_MS = 160;
const A = 'item=assignment%3AIST.323%2Fa';
const B = 'item=assignment%3AIST.323%2Fb';

function Page() {
  return (
    <>
      <button type="button">opener A</button>
      <button type="button">opener B</button>
      <ItemPopout />
    </>
  );
}

/** Opens `search` the way a link does: the link is focused by the press, then the URL changes. */
function openFrom(view: ReturnType<typeof render>, opener: string, search: string) {
  screen.getByRole('button', { name: opener }).focus();
  currentSearch = search;
  act(() => view.rerender(<Page />));
}

function close(view: ReturnType<typeof render>) {
  currentSearch = '';
  act(() => view.rerender(<Page />));
}

beforeEach(() => {
  vi.useFakeTimers();
  currentSearch = '';
  vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () => ({ getPropertyValue: (name: string) => (name === EXIT_TOKEN_LG ? `${EXIT_MS}ms` : '') }) as unknown as CSSStyleDeclaration,
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ItemPopout — another item opened inside the exit', () => {
  it('moves focus into the dialog, shows the new item, and gives focus back to its own opener', () => {
    const view = render(<Page />);
    openFrom(view, 'opener A', A);
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);

    close(view);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-leaving');

    openFrom(view, 'opener B', B);

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveAttribute('data-leaving');
    expect(dialog).toHaveTextContent('IST.323/b');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    close(view);
    act(() => {
      vi.advanceTimersByTime(EXIT_MS);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'opener B' })).toHaveFocus();
  });

  it('puts focus back in the dialog when the same item is reopened inside its exit', () => {
    const view = render(<Page />);
    openFrom(view, 'opener A', A);
    close(view);
    act(() => {
      vi.advanceTimersByTime(50);
    });

    openFrom(view, 'opener A', A);

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveAttribute('data-leaving');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });
});
