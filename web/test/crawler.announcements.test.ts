/**
 * The crawler's announcements mapper (`ingest/bb_crawler.js`).
 *
 * The mapper is a module-level pure function so it can be covered here without
 * a Blackboard session: it is loaded through `createRequire` rather than Vite,
 * because the crawler is a plain CommonJS script that is also pasted verbatim
 * into an Ultra browser tab.
 *
 * What matters, per migration 033: `modifiedDate` reaches `modified`, and the
 * creator's display name reaches `author` — never a raw `_21025199_1` user id,
 * and never a guess when the payload has no name in it at all.
 */

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface RawAnnouncement {
  id?: string;
  title?: string;
  createdDate?: string | null;
  modifiedDate?: string | null;
  startDateRestriction?: string | null;
  readStatus?: { isRead?: boolean | null } | null;
  body?: unknown;
  [key: string]: unknown;
}

interface MappedAnnouncement {
  id?: string;
  title?: string;
  created?: string | null;
  modified?: string | null;
  start?: string | null;
  isRead: boolean | null;
  author: string | null;
  authorSource: string | null;
  body?: string | null;
}

const require = createRequire(import.meta.url);
const crawler = require('../../ingest/bb_crawler.js') as {
  mapAnnouncement: (a: RawAnnouncement) => MappedAnnouncement;
  announcementAuthor: (a: unknown) => { author: string | null; authorSource: string | null };
  AUTHOR_KEYS: string[];
  strip: (html: unknown) => string | null;
};
const { mapAnnouncement, announcementAuthor, AUTHOR_KEYS, strip } = crawler;

function raw(overrides: RawAnnouncement = {}): RawAnnouncement {
  return {
    id: '_845123_1',
    title: 'Quiz 2 moved',
    createdDate: '2026-09-01T12:00:00.000Z',
    modifiedDate: '2026-09-02T09:30:00.000Z',
    startDateRestriction: null,
    readStatus: { isRead: false },
    body: { rawText: '<p>Quiz 2 is now <b>Thursday</b>.</p>' },
    ...overrides,
  };
}

describe('mapAnnouncement — the fields migration 033 needs', () => {
  it('carries the modified date through as `modified`', () => {
    expect(mapAnnouncement(raw()).modified).toBe('2026-09-02T09:30:00.000Z');
  });

  it('keeps the identifiers, the created date and the Blackboard read state', () => {
    const out = mapAnnouncement(raw());
    expect(out.id).toBe('_845123_1');
    expect(out.title).toBe('Quiz 2 moved');
    expect(out.created).toBe('2026-09-01T12:00:00.000Z');
    expect(out.isRead).toBe(false);
  });

  it('leaves isRead null when Blackboard sends no read status', () => {
    expect(mapAnnouncement(raw({ readStatus: null })).isRead).toBeNull();
  });

  it('strips the body to plain text and caps it', () => {
    expect(mapAnnouncement(raw()).body).toBe('Quiz 2 is now Thursday.');
    const long = mapAnnouncement(raw({ body: { rawText: 'x'.repeat(5000) } }));
    expect(long.body).toHaveLength(4000);
  });
});

describe('mapAnnouncement — the creator display name', () => {
  it('reads a givenName/familyName creator object', () => {
    const out = mapAnnouncement(raw({ creator: { givenName: 'Deborah', familyName: 'Corsello' } }));
    expect(out.author).toBe('Deborah Corsello');
    expect(out.authorSource).toBe('creator');
  });

  it('reads a nested user object', () => {
    const out = mapAnnouncement(
      raw({ createdBy: { user: { givenName: 'Jeff', familyName: 'Larche' } } }),
    );
    expect(out.author).toBe('Jeff Larche');
    expect(out.authorSource).toBe('createdBy');
  });

  it('reads a displayName, and a plain-string name', () => {
    expect(mapAnnouncement(raw({ creator: { displayName: 'A. Wilson' } })).author).toBe('A. Wilson');
    expect(mapAnnouncement(raw({ author: 'M. Croad' })).author).toBe('M. Croad');
  });

  it('records which key won, so one live crawl settles the unverified key', () => {
    expect(mapAnnouncement(raw({ postedBy: 'K. Croad' })).authorSource).toBe('postedBy');
    expect(AUTHOR_KEYS).toContain('creator');
    expect(AUTHOR_KEYS).toContain('createdBy');
  });

  it('prefers the earlier candidate when a payload carries two', () => {
    const out = mapAnnouncement(raw({ creator: 'First Name', createdBy: 'Second Name' }));
    expect(out.author).toBe('First Name');
    expect(out.authorSource).toBe('creator');
  });

  it('never passes a Blackboard user id off as a name', () => {
    const out = mapAnnouncement(raw({ creator: '_21025199_1' }));
    expect(out.author).toBeNull();
    expect(out.authorSource).toBeNull();
  });

  it('returns null rather than guessing when no candidate key is present', () => {
    expect(mapAnnouncement(raw()).author).toBeNull();
    expect(announcementAuthor(null)).toEqual({ author: null, authorSource: null });
  });
});

describe('strip — the shared HTML flattener', () => {
  it('decodes entities and collapses block tags into newlines', () => {
    expect(strip('<p>a&nbsp;b</p><p>c &amp; d</p>')).toBe('a b\nc & d');
  });

  it('returns null for nothing at all', () => {
    expect(strip(null)).toBeNull();
    expect(strip('<p></p>')).toBeNull();
  });
});
