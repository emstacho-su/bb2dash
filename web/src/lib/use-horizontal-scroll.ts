'use client';

/**
 * A plain mouse can move a horizontal strip (S2-home-1, P-69).
 *
 * A scroller with `overflow-x: auto` scrolls sideways for a trackpad or a
 * shift-wheel, but a plain mouse wheel only ever sends `deltaY`, and nothing
 * lets it drag. This hook adds both, on the element `ref` points at:
 *
 * * **Wheel.** Once the strip is armed, a vertical wheel with no horizontal
 *   delta scrolls the strip sideways. It is armed by a click on it or by the
 *   pointer resting on it for WHEEL_ARM_HOVER_MS, and disarmed when the pointer
 *   leaves (R3-1): until then the wheel scrolls the page, so a reader scrolling
 *   down Home is never caught by a strip passing under the pointer. A
 *   native horizontal delta (trackpad, tilt wheel) is left to the browser.
 *   At either end of the strip the wheel is not claimed, so the page
 *   still scrolls past it.
 * * **Drag.** A mouse press that travels more than DRAG_THRESHOLD_PX scrolls
 *   the strip with the pointer and swallows the click that follows it, so
 *   letting go never opens whatever was under the pointer. A shorter press is
 *   an ordinary click. Touch and pen are left to the browser's own panning.
 *
 * The listeners are native, not React props: React registers `wheel` as
 * passive, and a passive listener cannot stop the page from scrolling too.
 */

import { useEffect, type RefObject } from 'react';

/** A press must travel further than this to count as a drag. */
export const DRAG_THRESHOLD_PX = 5;

/** How long the pointer must rest on the strip before the wheel is claimed. */
export const WHEEL_ARM_HOVER_MS = 1500;

/** A horizontal wheel delta at or above this is the browser's to handle. */
const HORIZONTAL_DELTA_EPSILON = 1;

/** One wheel "line" in pixels, for mice that report DOM_DELTA_LINE. */
const WHEEL_LINE_PX = 16;

/** The wheel's vertical travel in pixels, whatever unit the device reported. */
function wheelPixels(event: WheelEvent, pageWidth: number): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * WHEEL_LINE_PX;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * pageWidth;
  return event.deltaY;
}

/** Where the strip may scroll to: 0 … (content width − visible width). */
function maxScrollLeft(el: HTMLElement): number {
  return Math.max(0, el.scrollWidth - el.clientWidth);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface PressState {
  startX: number;
  startScrollLeft: number;
  dragging: boolean;
}

export function useHorizontalScroll(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let press: PressState | null = null;
    /** The wheel is claimed only while armed (R3-1). */
    let armed = false;
    let armTimer: ReturnType<typeof setTimeout> | null = null;

    function clearArmTimer() {
      if (armTimer !== null) clearTimeout(armTimer);
      armTimer = null;
    }

    function arm() {
      clearArmTimer();
      armed = true;
    }

    function onPointerEnter(event: PointerEvent) {
      if (event.pointerType === 'touch' || armed) return;
      clearArmTimer();
      armTimer = setTimeout(arm, WHEEL_ARM_HOVER_MS);
    }

    function onPointerLeave() {
      clearArmTimer();
      armed = false;
    }
    /** Set when a drag ends; the next click on the strip is the drag's, not a choice. */
    let swallowNextClick = false;

    function onWheel(event: WheelEvent) {
      if (!el || !armed) return;
      if (Math.abs(event.deltaX) >= HORIZONTAL_DELTA_EPSILON) return;
      const delta = wheelPixels(event, el.clientWidth);
      if (delta === 0) return;
      const next = clamp(el.scrollLeft + delta, 0, maxScrollLeft(el));
      if (next === el.scrollLeft) return; // at the end: let the page scroll
      el.scrollLeft = next;
      event.preventDefault();
    }

    function onPointerDown(event: PointerEvent) {
      swallowNextClick = false;
      arm();
      if (!el || event.pointerType === 'touch' || event.pointerType === 'pen') return;
      if (event.button !== 0) return;
      press = { startX: event.clientX, startScrollLeft: el.scrollLeft, dragging: false };
    }

    function onPointerMove(event: PointerEvent) {
      if (!el || !press) return;
      if (event.buttons === 0) {
        // The button came up somewhere we never heard about: no drag is running.
        press = null;
        return;
      }
      const travelled = event.clientX - press.startX;
      if (!press.dragging) {
        if (Math.abs(travelled) <= DRAG_THRESHOLD_PX) return;
        press = { ...press, dragging: true };
        // Keep the drag's pointerup on the strip even if the pointer leaves it.
        if (typeof el.setPointerCapture === 'function') {
          try {
            el.setPointerCapture(event.pointerId);
          } catch (error) {
            // An id the browser no longer tracks; the drag still works without capture.
            if (!(error instanceof DOMException)) throw error;
          }
        }
      }
      el.scrollLeft = clamp(press.startScrollLeft - travelled, 0, maxScrollLeft(el));
    }

    function onPointerEnd() {
      if (press?.dragging) swallowNextClick = true;
      press = null;
    }

    function onClickCapture(event: MouseEvent) {
      arm();
      if (!swallowNextClick) return;
      swallowNextClick = false;
      event.preventDefault();
      event.stopPropagation();
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerenter', onPointerEnter);
    el.addEventListener('pointerleave', onPointerLeave);
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('click', onClickCapture, true);
    return () => {
      clearArmTimer();
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerenter', onPointerEnter);
      el.removeEventListener('pointerleave', onPointerLeave);
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerEnd);
      el.removeEventListener('pointercancel', onPointerEnd);
      el.removeEventListener('click', onClickCapture, true);
    };
  }, [ref]);
}
