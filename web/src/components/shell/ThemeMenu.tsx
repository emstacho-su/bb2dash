'use client';

/**
 * The theme rows of the account menu (Phase 22, task 10; P-77): Dark, Light and
 * Auto, in that order, as three `menuitemradio` rows in one group.
 *
 * Dark is checked while nothing is stored. A pick stamps `html[data-theme]` and
 * every `theme-color` meta (with the two-frame switching mark, so nothing eases
 * through the flip) and then writes or removes the key: Dark removes it, Light
 * writes `light`, Auto writes `auto` and stamps what the system says. All of that
 * is in `lib/theme-preference.ts`, beside the boot script that reads the same key.
 *
 * It only adds `menuitemradio` rows: `TopNav.update.test.tsx` asserts the exact
 * list of `menuitem` rows, and these are not that role.
 *
 * Storage is read through `useSyncExternalStore`, as `ActivityMenu` does, so the
 * server and hydration see Dark and every render after sees the stored choice;
 * this menu is only mounted while the account menu is open, which is after
 * hydration. A storage that throws still stamps the page: what was picked in this
 * mount is kept beside the stored value, so the checked row follows the pick.
 */

import { useState, useSyncExternalStore } from 'react';
import {
  clearStoredTheme,
  readStoredTheme,
  resolveTheme,
  stampTheme,
  systemPrefersLight,
  writeStoredTheme,
} from '@/lib/theme-preference';
import styles from './ThemeMenu.module.css';

type ThemeChoice = 'dark' | 'light' | 'auto';

/** The three rows, in the order they are drawn and announced. */
const CHOICES: readonly { choice: ThemeChoice; label: string }[] = [
  { choice: 'dark', label: 'Dark' },
  { choice: 'light', label: 'Light' },
  { choice: 'auto', label: 'Auto' },
];

/** Same-tab listeners: the `storage` event only fires in other tabs. */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Nothing stored, or a stray `dark` or junk value, is Dark. */
function readChoice(): ThemeChoice {
  return readStoredTheme() ?? 'dark';
}

function serverChoice(): ThemeChoice {
  return 'dark';
}

export function ThemeMenu() {
  const stored = useSyncExternalStore(subscribe, readChoice, serverChoice);
  const [picked, setPicked] = useState<ThemeChoice | null>(null);
  const checked = picked ?? stored;

  function pick(choice: ThemeChoice): void {
    if (choice === 'dark') clearStoredTheme();
    else writeStoredTheme(choice);
    stampTheme(resolveTheme(choice === 'dark' ? null : choice, systemPrefersLight()), true);
    setPicked(choice);
    notify();
  }

  return (
    <div className={styles.group} role="group" aria-label="Theme">
      <span className={styles.head}>Theme</span>
      {CHOICES.map(({ choice, label }) => (
        <button
          key={choice}
          type="button"
          className={styles.row}
          role="menuitemradio"
          aria-checked={checked === choice}
          onClick={() => pick(choice)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
