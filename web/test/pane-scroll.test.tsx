/**
 * The content pane keeps its scroll position per page (Phase 22, task 26; D-1, entry `app-frame-panes`).
 *
 * Once the pane scrolls and the document does not, the browser no longer puts a scroll position
 * back on Back and Forward. `usePaneScroll` does: a new pathname starts the pane at 0, Back and
 * Forward put back the `scrollTop` the page had when it was left. It keeps that in memory and in
 * `sessionStorage`, never in `localStorage`, and writes nothing to the database.
 */

import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/a' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

const { usePaneScroll } = await import('@/components/shell/usePaneScroll');

/** A pane whose `scrollTop` is a plain number, as a browser's would be. */
function Harness({ withPane = true }: { withPane?: boolean }) {
  const pane = useRef<HTMLDivElement>(null);
  usePaneScroll(pane);
  return withPane ? <div ref={pane} data-testid="pane" /> : <div />;
}

let top = 0;

function mount(withPane = true) {
  const view = render(<Harness withPane={withPane} />);
  const pane = view.queryByTestId('pane');
  if (pane !== null) {
    Object.defineProperty(pane, 'scrollTop', { get: () => top, set: (value: number) => (top = value), configurable: true });
  }
  return { ...view, pane };
}

/** Goes to a page the way a link does: the address changes, then the app re-renders. */
function navigate(view: ReturnType<typeof mount>, path: string, { pop = false } = {}) {
  window.history.pushState({}, '', path);
  route.pathname = path;
  act(() => {
    if (pop) window.dispatchEvent(new PopStateEvent('popstate'));
    view.rerender(<Harness />);
  });
}

function scrollTo(view: ReturnType<typeof mount>, value: number) {
  top = value;
  act(() => {
    view.pane?.dispatchEvent(new Event('scroll'));
  });
}

beforeEach(() => {
  top = 0;
  route.pathname = '/a';
  window.history.pushState({}, '', '/a');
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePaneScroll', () => {
  it('puts the pane at 0 on a new pathname', () => {
    const view = mount();
    scrollTo(view, 300);

    navigate(view, '/b');

    expect(top).toBe(0);
  });

  it('puts back the scrollTop the page had when it was left, on Back', () => {
    const view = mount();
    scrollTo(view, 300);
    navigate(view, '/b');
    scrollTo(view, 40);

    navigate(view, '/a', { pop: true });

    expect(top).toBe(300);
  });

  it('does the same on Forward', () => {
    const view = mount();
    scrollTo(view, 300);
    navigate(view, '/b');
    scrollTo(view, 120);
    navigate(view, '/a', { pop: true });
    expect(top).toBe(300);

    navigate(view, '/b', { pop: true });

    expect(top).toBe(120);
  });

  it('starts a page it has not kept at 0 on Back', () => {
    const view = mount();
    navigate(view, '/b');
    scrollTo(view, 50);

    navigate(view, '/never-seen', { pop: true });

    expect(top).toBe(0);
  });

  it('writes nothing to localStorage (memory and sessionStorage only)', () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    const view = mount();
    scrollTo(view, 300);
    navigate(view, '/b');

    const writes = local.mock.calls.map(([key]) => key);
    expect(window.localStorage.length).toBe(0);
    // sessionStorage shares Storage.prototype: whatever is written is under the pane's own key.
    expect(writes.every((key) => key.startsWith('bb2dash.pane'))).toBe(true);
  });

  it('does nothing when the page has no pane', () => {
    const view = mount(false);

    expect(() => navigate(view, '/b')).not.toThrow();
    expect(top).toBe(0);
  });
});

/* ---------------------------------------------------------------------------
 * Round 3 (S-1, S-6): the flag belongs to one navigation; a position is kept under the page it was scrolled at
 * ------------------------------------------------------------------------ */

/** A Back or Forward: the address changes, `popstate` fires, and only then does the app re-render. */
function popTo(path: string) {
  window.history.pushState({}, '', path);
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

function showPath(view: ReturnType<typeof mount>, path: string) {
  route.pathname = path;
  act(() => {
    view.rerender(<Harness />);
  });
}

describe('usePaneScroll — Back across a query alone (S-1)', () => {
  it('does not carry a Back that kept the pathname into the next ordinary link', () => {
    const view = mount();
    navigate(view, '/grades');
    scrollTo(view, 600);
    navigate(view, '/');
    // An item popout: a ?item= link pushes an entry on the same pathname; Back closes it.
    window.history.pushState({}, '', '/?item=assignment:x');
    popTo('/');

    navigate(view, '/grades');

    expect(top).toBe(0);
  });

  it('does the same across the planner’s ?week= links', () => {
    const view = mount();
    navigate(view, '/grades');
    scrollTo(view, 600);
    navigate(view, '/planner');
    scrollTo(view, 300);
    window.history.pushState({}, '', '/planner?week=2026-10-12');
    popTo('/planner?week=2026-10-05');

    navigate(view, '/grades');

    expect(top).toBe(0);
  });

  it('still restores on a Back that changes the pathname', () => {
    const view = mount();
    navigate(view, '/grades');
    scrollTo(view, 600);
    navigate(view, '/');

    navigate(view, '/grades', { pop: true });

    expect(top).toBe(600);
  });
});
