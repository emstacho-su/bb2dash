/**
 * The marks of `icons.tsx` (Phase 22, task 31; D-3, default 2).
 *
 * A mark draws an arrow, caret or cross as an `aria-hidden` SVG and keeps the character it replaces
 * as text clipped as `.sr-only` is, inside the wrapper the character had. So every accessible name
 * and every text content is what it was before the character was drawn.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BellIcon, Mark, MARK_CHAR, MarkedLabel, SyncIcon } from '@/components/shell/icons';

describe('Mark', () => {
  it('draws an aria-hidden SVG and holds its character as clipped text', () => {
    const { container } = render(<Mark name="caretDown" />);

    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelector('path')?.getAttribute('d')).toMatch(/\S/);
    const text = container.querySelector('.sr-only');
    expect(text).toHaveTextContent(MARK_CHAR.caretDown);
    expect(container).toHaveTextContent(MARK_CHAR.caretDown);
  });

  it('draws all five marks, each with a path of its own', () => {
    const names = ['caretRight', 'caretDown', 'caretLeft', 'close', 'arrowUpRight'] as const;
    const paths = names.map((name) => {
      const { container, unmount } = render(<Mark name={name} />);
      const d = container.querySelector('path')?.getAttribute('d') ?? '';
      unmount();
      return d;
    });

    expect(paths.every((d) => d.length > 0)).toBe(true);
    expect(new Set(paths).size).toBe(names.length);
  });

  it('keeps the character it is given when it draws another (a right arrow is the caret right)', () => {
    const { container } = render(<Mark name="caretRight" char={MARK_CHAR.arrowRight} />);

    expect(container).toHaveTextContent(MARK_CHAR.arrowRight);
    expect(container).not.toHaveTextContent(MARK_CHAR.caretRight);
  });

  it('adds nothing to a button name when its wrapper is aria-hidden', () => {
    render(
      <button type="button">
        Undated
        <span aria-hidden="true">
          <Mark name="caretDown" />
        </span>
      </button>,
    );

    expect(screen.getByRole('button', { name: 'Undated' })).toBeInTheDocument();
  });

  it('is heard where the character was heard: a mark in a link adds its character to the name', () => {
    render(
      <a href="/x">
        Open <Mark name="arrowUpRight" />
      </a>,
    );

    expect(screen.getByRole('link', { name: `Open ${MARK_CHAR.arrowUpRight}` })).toBeInTheDocument();
  });
});

describe('MarkedLabel', () => {
  it.each([
    ['Open in Blackboard', MARK_CHAR.arrowUpRight],
    ['Open inbox', MARK_CHAR.arrowRight],
  ])('draws the words and then the mark for a label ending in an arrow: %s', (words, arrow) => {
    const label = `${words} ${arrow}`;
    const { container } = render(<MarkedLabel label={label} />);

    expect(container.textContent).toBe(label);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstChild?.textContent).toBe(`${words} `);
    expect(container.querySelector('.sr-only')).toHaveTextContent(arrow);
  });

  it('draws a label with no arrow at its end as it is', () => {
    const { container } = render(<MarkedLabel label="Open the file" />);

    expect(container.textContent).toBe('Open the file');
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('MARK_CHAR', () => {
  it('holds the six characters by name', () => {
    expect(Object.keys(MARK_CHAR).sort()).toEqual(
      ['arrowRight', 'arrowUpRight', 'caretDown', 'caretLeft', 'caretRight', 'close'].sort(),
    );
    expect(Object.values(MARK_CHAR)).toHaveLength(6);
    expect(new Set(Object.values(MARK_CHAR)).size).toBe(6);
  });

  it('builds a label equal to the typed string', () => {
    expect(`Open ${MARK_CHAR.arrowUpRight}`).toBe('Open ↗');
    expect(`Open in Blackboard ${MARK_CHAR.arrowUpRight}`).toBe('Open in Blackboard ↗');
    expect(`Open inbox ${MARK_CHAR.arrowRight}`).toBe('Open inbox →');
  });
});

describe('the bar icons', () => {
  it('draw a path on the 256 grid, aria-hidden', () => {
    for (const Icon of [BellIcon, SyncIcon]) {
      const { container, unmount } = render(<Icon />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('viewBox', '0 0 256 256');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg?.querySelector('path')).not.toBeNull();
      unmount();
    }
  });
});
