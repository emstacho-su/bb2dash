/**
 * The full-details route's pure half (T-2): the path it links to, the id it
 * rebuilds from the segments, and who is allowed to be on it.
 */

import { describe, expect, it } from 'vitest';
import {
  assignmentBelongsToCourse,
  assignmentIdFromSegments,
  assignmentPagePath,
} from '@/lib/assignment-page';

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
    const segments = path.split('/assignment/')[1].split('/').map(decodeURIComponent);
    expect(assignmentIdFromSegments(segments)).toBe('IST.323/lab-1');
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
