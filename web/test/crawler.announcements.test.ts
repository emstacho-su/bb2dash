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
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  authorUserId: string | null;
  body?: string | null;
}

interface Probe {
  announcementKeys: Record<string, string[]>;
  idShaped: { key: string; value: string }[];
  misses: Record<string, number>;
}

interface CoursePayload {
  crawler: { version: number; probe: Probe };
  announcements: MappedAnnouncement[];
}

const require = createRequire(import.meta.url);
const crawler = require('../../ingest/bb_crawler.js') as {
  mapAnnouncement: (a: RawAnnouncement) => MappedAnnouncement;
  announcementAuthor: (a: unknown) => {
    author: string | null; authorSource: string | null; authorUserId: string | null;
  };
  announcementProbe: (raws: unknown) => { keys: string[]; idShaped: { key: string; value: string }[] };
  installCrawler: (o: Record<string, unknown>) => {
    crawl: (c: string, o?: { userCache?: Map<string, string | null> }) => Promise<CoursePayload>;
  };
  resolveAuthors: (
    announcements: MappedAnnouncement[],
    teachers: { userId?: string | null; name?: string | null }[],
    lookupUser: (id: string) => Promise<string | null>,
    cache?: Map<string, string | null>,
  ) => Promise<{ announcements: MappedAnnouncement[]; misses: string[] }>;
  personName: (v: unknown) => string | null;
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
    expect(announcementAuthor(null)).toEqual({ author: null, authorSource: null, authorUserId: null });
  });
});

describe('v5 (Phase 18, R-70) — a bare creator id is kept, never shown', () => {
  it('lists creatorUserId among the author keys', () => {
    expect(AUTHOR_KEYS).toContain('creatorUserId');
  });

  it('keeps a bare `_123_1` creator as authorUserId with author null', () => {
    const out = mapAnnouncement(raw({ creatorUserId: '_123_1' }));
    expect(out.author).toBeNull();
    expect(out.authorSource).toBeNull();
    expect(out.authorUserId).toBe('_123_1');
  });

  it('keeps a bare id found under any other author key too', () => {
    expect(mapAnnouncement(raw({ creator: '_21025199_1' })).authorUserId).toBe('_21025199_1');
  });

  it('reads the id of a user object that carries no name', () => {
    expect(mapAnnouncement(raw({ creator: { id: '_456_1' } })).authorUserId).toBe('_456_1');
  });

  it('keeps both the name and the id when Blackboard sends both', () => {
    const out = mapAnnouncement(raw({
      creatorUserId: '_789_1', creator: { givenName: 'Deborah', familyName: 'Corsello' },
    }));
    expect(out.author).toBe('Deborah Corsello');
    expect(out.authorSource).toBe('creator');
    expect(out.authorUserId).toBe('_789_1');
  });

  it('is null when nothing id-shaped is there', () => {
    expect(mapAnnouncement(raw()).authorUserId).toBeNull();
    expect(mapAnnouncement(raw({ creatorUserId: 'not-an-id' })).authorUserId).toBeNull();
  });
});

describe('announcementProbe — what Blackboard really sends', () => {
  it('lists the union of raw keys, sorted', () => {
    const out = crawler.announcementProbe([raw({ creatorUserId: '_123_1' }), raw({ extraKey: 1 })]);
    expect(out.keys).toEqual([...out.keys].sort());
    expect(out.keys).toContain('creatorUserId');
    expect(out.keys).toContain('extraKey');
    expect(out.keys).toContain('modifiedDate');
  });

  it('records id-shaped values by key path, once each, skipping the announcement id', () => {
    const out = crawler.announcementProbe([
      raw({ creatorUserId: '_123_1' }),
      raw({ id: '_845124_1', creatorUserId: '_123_1', editor: { userId: '_999_1' } }),
    ]);
    expect(out.idShaped).toEqual([
      { key: 'creatorUserId', value: '_123_1' },
      { key: 'editor.userId', value: '_999_1' },
    ]);
  });

  it('never records prose, only id-shaped strings', () => {
    const out = crawler.announcementProbe([raw({ creatorUserId: '_1_1' })]);
    expect(out.idShaped.every((e) => /^_\d+_\d+$/.test(e.value))).toBe(true);
  });

  it('survives a payload that is not a list', () => {
    expect(crawler.announcementProbe(null)).toEqual({ keys: [], idShaped: [] });
  });
});

describe('crawl() — the v5 envelope carries the probe', () => {
  const COURSE = '_571529_1';
  const original = globalThis.fetch;
  afterEach(() => { globalThis.fetch = original; });

  function stubFetch(announcements: RawAnnouncement[]) {
    globalThis.fetch = vi.fn(async (url: string) => {
      const u = String(url);
      const body = u.includes('/announcements?') ? { results: announcements } : { results: [] };
      return { ok: true, status: 200, json: async () => body };
    }) as unknown as typeof fetch;
  }

  const install = () => crawler.installCrawler({
    userId: '_21025199_1', supabaseUrl: 'https://example.invalid', anonKey: 'k',
  });

  it('stamps version 5 and keys the announcement probe by course', async () => {
    stubFetch([raw({ creatorUserId: '_123_1' })]);
    const p = await install().crawl(COURSE);
    expect(p.crawler.version).toBe(5);
    expect(Object.keys(p.crawler.probe.announcementKeys)).toEqual([COURSE]);
    expect(p.crawler.probe.announcementKeys[COURSE]).toContain('creatorUserId');
    expect(p.crawler.probe.idShaped).toContainEqual({ key: 'creatorUserId', value: '_123_1' });
    expect(p.announcements[0].authorUserId).toBe('_123_1');
  });

  it('counts an unknown author shape as one AUTHOR_KEYS miss per announcement', async () => {
    stubFetch([
      raw({ id: '_1_1', whoPosted: { label: 'unknown shape' } }),
      raw({ id: '_2_1', whoPosted: { label: 'unknown shape' } }),
      raw({ id: '_3_1', creator: { givenName: 'Known', familyName: 'Name' } }),
    ]);
    const p = await install().crawl(COURSE);
    expect(p.crawler.probe.misses.AUTHOR_KEYS).toBe(2);
  });

  it('does not count a bare id as an AUTHOR_KEYS miss: the key list found something', async () => {
    stubFetch([raw({ creatorUserId: '_123_1' })]);
    const p = await install().crawl(COURSE);
    expect(p.crawler.probe.misses.AUTHOR_KEYS).toBeUndefined();
  });

  it('carries an empty probe on a course with no announcements', async () => {
    stubFetch([]);
    const p = await install().crawl(COURSE);
    expect(p.crawler.probe.announcementKeys).toEqual({ [COURSE]: [] });
    expect(p.crawler.probe.idShaped).toEqual([]);
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

// ------------------------------------------------------------------------------------------------
// Task 18 (R-70, B-36 default): the bare creator id becomes a name — course teachers first, then at
// most one GET /learn/api/v1/users/{id} per distinct miss per run. A failure is a miss, never a throw.
// ------------------------------------------------------------------------------------------------

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

interface AuthorFixture {
  bb_course_id: string;
  _rawResponses: {
    memberships: { results: unknown[] };
    announcements: { results: RawAnnouncement[] };
    users: Record<string, { status: number; body: unknown }>;
  };
  expected: {
    authors: { id: string; author: string | null; authorSource: string | null; authorUserId: string | null }[];
    userFetches: string[];
    misses: Record<string, number>;
  };
}

const FX = JSON.parse(
  readFileSync(path.join(REPO, 'db', 'fixtures', 'phase18', 'announcements_v5.json'), 'utf8'),
) as AuthorFixture;

const USERS_RE = /\/learn\/api\/v1\/users\/([^/?]+)$/;

describe('resolveAuthors — teachers first, then one lookup per distinct miss', () => {
  const mapped = (over: RawAnnouncement) => mapAnnouncement(raw(over));
  const TEACHERS = [{ userId: '_30000001_1', name: 'Ada Teacher' }];

  it('resolves a teacher id with no lookup at all', async () => {
    const lookup = vi.fn(async () => 'never');
    const out = await crawler.resolveAuthors([mapped({ creatorUserId: '_30000001_1' })], TEACHERS, lookup);
    expect(lookup).not.toHaveBeenCalled();
    expect(out.announcements[0].author).toBe('Ada Teacher');
    expect(out.announcements[0].authorSource).toBe('teachers');
    expect(out.misses).toEqual([]);
  });

  it('looks an unknown id up exactly once, however many posts carry it', async () => {
    const lookup = vi.fn(async () => 'Grace Assistant');
    const out = await crawler.resolveAuthors(
      [mapped({ id: '_1_1', creatorUserId: '_2_2' }), mapped({ id: '_3_3', creatorUserId: '_2_2' })],
      TEACHERS, lookup,
    );
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup).toHaveBeenCalledWith('_2_2');
    expect(out.announcements.map((a) => a.author)).toEqual(['Grace Assistant', 'Grace Assistant']);
    expect(out.announcements.map((a) => a.authorSource)).toEqual(['users', 'users']);
  });

  it('shares its cache across calls, so one run fetches an id once across courses', async () => {
    const lookup = vi.fn(async () => 'Grace Assistant');
    const cache = new Map<string, string | null>();
    await crawler.resolveAuthors([mapped({ creatorUserId: '_2_2' })], [], lookup, cache);
    const second = await crawler.resolveAuthors([mapped({ creatorUserId: '_2_2' })], [], lookup, cache);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(second.announcements[0].author).toBe('Grace Assistant');
  });

  it('turns a throwing lookup into author null plus a miss, and never throws', async () => {
    const lookup = vi.fn(async () => { throw new Error('403'); });
    const out = await crawler.resolveAuthors([mapped({ creatorUserId: '_5_5' })], [], lookup);
    expect(out.announcements[0].author).toBeNull();
    expect(out.announcements[0].authorUserId).toBe('_5_5');
    expect(out.misses).toEqual(['userLookup', 'authorUnresolved']);
  });

  it('does not re-fetch an id whose lookup already failed this run', async () => {
    const lookup = vi.fn(async () => null);
    const cache = new Map<string, string | null>();
    await crawler.resolveAuthors([mapped({ creatorUserId: '_5_5' })], [], lookup, cache);
    const again = await crawler.resolveAuthors([mapped({ creatorUserId: '_5_5' })], [], lookup, cache);
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(again.misses).toEqual(['authorUnresolved']);
  });

  it('leaves a named announcement and one with no id alone', async () => {
    const lookup = vi.fn(async () => 'x');
    const named = mapped({ creatorUserId: '_7_7', creator: { givenName: 'Named', familyName: 'Directly' } });
    const none = mapped({});
    const out = await crawler.resolveAuthors([named, none], [], lookup);
    expect(lookup).not.toHaveBeenCalled();
    expect(out.announcements).toEqual([named, none]);
  });

  it('never mutates what it was handed', async () => {
    const input = [mapped({ creatorUserId: '_30000001_1' })];
    const before = JSON.stringify(input);
    await crawler.resolveAuthors(input, TEACHERS, async () => null);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('never looks up something that is not a Blackboard user id', async () => {
    const lookup = vi.fn(async () => 'x');
    const odd = { ...mapped({}), authorUserId: '../../courses' };
    const out = await crawler.resolveAuthors([odd], [], lookup);
    expect(lookup).not.toHaveBeenCalled();
    expect(out.announcements[0].author).toBeNull();
  });

  it('ignores a teacher row with a blank name', async () => {
    const lookup = vi.fn(async () => 'From users');
    const out = await crawler.resolveAuthors(
      [mapped({ creatorUserId: '_8_8' })], [{ userId: '_8_8', name: '' }], lookup,
    );
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(out.announcements[0].author).toBe('From users');
  });
});

describe('personName — the /users/{id} shapes', () => {
  it('reads a public-API style name object', () => {
    expect(crawler.personName({ id: '_1_1', name: { given: 'Grace', family: 'Assistant' } })).toBe('Grace Assistant');
  });
});

describe('crawl() on db/fixtures/phase18/announcements_v5.json', () => {
  const original = globalThis.fetch;
  afterEach(() => { globalThis.fetch = original; });

  function stubFetch() {
    const userFetches: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      const u = String(url);
      const users = USERS_RE.exec(u);
      if (users) {
        const id = decodeURIComponent(users[1]);
        userFetches.push(id);
        const r = FX._rawResponses.users[id] ?? { status: 404, body: null };
        return { ok: r.status >= 200 && r.status <= 299, status: r.status, json: async () => r.body };
      }
      const body = u.includes('/announcements?') ? FX._rawResponses.announcements
        : u.includes('/memberships?') ? FX._rawResponses.memberships
          : { results: [] };
      return { ok: true, status: 200, json: async () => body };
    }) as unknown as typeof fetch;
    return userFetches;
  }

  const install = () => crawler.installCrawler({
    userId: '_21025199_1', supabaseUrl: 'https://example.invalid', anonKey: 'k',
  });

  it('names each announcement the way the fixture expects', async () => {
    stubFetch();
    const p = await install().crawl(FX.bb_course_id);
    expect(p.announcements.map(({ id, author, authorSource, authorUserId }) => (
      { id, author, authorSource, authorUserId }
    ))).toEqual(FX.expected.authors);
  });

  it('fetches only the distinct ids no teacher row answers, once each', async () => {
    const userFetches = stubFetch();
    await install().crawl(FX.bb_course_id);
    expect(userFetches).toEqual(FX.expected.userFetches);
  });

  it('records the 403 as a miss in the probe', async () => {
    stubFetch();
    const p = await install().crawl(FX.bb_course_id);
    expect(p.crawler.probe.misses).toEqual(FX.expected.misses);
  });

  it('shares one cache across the courses of a run', async () => {
    const userFetches = stubFetch();
    const bb = install();
    const userCache = new Map<string, string | null>();
    await bb.crawl(FX.bb_course_id, { userCache });
    await bb.crawl('_571530_1', { userCache });
    expect(userFetches).toEqual(FX.expected.userFetches);
  });

  it('carries on when the users endpoint is unreachable', async () => {
    stubFetch();
    const inner = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (USERS_RE.test(String(url))) throw new Error('offline');
      return inner(url, init);
    }) as unknown as typeof fetch;
    const p = await install().crawl(FX.bb_course_id);
    expect(p.announcements.find((a) => a.id === '_9000002_1')!.author).toBeNull();
    expect(p.crawler.probe.misses.userLookup).toBe(2);
  });
});
