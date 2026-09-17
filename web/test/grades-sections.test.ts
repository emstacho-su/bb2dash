/**
 * Which grades sections are folded away, and where that choice lives.
 *
 * P-grades-1 (G-2): each course's block collapses and the groups inside it
 * collapse too, and the choice survives a reload. The rules are worth pinning
 * down without a DOM tree in the way — the components' half is asserted in
 * `GradesScreen.test.tsx` and `GradebookTable.test.tsx`.
 *
 * localStorage is best-effort, exactly as `sidebar-preference.ts` has it: a
 * private window, blocked cookies or a full quota all throw, and none of them
 * is a reason to fail the page. The default is a correct answer in every one.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GRADES_SECTIONS_KEY,
  bookkeepingSectionKey,
  courseSectionKey,
  readStoredSections,
  resolveSection,
  writeStoredSection,
} from '@/lib/grades-sections';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('section keys', () => {
  it('keys a course block by its display id', () => {
    expect(courseSectionKey('IST.323')).toBe('course:IST.323');
    expect(courseSectionKey('GEO.103.lecture')).toBe('course:GEO.103.lecture');
  });

  it('keys a course\'s bookkeeping group apart from the course block', () => {
    expect(bookkeepingSectionKey('IST.323')).toBe('bookkeeping:IST.323');
    expect(bookkeepingSectionKey('IST.323')).not.toBe(courseSectionKey('IST.323'));
  });
});

describe('resolveSection', () => {
  it('lets the stored choice win', () => {
    expect(resolveSection('closed', 'open')).toBe('closed');
    expect(resolveSection('open', 'closed')).toBe('open');
  });

  it('falls back to the section\'s own default when nothing is stored', () => {
    expect(resolveSection(undefined, 'open')).toBe('open');
    expect(resolveSection(undefined, 'closed')).toBe('closed');
  });
});

describe('readStoredSections', () => {
  it('reads back what was written', () => {
    writeStoredSection('course:IST.323', 'closed');
    expect(readStoredSections()['course:IST.323']).toBe('closed');
  });

  it('keeps every other section when one changes', () => {
    writeStoredSection('course:IST.323', 'closed');
    writeStoredSection('bookkeeping:IST.323', 'open');
    writeStoredSection('course:IST.323', 'open');

    expect(readStoredSections()).toEqual({
      'course:IST.323': 'open',
      'bookkeeping:IST.323': 'open',
    });
  });

  it('drops junk rather than trusting it', () => {
    window.localStorage.setItem(
      GRADES_SECTIONS_KEY,
      JSON.stringify({ good: 'closed', bad: 'sideways', worse: 7, nested: { a: 1 } }),
    );
    expect(readStoredSections()).toEqual({ good: 'closed' });
  });

  it.each([
    ['unparseable text', 'not json'],
    ['an array', '[]'],
    ['null', 'null'],
    ['a bare string', '"closed"'],
  ])('returns nothing for %s', (_why, raw) => {
    window.localStorage.setItem(GRADES_SECTIONS_KEY, raw);
    expect(readStoredSections()).toEqual({});
  });
});

describe('storage that is not there', () => {
  it('reads as "nothing stored" when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied');
    });
    expect(readStoredSections()).toEqual({});
  });

  it('writes without throwing when setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => writeStoredSection('course:IST.323', 'closed')).not.toThrow();
  });
});
