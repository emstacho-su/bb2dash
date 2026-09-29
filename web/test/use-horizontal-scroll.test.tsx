/**
 * S2-home-1 / P-69 — a plain mouse can move a horizontal strip.
 *
 * `useHorizontalScroll` turns a vertical wheel into a sideways scroll and lets
 * a press-and-drag move the strip. A drag past DRAG_THRESHOLD_PX swallows the
 * click that follows it; a shorter press is still a click.
 *
 * jsdom has no layout, so the scroller's widths and `scrollLeft` are stubbed
 * on the one element under test.
 */

import { useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DRAG_THRESHOLD_PX, useHorizontalScroll } from '@/lib/use-horizontal-scroll';

const CLIENT_WIDTH = 300;
const SCROLL_WIDTH = 1000;

function Strip({ onItem }: { onItem: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useHorizontalScroll(ref);
  return (
    <div ref={ref} data-testid="strip">
      <button type="button" onClick={onItem}>
        Item
      </button>
    </div>
  );
}

/** Give the strip a layout: 300 px wide over 1000 px of content. */
function renderStrip(startLeft = 0) {
  const onItem = vi.fn();
  render(<Strip onItem={onItem} />);
  const el = screen.getByTestId('strip');
  let left = startLeft;
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => CLIENT_WIDTH });
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => SCROLL_WIDTH });
  Object.defineProperty(el, 'scrollLeft', {
    configurable: true,
    get: () => left,
    set: (value: number) => {
      left = value;
    },
  });
  return { el, onItem, item: screen.getByRole('button', { name: 'Item' }) };
}

/** Dispatch a wheel event and report whether the hook claimed it. */
function wheel(el: HTMLElement, init: WheelEventInit): boolean {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(event);
  return event.defaultPrevented;
}

function press(target: HTMLElement, fromX: number, toX: number) {
  fireEvent.pointerDown(target, { pointerType: 'mouse', button: 0, clientX: fromX });
  fireEvent.pointerMove(target, { pointerType: 'mouse', buttons: 1, clientX: toX });
  fireEvent.pointerUp(target, { pointerType: 'mouse', button: 0, clientX: toX });
  fireEvent.click(target);
}

describe('useHorizontalScroll — the wheel', () => {
  it('moves the strip sideways on a vertical wheel', () => {
    const { el } = renderStrip();
    const claimed = wheel(el, { deltaY: 120, deltaX: 0 });
    expect(el.scrollLeft).toBe(120);
    expect(claimed).toBe(true);
  });

  it('scrolls back on an upward wheel', () => {
    const { el } = renderStrip(200);
    wheel(el, { deltaY: -50, deltaX: 0 });
    expect(el.scrollLeft).toBe(150);
  });

  it('leaves a native horizontal delta alone', () => {
    const { el } = renderStrip(100);
    const claimed = wheel(el, { deltaY: 10, deltaX: 40 });
    expect(el.scrollLeft).toBe(100);
    expect(claimed).toBe(false);
  });

  it('lets the page scroll once the strip is at its end', () => {
    const { el } = renderStrip(SCROLL_WIDTH - CLIENT_WIDTH);
    const claimed = wheel(el, { deltaY: 120, deltaX: 0 });
    expect(el.scrollLeft).toBe(SCROLL_WIDTH - CLIENT_WIDTH);
    expect(claimed).toBe(false);
  });

  it('stops at the end rather than overshooting', () => {
    const { el } = renderStrip(650);
    wheel(el, { deltaY: 120, deltaX: 0 });
    expect(el.scrollLeft).toBe(SCROLL_WIDTH - CLIENT_WIDTH);
  });

  it('reads a line-mode wheel as lines, not pixels', () => {
    const { el } = renderStrip();
    wheel(el, { deltaY: 3, deltaX: 0, deltaMode: WheelEvent.DOM_DELTA_LINE });
    expect(el.scrollLeft).toBeGreaterThan(3);
  });
});

describe('useHorizontalScroll — the drag', () => {
  it(`a ${DRAG_THRESHOLD_PX}-px threshold is the contract`, () => {
    expect(DRAG_THRESHOLD_PX).toBe(5);
  });

  it('a 3 px press still opens the item', () => {
    const { el, item, onItem } = renderStrip(100);
    press(item, 50, 53);
    expect(onItem).toHaveBeenCalledTimes(1);
    expect(el.scrollLeft).toBe(100);
  });

  it('a 20 px drag scrolls the strip and swallows the click', () => {
    const { el, item, onItem } = renderStrip(100);
    press(item, 50, 30);
    expect(el.scrollLeft).toBe(120);
    expect(onItem).not.toHaveBeenCalled();
  });

  it('a click after a swallowed one goes through', () => {
    const { item, onItem } = renderStrip(100);
    press(item, 50, 30);
    press(item, 50, 51);
    expect(onItem).toHaveBeenCalledTimes(1);
  });

  it('leaves touch to the browser', () => {
    const { el, item, onItem } = renderStrip(100);
    fireEvent.pointerDown(item, { pointerType: 'touch', button: 0, clientX: 50 });
    fireEvent.pointerMove(item, { pointerType: 'touch', buttons: 1, clientX: 10 });
    fireEvent.pointerUp(item, { pointerType: 'touch', button: 0, clientX: 10 });
    fireEvent.click(item);
    expect(el.scrollLeft).toBe(100);
    expect(onItem).toHaveBeenCalledTimes(1);
  });

  it('ignores a pointer move with no press', () => {
    const { el, item } = renderStrip(100);
    fireEvent.pointerMove(item, { pointerType: 'mouse', buttons: 0, clientX: 10 });
    expect(el.scrollLeft).toBe(100);
  });
});
