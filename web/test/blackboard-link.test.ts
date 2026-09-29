/**
 * Which Blackboard page a button opens (Phase 18, task 23, R-69).
 *
 * `blackboardLink` is the one rule the popout footer, the staged-file link and
 * the planner popover share: the assignment's own Ultra page when one is
 * recorded and safe, else the course's page, else nothing. The URLs are data
 * that came out of a crawl, so they are checked, not trusted.
 */

import { describe, expect, it } from 'vitest';
import { blackboardLink } from '@/lib/blackboard-link';

const COURSE = { bb_url: 'https://blackboard.syracuse.edu/ultra/courses/_571529_1/outline' };
const ITEM_URL =
  'https://blackboard.syracuse.edu/ultra/courses/_571529_1/outline/assessment/test/_12928193_1?courseId=_571529_1&gradeitemView=details';

describe('blackboardLink', () => {
  it('prefers the assignment’s own page', () => {
    expect(blackboardLink({ bb_url: ITEM_URL }, COURSE)).toEqual({ href: ITEM_URL, scope: 'item' });
  });

  it('falls back to the course page when the assignment has no url', () => {
    expect(blackboardLink({ bb_url: null }, COURSE)).toEqual({
      href: COURSE.bb_url,
      scope: 'course',
    });
    expect(blackboardLink(null, COURSE)).toEqual({ href: COURSE.bb_url, scope: 'course' });
  });

  it('falls back to the course page for a non-https item url', () => {
    const plain = ITEM_URL.replace('https:', 'http:');
    expect(blackboardLink({ bb_url: plain }, COURSE)).toEqual({
      href: COURSE.bb_url,
      scope: 'course',
    });
  });

  it('falls back to the course page when the item url is on another origin', () => {
    const elsewhere = 'https://evil.example.com/ultra/courses/_571529_1/outline';
    expect(blackboardLink({ bb_url: elsewhere }, COURSE)).toEqual({
      href: COURSE.bb_url,
      scope: 'course',
    });
    // A look-alike host is another origin too.
    const lookalike = 'https://blackboard.syracuse.edu.example.com/ultra/x';
    expect(blackboardLink({ bb_url: lookalike }, COURSE)?.scope).toBe('course');
  });

  it('refuses a javascript: url for the item', () => {
    const link = blackboardLink({ bb_url: 'javascript:alert(1)' }, COURSE);
    expect(link).toEqual({ href: COURSE.bb_url, scope: 'course' });
  });

  it('refuses a javascript: or non-https course url, and then offers nothing', () => {
    expect(blackboardLink({ bb_url: ITEM_URL }, { bb_url: 'javascript:alert(1)' })).toBeNull();
    expect(blackboardLink(null, { bb_url: 'http://blackboard.syracuse.edu/x' })).toBeNull();
  });

  it('offers nothing when the course records no url', () => {
    // Without a course origin there is nothing to check an item url against.
    expect(blackboardLink({ bb_url: ITEM_URL }, { bb_url: null })).toBeNull();
    expect(blackboardLink({ bb_url: ITEM_URL }, null)).toBeNull();
  });

  it('treats an unparseable or blank url as absent', () => {
    expect(blackboardLink({ bb_url: 'not a url' }, COURSE)?.scope).toBe('course');
    expect(blackboardLink({ bb_url: '   ' }, COURSE)?.scope).toBe('course');
    expect(blackboardLink(null, { bb_url: '' })).toBeNull();
  });
});
