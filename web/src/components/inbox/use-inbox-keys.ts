'use client';

/**
 * R3-3: the Inbox's keyboard flow, the way review queues do it.
 *
 * `j` / `k` move focus to the next / previous card; `Enter` on a focused card
 * moves focus into its answer box (or its first control when it has no box).
 * Keys typed into a field, or with a modifier held, are left alone, so typing
 * a "j" into an answer never jumps away from it.
 */

import { useEffect, type RefObject } from 'react';

export const CARD_SELECTOR = '[data-inbox-card]';
export const ANSWER_BOX_SELECTOR = '[data-answer-box]';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function focusCard(card: HTMLElement) {
  card.focus();
  // jsdom has no scrollIntoView; the browser does.
  if (typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'nearest' });
}

export function useInboxKeys(listRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTyping(event.target)) return;
      const list = listRef.current;
      if (!list) return;
      const cards = Array.from(list.querySelectorAll<HTMLElement>(CARD_SELECTOR));
      if (cards.length === 0) return;

      const active = document.activeElement;
      const current = cards.findIndex((card) => card === active || card.contains(active));

      if (event.key === 'j' || event.key === 'k') {
        const step = event.key === 'j' ? 1 : -1;
        const next =
          current === -1
            ? step === 1
              ? 0
              : cards.length - 1
            : Math.min(cards.length - 1, Math.max(0, current + step));
        event.preventDefault();
        focusCard(cards[next]);
        return;
      }

      if (event.key === 'Enter' && current !== -1 && cards[current] === active) {
        const card = cards[current];
        const target =
          card.querySelector<HTMLElement>(ANSWER_BOX_SELECTOR) ??
          card.querySelector<HTMLElement>('button:not([disabled]), input, textarea');
        if (!target) return;
        event.preventDefault();
        target.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [listRef]);
}
