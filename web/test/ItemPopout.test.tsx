/**
 * The route-driven popout host: does `?item=` open the right panel, and does
 * closing it put the URL — and the reader's focus — back where they were?
 *
 * The two panels are stubbed. What is under test here is the routing and the
 * modal shell, not the data each panel fetches; a real panel would drag the
 * whole query layer into the test for no extra coverage.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Mutable so a test can change the URL between renders. */
let currentSearch = '';
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(currentSearch),
  usePathname: () => '/',
  useRouter: () => ({ replace, push: vi.fn() }),
}));

vi.mock('@/components/popout/AssignmentPopout', () => ({
  AssignmentPopout: ({ assignmentId }: { assignmentId: string }) => (
    <div data-testid="assignment-popout">{assignmentId}</div>
  ),
}));

vi.mock('@/components/popout/SessionPopout', () => ({
  SessionPopout: ({ sessionId }: { sessionId: number }) => (
    <div data-testid="session-popout">{sessionId}</div>
  ),
}));

const { ItemPopout } = await import('@/components/popout/ItemPopout');

beforeEach(() => {
  currentSearch = '';
  replace.mockClear();
});

describe('ItemPopout — opening from the query parameter', () => {
  it('renders nothing without an item parameter', () => {
    render(<ItemPopout />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the assignment panel for ?item=assignment:<id>', () => {
    currentSearch = 'item=assignment%3AIST.323%2Flab-1';
    render(<ItemPopout />);
    expect(screen.getByRole('dialog', { name: 'Assignment detail' })).toBeInTheDocument();
    expect(screen.getByTestId('assignment-popout')).toHaveTextContent('IST.323/lab-1');
  });

  it('opens the session panel for ?item=session:<id>', () => {
    currentSearch = 'item=session%3A12';
    render(<ItemPopout />);
    expect(screen.getByRole('dialog', { name: 'Session detail' })).toBeInTheDocument();
    expect(screen.getByTestId('session-popout')).toHaveTextContent('12');
  });

  it('stays shut for a parameter it cannot make sense of', () => {
    for (const value of ['item=reading%3A4', 'item=session%3Aabc', 'item=assignment%3A']) {
      currentSearch = value;
      const { unmount } = render(<ItemPopout />);
      expect(screen.queryByRole('dialog')).toBeNull();
      unmount();
    }
  });
});

describe('ItemPopout — closing', () => {
  beforeEach(() => {
    currentSearch = 'item=assignment%3AIST.323%2Flab-1';
  });

  it('drops the parameter when ✕ is pressed', () => {
    render(<ItemPopout />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(replace).toHaveBeenCalledWith('/', { scroll: false });
  });

  it('drops the parameter on Escape', () => {
    render(<ItemPopout />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(replace).toHaveBeenCalledWith('/', { scroll: false });
  });

  it('closes on a click outside the panel', () => {
    render(<ItemPopout />);
    const dialog = screen.getByRole('dialog');
    fireEvent.mouseDown(dialog.parentElement as HTMLElement);
    expect(replace).toHaveBeenCalledWith('/', { scroll: false });
  });

  it('keeps the rest of the query string', () => {
    currentSearch = 'item=assignment%3AIST.323%2Flab-1&view=timeline';
    render(<ItemPopout />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(replace).toHaveBeenCalledWith('/?view=timeline', { scroll: false });
  });

  it('does not close on a click inside the panel', () => {
    render(<ItemPopout />);
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('ItemPopout — focus', () => {
  it('moves focus into the panel and hands it back to the opener on close', () => {
    currentSearch = '';
    const { rerender } = render(
      <>
        <button type="button" data-testid="opener">
          Lab #1
        </button>
        <ItemPopout />
      </>,
    );

    const opener = screen.getByTestId('opener');
    opener.focus();
    expect(document.activeElement).toBe(opener);

    // The URL gains the parameter; the popout mounts.
    currentSearch = 'item=assignment%3AIST.323%2Flab-1';
    rerender(
      <>
        <button type="button" data-testid="opener">
          Lab #1
        </button>
        <ItemPopout />
      </>,
    );
    expect(document.activeElement).toBe(screen.getByRole('dialog'));

    // The parameter goes away; focus returns to the row that opened it.
    currentSearch = '';
    rerender(
      <>
        <button type="button" data-testid="opener">
          Lab #1
        </button>
        <ItemPopout />
      </>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
