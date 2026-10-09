/** Phosphor glyphs, inline SVG on currentColor — the Nocturne icon foundation.
 *  Paths copied verbatim from the artboards so the shell matches the mockup. */

import styles from './Mark.module.css';

export function HamburgerIcon() {
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true">
      <path d="M224 128a8 8 0 0 1-8 8H40a8 8 0 0 1 0-16h176a8 8 0 0 1 8 8ZM40 72h176a8 8 0 0 0 0-16H40a8 8 0 0 0 0 16Zm176 112H40a8 8 0 0 0 0 16h176a8 8 0 0 0 0-16Z" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true">
      <path d="M221.8 175.94C216.25 166.38 208 139.33 208 104a80 80 0 1 0-160 0c0 35.34-8.26 62.38-13.81 71.94A16 16 0 0 0 48 200h40.81a40 40 0 0 0 78.38 0H208a16 16 0 0 0 13.8-24.06ZM128 216a24 24 0 0 1-22.62-16h45.24A24 24 0 0 1 128 216ZM48 184c7.7-13.24 16-43.92 16-80a64 64 0 1 1 128 0c0 36.05 8.28 66.73 16 80Z" />
    </svg>
  );
}

/** Sync: two circling arrows on the 256 grid, at the weight of the bar's other icons. */
export function SyncIcon() {
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true">
      <path d="M224 48v48a8 8 0 0 1-8 8h-48a8 8 0 0 1 0-16h28.69l-14.63-14.63a79.56 79.56 0 0 0-56.13-23.43h-.45A79.52 79.52 0 0 0 69.59 72.71a8 8 0 0 1-11.18-11.44 96 96 0 0 1 135 .79L208 76.69V48a8 8 0 0 1 16 0ZM186.41 183.29A80 80 0 0 1 74.52 184.77L59.31 168H88a8 8 0 0 0 0-16H40a8 8 0 0 0-8 8v48a8 8 0 0 0 16 0v-28.69l14.63 14.63A95.43 95.43 0 0 0 130 222.06h.53a95.36 95.36 0 0 0 67.07-27.33 8 8 0 0 0-11.18-11.44Z" />
    </svg>
  );
}

export function UserIcon() {
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true">
      <path d="M230.92 212c-15.23-26.33-38.7-45.21-66.09-54.16a72 72 0 1 0-73.66 0c-27.39 8.94-50.86 27.82-66.09 54.16a8 8 0 1 0 13.85 8c18.84-32.56 52.14-52 89.07-52s70.23 19.44 89.07 52a8 8 0 1 0 13.85-8ZM72 96a56 56 0 1 1 56 56 56.06 56.06 0 0 1-56-56Z" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true">
      <path d="m229.66 218.34-50.07-50.06a88.11 88.11 0 1 0-11.31 11.31l50.06 50.07a8 8 0 0 0 11.32-11.32ZM40 112a72 72 0 1 1 72 72 72.08 72.08 0 0 1-72-72Z" />
    </svg>
  );
}

/* ---------------------------------------------------------------------------
 * Marks (Phase 22, task 31; D-3): the arrows, carets and crosses the app used to type
 * ------------------------------------------------------------------------ */

/**
 * The six characters the app has typed as marks, by name. The only place they stand in a TSX file:
 * a mark keeps its character as clipped text, and a label held as a string takes its last
 * character from here, so a test that reads the string reads the same value.
 */
export const MARK_CHAR = {
  caretRight: '▸',
  caretDown: '▾',
  caretLeft: '◂',
  close: '✕',
  arrowUpRight: '↗',
  arrowRight: '→',
} as const;

export type MarkName = 'caretRight' | 'caretDown' | 'caretLeft' | 'close' | 'arrowUpRight';

/** Phosphor, regular weight, 256 grid: the same family and stroke as the bar's icons. */
const MARK_PATH: Readonly<Record<MarkName, string>> = {
  caretRight:
    'M181.66 133.66l-80 80a8 8 0 0 1-11.32-11.32L164.69 128 90.34 53.66a8 8 0 0 1 11.32-11.32l80 80a8 8 0 0 1 0 11.32Z',
  caretDown:
    'M213.66 101.66l-80 80a8 8 0 0 1-11.32 0l-80-80a8 8 0 0 1 11.32-11.32L128 164.69l74.34-74.35a8 8 0 0 1 11.32 11.32Z',
  caretLeft:
    'M165.66 202.34a8 8 0 0 1-11.32 11.32l-80-80a8 8 0 0 1 0-11.32l80-80a8 8 0 0 1 11.32 11.32L91.31 128Z',
  close:
    'M205.66 194.34a8 8 0 0 1-11.32 11.32L128 139.31l-66.34 66.35a8 8 0 0 1-11.32-11.32L116.69 128 50.34 61.66a8 8 0 0 1 11.32-11.32L128 116.69l66.34-66.35a8 8 0 0 1 11.32 11.32L139.31 128Z',
  arrowUpRight:
    'M200 64v104a8 8 0 0 1-16 0V83.31L69.66 197.66a8 8 0 0 1-11.32-11.32L172.69 72H88a8 8 0 0 1 0-16h104a8 8 0 0 1 8 8Z',
};

/** The character each mark stands for when it is not given another (a right arrow is drawn as the caret right). */
const DEFAULT_CHAR: Readonly<Record<MarkName, string>> = {
  caretRight: MARK_CHAR.caretRight,
  caretDown: MARK_CHAR.caretDown,
  caretLeft: MARK_CHAR.caretLeft,
  close: MARK_CHAR.close,
  arrowUpRight: MARK_CHAR.arrowUpRight,
};

/**
 * One mark: the SVG is `aria-hidden`, and the character it replaces stays beside it as text clipped
 * as `.sr-only` is. Put it where the character stood, inside the wrapper the character had: a reader
 * hears exactly what it heard, and inside an `aria-hidden` wrapper it adds nothing to a name.
 * `char` is for a mark that draws a different character than its own (the right arrow is the caret right).
 */
export function Mark({ name, char }: { name: MarkName; char?: string }) {
  return (
    <span className={styles.mark}>
      <span className="sr-only">{char ?? DEFAULT_CHAR[name]}</span>
      <svg className={styles.glyph} viewBox="0 0 256 256" aria-hidden="true">
        <path d={MARK_PATH[name]} />
      </svg>
    </span>
  );
}

/** The mark that draws a label's last character, by that character. */
const MARK_OF_LAST_CHAR: Readonly<Record<string, MarkName>> = {
  [MARK_CHAR.arrowUpRight]: 'arrowUpRight',
  [MARK_CHAR.arrowRight]: 'caretRight',
  [MARK_CHAR.caretRight]: 'caretRight',
};

/**
 * A label held as a string: its words, then its last character drawn as a mark when that character
 * is one of the arrows. The string is never changed, so its text content is the label as it was; a
 * label that does not end in an arrow is drawn as it is.
 */
export function MarkedLabel({ label }: { label: string }) {
  const last = label.slice(-1);
  const name = MARK_OF_LAST_CHAR[last];
  if (name === undefined) return <>{label}</>;
  return (
    <>
      {label.slice(0, -1)}
      <Mark name={name} char={last} />
    </>
  );
}
