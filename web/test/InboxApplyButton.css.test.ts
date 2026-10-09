/**
 * The Apply answers button's toast (acceptance trial 20261009T180141Z, step 7a).
 *
 * The button lives in the Inbox's footer, which is sticky at the bottom of the
 * window. Its toast was written for a button in a page header and hung UNDER
 * the button, so in the footer it opened below the window's bottom edge: the
 * "Requested…" line was cut mid-sentence and the fallback command, the one
 * thing a person needs when the apply worker is down, could not be read. jsdom
 * applies no CSS, so where the toast hangs is pinned from the two stylesheets.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const BUTTON_CSS = read('src/components/inbox/InboxApplyButton.module.css');
const INBOX_CSS = read('src/app/(app)/inbox/Inbox.module.css');

/** The declarations of the first `.name { … }` rule, as `property → value`. */
function declarations(source: string, name: string): Map<string, string> {
  const rule = new RegExp(`^\\s*\\.${name}\\s*\\{([^}]*)\\}`, 'm').exec(source);
  if (!rule) throw new Error(`no .${name} rule`);
  return new Map(
    rule[1]
      .split(';')
      .map((line) => line.split(':'))
      .filter((parts) => parts.length >= 2)
      .map(([property, ...value]) => [property.trim(), value.join(':').trim()]),
  );
}

describe('InboxApplyButton.module.css: where the toast hangs', () => {
  it('the footer the button sits in is still sticky at the bottom of the window', () => {
    const footer = declarations(INBOX_CSS, 'footer');
    expect(footer.get('position')).toBe('sticky');
    expect(footer.get('bottom')).toBe('0');
  });

  it('the toast opens above the button, never under it', () => {
    const toast = declarations(BUTTON_CSS, 'toast');
    expect(toast.get('position')).toBe('absolute');
    expect(toast.has('top'), 'a top offset hangs the toast under the footer, outside the window').toBe(false);
    expect(toast.get('bottom')).toMatch(/^calc\(100% \+ .+\)$/);
  });

  it('the toast is anchored to the right edge: the footer puts the button at the right of the page', () => {
    const footer = declarations(INBOX_CSS, 'footer');
    expect(footer.get('justify-content')).toBe('flex-end');
    const toast = declarations(BUTTON_CSS, 'toast');
    expect(toast.get('right')).toBe('0');
    expect(toast.has('left')).toBe(false);
  });

  it('the error toast is the same box in the same place', () => {
    expect(declarations(BUTTON_CSS, 'toastError').get('composes')).toBe('toast');
  });
});
