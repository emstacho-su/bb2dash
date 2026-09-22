/**
 * The full-details route's pure half (T-2): the path it links to, the id it
 * rebuilds from the segments, and who is allowed to be on it.
 */

import { describe, expect, it } from 'vitest';
import {
  assignmentBelongsToCourse,
  assignmentIdFromSegments,
  assignmentPagePath,
  decodePathSegment,
} from '@/lib/assignment-page';

/**
 * What the route actually receives. Next hands a catch-all's segments over
 * exactly as they appear in the path — still percent-encoded — so this is the
 * round trip that matters: build the path, split it the way the router does,
 * and ask for the id back.
 */
function segmentsOf(path: string): string[] {
  return path.split('/assignment/')[1].split('/');
}

describe('assignmentPagePath', () => {
  it('puts the assignment under its course, one path segment per id part', () => {
    expect(assignmentPagePath('IST.323', 'IST.323/lab-1')).toBe(
      '/course/IST.323/assignment/IST.323/lab-1',
    );
  });

  it('encodes what a URL cannot carry, and nothing else', () => {
    expect(assignmentPagePath('IST.323', 'IST.323/week 1 quiz')).toBe(
      '/course/IST.323/assignment/IST.323/week%201%20quiz',
    );
    // The slash between id parts stays a real separator; the one inside a part
    // does not exist — `split('/')` already made it one.
    expect(assignmentPagePath('GEO.103', 'GEO.103/case-study-2')).not.toContain('%2F');
  });

  it('round-trips through the segments the route hands back', () => {
    const path = assignmentPagePath('IST.323', 'IST.323/lab-1');
    expect(assignmentIdFromSegments(segmentsOf(path))).toBe('IST.323/lab-1');
  });
});

/**
 * TR-5. The segments arrive encoded, so every id a URL cannot carry verbatim
 * came back mangled — an id with a space, an ampersand, an apostrophe or a
 * non-ASCII letter simply 404ed, and the `%2F` form this route documents never
 * rebuilt at all.
 */
describe('assignmentIdFromSegments — the segments arrive encoded', () => {
  const AWKWARD = [
    ['a space', 'IST.466/week 1 case'],
    ['an ampersand', 'IST.466/law & ethics'],
    ['an apostrophe', "IST.466/o'brien reading"],
    ['a non-ASCII letter', 'GEO.103/café study'],
    ['a hash and a question mark', 'IST.323/lab #1?'],
    ['a plus sign', 'ECN.304/pset 1 + 2'],
  ] as const;

  it.each(AWKWARD)('round-trips an id with %s', (_what, id) => {
    const course = id.split('/')[0];
    const path = assignmentPagePath(course, id);
    expect(assignmentIdFromSegments(segmentsOf(path))).toBe(id);
  });

  it('rebuilds the single-segment %2F form this route documents', () => {
    expect(assignmentIdFromSegments(['IST.323%2Flab-1'])).toBe('IST.323/lab-1');
    expect(assignmentIdFromSegments('IST.323%2Flab-1')).toBe('IST.323/lab-1');
  });

  it('leaves an already-legal segment exactly as it is', () => {
    expect(assignmentIdFromSegments(['IST.323', 'lab-1'])).toBe('IST.323/lab-1');
  });

  it('is null for a malformed escape rather than throwing', () => {
    expect(() => assignmentIdFromSegments(['IST.323', '%zz'])).not.toThrow();
    expect(assignmentIdFromSegments(['IST.323', '%zz'])).toBeNull();
    expect(assignmentIdFromSegments(['%'])).toBeNull();
    expect(assignmentIdFromSegments(['IST.323', '%E0%A4%A'])).toBeNull();
  });

  it('drops a segment that is only an encoded space', () => {
    expect(assignmentIdFromSegments(['IST.323', '%20', 'lab-1'])).toBe('IST.323/lab-1');
  });
});

describe('decodePathSegment', () => {
  it('decodes what a path cannot carry verbatim', () => {
    expect(decodePathSegment('week%201')).toBe('week 1');
    expect(decodePathSegment('caf%C3%A9')).toBe('café');
    expect(decodePathSegment('GEO.103')).toBe('GEO.103');
  });

  it('answers null instead of throwing on a malformed escape', () => {
    expect(decodePathSegment('%')).toBeNull();
    expect(decodePathSegment('%zz')).toBeNull();
  });
});

describe('assignmentIdFromSegments', () => {
  it('joins the segments back into the stored id', () => {
    expect(assignmentIdFromSegments(['IST.323', 'lab-1'])).toBe('IST.323/lab-1');
  });

  it('accepts a single already-joined segment (the %2F form)', () => {
    expect(assignmentIdFromSegments(['IST.323/lab-1'])).toBe('IST.323/lab-1');
    expect(assignmentIdFromSegments('IST.323/lab-1')).toBe('IST.323/lab-1');
  });

  it('is null for anything that names no assignment', () => {
    expect(assignmentIdFromSegments([])).toBeNull();
    expect(assignmentIdFromSegments(undefined)).toBeNull();
    expect(assignmentIdFromSegments([''])).toBeNull();
    expect(assignmentIdFromSegments(['  ', ''])).toBeNull();
  });

  it('drops empty segments rather than leaving a double slash in the id', () => {
    expect(assignmentIdFromSegments(['IST.323', '', 'lab-1'])).toBe('IST.323/lab-1');
  });
});

describe('assignmentBelongsToCourse', () => {
  it('is true for its own course', () => {
    expect(assignmentBelongsToCourse('IST.323', 'IST.323', null)).toBe(true);
  });

  it('is true under the parent when the item sits on a child shell', () => {
    expect(assignmentBelongsToCourse('GEO.103', 'GEO.103.R', 'GEO.103')).toBe(true);
  });

  it('is false for another course', () => {
    expect(assignmentBelongsToCourse('IST.323', 'ECN.304', null)).toBe(false);
    expect(assignmentBelongsToCourse('IST.323', 'ECN.304', 'ECN.300')).toBe(false);
  });

  it('is false when the assignment names no course at all', () => {
    expect(assignmentBelongsToCourse('IST.323', null, null)).toBe(false);
    expect(assignmentBelongsToCourse('IST.323', undefined, 'IST.323')).toBe(false);
  });
});
