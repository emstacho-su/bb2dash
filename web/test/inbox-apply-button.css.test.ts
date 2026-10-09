/**
 * Phase 22, visual round, V-6: "Apply answers" is a pill like every other button
 * (entry `button-pill-sans`, `--radius-control`), and switched off it is a flat grey pill at full
 * strength (entries `button-fills` and `disabled-one-look`), kept apart from busy: a busy button
 * (the request is in flight, or it is looking for an open run) stays at half strength with the
 * wait pointer.
 *
 * jsdom loads no stylesheet, so the rules are read from the source.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(
  join(process.cwd(), 'src/components/inbox/InboxApplyButton.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function ruleBody(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(CSS);
  if (!match) throw new Error(`no rule for "${selector}" in InboxApplyButton.module.css`);
  return match[1];
}

function declaration(body: string, property: string): string | null {
  const match = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`).exec(body);
  return match ? match[1].trim() : null;
}

const SWITCHED_OFF = ".button:disabled:not([aria-busy='true'])";

describe('InboxApplyButton shapes (V-6)', () => {
  it('is a pill through the control radius token', () => {
    expect(declaration(ruleBody('.button'), 'border-radius')).toBe('var(--radius-control)');
  });

  it('is busy at half strength with the wait pointer', () => {
    const body = ruleBody('.button:disabled');
    expect(declaration(body, 'opacity')).toBe('0.5');
    expect(declaration(body, 'cursor')).toBe('progress');
  });

  it('is switched off as a flat grey pill at full strength with the no pointer', () => {
    const body = ruleBody(SWITCHED_OFF);
    expect(declaration(body, 'background')).toBe('var(--color-neutral-800)');
    expect(declaration(body, 'border-color')).toBe('var(--color-neutral-800)');
    expect(declaration(body, 'color')).toBe('var(--color-neutral-600)');
    expect(declaration(body, 'opacity')).toBe('1');
    expect(declaration(body, 'cursor')).toBe('not-allowed');
  });

  it('writes no radius literal and no faint outline for the disabled look', () => {
    expect(ruleBody('.button')).not.toMatch(/border-radius:\s*\d/);
    expect(ruleBody(SWITCHED_OFF)).not.toMatch(/divider/);
  });
});
