/**
 * The crawler's attempts mappers and the v4 chain (`ingest/bb_crawler.js`, Phase 12b P-grades-4).
 *
 * The mappers are module-level pure functions so they can be covered without a Blackboard
 * session: loaded through `createRequire` rather than Vite, because the crawler is a plain
 * CommonJS script that is also pasted verbatim into an Ultra browser tab.
 *
 * WHAT CHANGED. v3 asked `/gradebook/columns/<col>/attempts?userId=<me>`, which answers
 * `200 {"results": []}` for a student on every column — 21 of 21 in crawl 1b5e8da5. Blackboard's
 * own gradebook page walks three requests instead (grade → attempts → attempt detail), and only
 * the third carries `studentSubmissionFiles[]` with a durable `file.permanentUrl`. The key names
 * below are no longer candidates: they were read off those requests
 * (docs/planning/sprint-1-hub/evidence/80f_ATTEMPTS_ENDPOINT.md).
 *
 * WHAT THIS PROVES, AND WHAT IT CANNOT. That the mappers produce the shape migration 050/055
 * reads, keep Stack's prose out of the flat columns, bound the chain, and record what Blackboard
 * really sent. It cannot prove the live responses — Stack's next sync does that.
 */

import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface AttemptFile {
  id: string;
  name: string | null;
  size: number | null;
  mime: string | null;
  uuid: string | null;
  downloadUrl: string | null;
}

interface MappedAttempt {
  id: string | null;
  status: string | null;
  created: string | null;
  modified: string | null;
  submitted: string | null;
  score: number | null;
  exempt: boolean | null;
  receipt: string | null;
  files: AttemptFile[];
  text: {
    studentSubmission: string | null;
    studentComments: string | null;
    instructorFeedback: string | null;
  };
  keys?: string[];
}

interface GradebookColumn {
  columnId?: string;
  isCalc?: boolean;
  lastAttempt?: unknown;
  submissionStatus?: string | null;
  contentId?: string | null;
}

interface ColumnEntry {
  columnId: string;
  contentId: string | null;
  endpoint: string;
  status: number;
  steps: {
    grade: { url: string; status: number } | null;
    attempts: { url: string; status: number } | null;
    detail: { attemptId: string; url: string; status: number }[];
  };
  keys: Record<string, string[] | undefined>;
  grade: Record<string, unknown> | null;
  attempts: Record<string, unknown>[];
  detail: Record<string, unknown>[];
  results: MappedAttempt[];
  error?: string;
}

const require = createRequire(import.meta.url);
const crawler = require('../../ingest/bb_crawler.js') as {
  installCrawler: (o: Record<string, unknown>) => {
    runAll: (o?: Record<string, unknown>) => Promise<unknown>;
    attempts: (c: string, g?: unknown[], o?: { limit?: number }) => Promise<ColumnEntry[]>;
  };
  assertRunId: (runId: unknown) => string | null;
  mapAttempt: (a: unknown, files?: unknown[], includeKeys?: boolean) => MappedAttempt | null;
  mapAttemptFile: (
    f: unknown,
    ctx?: { base?: string; courseId?: string | null; attemptId?: string | null },
  ) => AttemptFile | null;
  mapGradeRow: (g: unknown) => Record<string, unknown> | null;
  mapAttemptDetail: (d: unknown) => Record<string, unknown> | null;
  newestAttempts: (rows: unknown, limit?: number) => { id: string }[];
  atPath: (o: unknown, path: string) => unknown;
  pickKey: (o: unknown, keys: string[]) => unknown;
  shouldProbeColumn: (g: unknown) => boolean;
  assessmentFields: (item: unknown, maxDepth?: number) =>
    | { values: Record<string, unknown>; paths: Record<string, string> }
    | null;
  ATTEMPT_FIELD_KEYS: Record<string, string[]>;
  ATTEMPT_FILE_KEYS: Record<string, string[]>;
  CRAWLER_VERSION: number;
  ATTEMPT_LIMIT: number;
};
const {
  mapAttempt, mapAttemptFile, mapGradeRow, mapAttemptDetail, newestAttempts, atPath, pickKey,
  shouldProbeColumn, assessmentFields, ATTEMPT_FIELD_KEYS,
} = crawler;

const CTX = { courseId: '_571529_1', attemptId: '_8100001_1' };

/** One `studentSubmissionFiles[]` entry, real shape, invented values. */
const RAW_FILE = {
  id: '_4400001_1',
  name: 'widget-analysis.docx',
  linkName: 'widget-analysis.docx',
  fileType: 'STUDENT',
  bbFileUuid: '11111111-2222-3333-4444-555555555555',
  hasErrors: false,
  file: {
    fileName: 'widget-analysis.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    permanentUrl: 'https://blackboard.syracuse.edu/bbcswebdav/xid-9000001_1',
    existingFileReference: false,
    isMedia: false,
    forceDownload: true,
  },
};

/** One attempt detail (step 3), real shape, invented values. */
const RAW_DETAIL = {
  id: '_8100001_1',
  gradeId: '_7700001_1',
  courseId: '_571529_1',
  userId: '_21025199_1',
  status: 'COMPLETED',
  attemptDate: '2026-09-10T18:00:00.000Z',
  creationDate: '2026-09-10T17:40:00.000Z',
  modifiedDate: '2026-09-11T13:05:00.000Z',
  exempt: false,
  override: false,
  overrideStatus: 'NOT_OVERRIDDEN',
  readyToPost: false,
  displayGrade: { score: 18.5 },
  attemptReceipt: {
    receiptId: '0F2A7C91',
    submissionDate: '2026-09-10T18:01:12.000Z',
    submissionTotalSize: 184213,
    submissionType: 'MANUALLY_SUBMITTED',
  },
  studentSubmission: { rawText: '<p>Draft attached.</p>', displayText: 'Draft attached.' },
  instructorFeedback: { rawText: '<p>Solid first pass.</p>', displayText: 'Solid first pass.' },
  studentComments: 'Resubmitting after the lab.',
  studentSubmissionFiles: [RAW_FILE],
  submissionHasFilePartsWithErrors: false,
};

describe('the envelope version', () => {
  it('is 4 — the attempts chain a student session can actually read', () => {
    expect(crawler.CRAWLER_VERSION).toBe(4);
  });

  it('bounds a column at the newest three attempts', () => {
    expect(crawler.ATTEMPT_LIMIT).toBe(3);
  });
});

describe('assertRunId — a caller-supplied run id is a uuid or nothing', () => {
  const { assertRunId } = crawler;

  it('accepts a uuid and hands it back unchanged', () => {
    expect(assertRunId('bf2f81e5-ea4c-4b64-bc43-129fd53d4616')).toBe('bf2f81e5-ea4c-4b64-bc43-129fd53d4616');
    expect(assertRunId('BF2F81E5-EA4C-4B64-BC43-129FD53D4616')).toBe('BF2F81E5-EA4C-4B64-BC43-129FD53D4616');
  });

  it('treats an absent id as "generate one"', () => {
    expect(assertRunId(null)).toBeNull();
    expect(assertRunId(undefined)).toBeNull();
  });

  it('throws on anything that is not a uuid, rather than fabricating one', () => {
    for (const bad of ['', 'not-a-uuid', 'bf2f81e5ea4c4b64bc43129fd53d4616', 42, {}, ['x'], true]) {
      expect(() => assertRunId(bad), JSON.stringify(bad)).toThrow(/must be a uuid/);
    }
  });

  it('says why in the message, so a caller cannot mistake it for a transient failure', () => {
    expect(() => assertRunId('nope')).toThrow(/fabricated id|nobody registered/);
  });
});

describe('runAll — the guard runs before any request goes out', () => {
  const install = () =>
    crawler.installCrawler({ userId: '_21025199_1', supabaseUrl: 'https://example.invalid', anonKey: 'k' });

  it('rejects a bad runId without touching the network', async () => {
    const original = globalThis.fetch;
    const fetchSpy = vi.fn(() => {
      throw new Error('fetch must not be called when runId is invalid');
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      await expect(install().runAll({ runId: 'not-a-uuid' })).rejects.toThrow(/must be a uuid/);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('pickKey / atPath — a candidate may be a path', () => {
  it('reads a nested value one level at a time', () => {
    expect(atPath({ a: { b: { c: 7 } } }, 'a.b.c')).toBe(7);
    expect(atPath({ a: 1 }, 'a.b.c')).toBeUndefined();
    expect(atPath(null, 'a')).toBeUndefined();
  });

  it('still reads a plain key exactly as v3 did', () => {
    expect(pickKey({ status: 'COMPLETED' }, ['status'])).toBe('COMPLETED');
    expect(pickKey({}, ['status'])).toBeNull();
  });

  it('takes the first candidate that is present, path or key', () => {
    expect(pickKey({ attemptDate: 'b' }, ['attemptReceipt.submissionDate', 'attemptDate'])).toBe('b');
    expect(pickKey({ attemptReceipt: { submissionDate: 'a' }, attemptDate: 'b' },
      ['attemptReceipt.submissionDate', 'attemptDate'])).toBe('a');
  });
});

describe('mapAttemptFile — v4 reads the URL instead of building one', () => {
  it('takes Blackboard\'s own durable permanentUrl', () => {
    const f = mapAttemptFile(RAW_FILE, CTX)!;
    expect(f.downloadUrl).toBe('https://blackboard.syracuse.edu/bbcswebdav/xid-9000001_1');
    expect(f.id).toBe('_4400001_1');
    expect(f.name).toBe('widget-analysis.docx');
    expect(f.uuid).toBe('11111111-2222-3333-4444-555555555555');
    expect(f.mime).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('emits exactly the keys stage_attempts and migration 085 read', () => {
    expect(Object.keys(mapAttemptFile(RAW_FILE, CTX)!).sort())
      .toEqual(['downloadUrl', 'id', 'mime', 'name', 'size', 'uuid']);
  });

  it('falls back to file.fileName when the entry has no display name', () => {
    const { name: _drop, linkName: _drop2, ...noName } = RAW_FILE;
    expect(mapAttemptFile(noName, CTX)!.name).toBe('widget-analysis.docx');
  });

  it('falls back to the v3 built URL only when there is no permanentUrl', () => {
    const f = mapAttemptFile({ id: '_4400001_1', name: 'legacy.pdf' }, CTX)!;
    expect(f.downloadUrl).toBe(
      'https://blackboard.syracuse.edu/learn/api/v1/courses/_571529_1/gradebook/attempts/_8100001_1/files/_4400001_1/download',
    );
  });

  it('honours a different Blackboard host for that fallback', () => {
    const f = mapAttemptFile({ id: '_1_1' }, { ...CTX, base: 'https://bb.example.edu' })!;
    expect(f.downloadUrl!.startsWith('https://bb.example.edu/learn/api/v1/')).toBe(true);
  });

  it('uses bbFileUuid as the id when there is no id', () => {
    expect(mapAttemptFile({ bbFileUuid: 'abc', file: { permanentUrl: 'https://x/y' } }, CTX)!.id).toBe('abc');
  });

  it('leaves an unknown field null rather than guessing', () => {
    const f = mapAttemptFile({ id: '_1_1' }, CTX)!;
    expect(f.name).toBeNull();
    expect(f.size).toBeNull();
    expect(f.mime).toBeNull();
    expect(f.uuid).toBeNull();
  });

  it('drops an entry with no id, because nothing could ever download it', () => {
    expect(mapAttemptFile({ name: 'ghost.pdf' }, CTX)).toBeNull();
    expect(mapAttemptFile(null, CTX)).toBeNull();
    expect(mapAttemptFile('nonsense', CTX)).toBeNull();
  });

  it('has no download URL when there is neither a permanentUrl nor an attempt context', () => {
    expect(mapAttemptFile({ id: '_1_1' })!.downloadUrl).toBeNull();
  });
});

describe('mapAttempt — the shape migration 050/055 reads', () => {
  it('emits the flat contract keys, and `text` for the prose', () => {
    expect(Object.keys(mapAttempt(RAW_DETAIL, [], false)!).sort()).toEqual([
      'created', 'exempt', 'files', 'id', 'modified', 'receipt', 'score', 'status', 'submitted', 'text',
    ]);
  });

  it('carries the identifiers, timestamps and score through', () => {
    const out = mapAttempt(RAW_DETAIL)!;
    expect(out.id).toBe('_8100001_1');
    expect(out.status).toBe('COMPLETED');
    expect(out.created).toBe('2026-09-10T17:40:00.000Z');
    expect(out.modified).toBe('2026-09-11T13:05:00.000Z');
    expect(out.score).toBe(18.5);
    expect(out.exempt).toBe(false);
    expect(out.receipt).toBe('0F2A7C91');
  });

  it('prefers the receipt submission date over attemptDate', () => {
    expect(mapAttempt(RAW_DETAIL)!.submitted).toBe('2026-09-10T18:01:12.000Z');
    expect(ATTEMPT_FIELD_KEYS.submitted[0]).toBe('attemptReceipt.submissionDate');
  });

  it('falls back to attemptDate for a step-2 list row, which has no receipt', () => {
    const listRow = { id: '_8100002_1', status: 'COMPLETED', attemptDate: '2026-09-02T11:00:00.000Z', exempt: false };
    const out = mapAttempt(listRow)!;
    expect(out.submitted).toBe('2026-09-02T11:00:00.000Z');
    expect(out.created).toBeNull();
    expect(out.files).toEqual([]);
  });

  it('keeps Stack\'s prose OUT of the flat keys the stage lifts into columns', () => {
    const out = mapAttempt(RAW_DETAIL)!;
    expect(out).not.toHaveProperty('studentSubmission');
    expect(out).not.toHaveProperty('studentComments');
    expect(out).not.toHaveProperty('feedback');
    expect(out.text.studentSubmission).toBe('Draft attached.');
    expect(out.text.studentComments).toBe('Resubmitting after the lab.');
    expect(out.text.instructorFeedback).toBe('Solid first pass.');
  });

  it('flattens prose to plain text and caps each field', () => {
    const long = mapAttempt({
      ...RAW_DETAIL,
      instructorFeedback: { rawText: 'f'.repeat(4000) },
      studentComments: 'c'.repeat(4000),
      studentSubmission: { rawText: 's'.repeat(9000) },
    })!;
    expect(long.text.instructorFeedback).toHaveLength(1000);
    expect(long.text.studentComments).toHaveLength(2000);
    expect(long.text.studentSubmission).toHaveLength(4000);
  });

  it('keeps a zero score, which is a grade, not an absence', () => {
    expect(mapAttempt({ ...RAW_DETAIL, displayGrade: { score: 0 } })!.score).toBe(0);
  });

  it('returns null for an unknown key rather than guessing', () => {
    const bare = mapAttempt({ id: '_8100009_1' })!;
    expect(bare.status).toBeNull();
    expect(bare.created).toBeNull();
    expect(bare.submitted).toBeNull();
    expect(bare.score).toBeNull();
    expect(bare.receipt).toBeNull();
    expect(bare.exempt).toBeNull();
    expect(bare.files).toEqual([]);
    expect(bare.text).toEqual({ studentSubmission: null, studentComments: null, instructorFeedback: null });
  });

  it('never passes a non-number off as a score or a non-boolean as exempt', () => {
    const odd = mapAttempt({ id: '_1_1', displayGrade: { score: 'eight' }, exempt: 'yes' })!;
    expect(odd.score).toBeNull();
    expect(odd.exempt).toBeNull();
  });

  it('carries its files and drops the unusable ones', () => {
    const files = [mapAttemptFile(RAW_FILE, CTX), mapAttemptFile({ name: 'no-id.pdf' }, CTX)];
    const out = mapAttempt(RAW_DETAIL, files)!;
    expect(out.files).toHaveLength(1);
    expect(out.files[0].id).toBe('_4400001_1');
  });

  it('returns null for something that is not an attempt at all', () => {
    expect(mapAttempt(null)).toBeNull();
    expect(mapAttempt('nope')).toBeNull();
  });
});

describe('mapAttempt — the `keys` probe', () => {
  it('records the raw key names on the first attempt of a column', () => {
    const out = mapAttempt({ id: '_1_1', status: 'X', creationDate: 'd', groupAttemptId: null }, [], true)!;
    expect(out.keys).toEqual(['id', 'status', 'creationDate', 'groupAttemptId']);
  });

  it('is omitted on later attempts, so the payload does not repeat itself', () => {
    expect(mapAttempt({ id: '_1_1' }, [], false)!).not.toHaveProperty('keys');
    expect(mapAttempt({ id: '_1_1' })!).not.toHaveProperty('keys');
  });

  it('reports keys the mapper does not read, which is the whole point', () => {
    const out = mapAttempt({ id: '_1_1', somethingUltraOnlyKnows: 1 }, [], true)!;
    expect(out.keys).toContain('somethingUltraOnlyKnows');
  });
});

describe('mapGradeRow — step 1 exists only for the grade id', () => {
  const row = {
    id: '_7700001_1',
    status: 'GRADED',
    firstAttemptId: '_8100001_1',
    lastAttemptId: '_8100001_1',
    attemptsLeft: -1,
    effectiveScore: 18.5,
    pointsPossible: 20,
    displayGrade: { score: 18.5, isOverride: false },
    isExempt: false,
  };

  it('slims the row to what the chain and the diagnosis need', () => {
    expect(mapGradeRow(row)).toEqual({
      id: '_7700001_1',
      status: 'GRADED',
      attemptsLeft: -1,
      effectiveScore: 18.5,
      pointsPossible: 20,
      displayScore: 18.5,
      isExempt: false,
      firstAttemptId: '_8100001_1',
      lastAttemptId: '_8100001_1',
    });
  });

  it('is null without an id, because there is then no chain to walk', () => {
    expect(mapGradeRow({ status: 'GRADED' })).toBeNull();
    expect(mapGradeRow(null)).toBeNull();
  });
});

describe('mapAttemptDetail — diagnosis without the prose', () => {
  it('records the receipt and the file count, never the text', () => {
    const d = mapAttemptDetail(RAW_DETAIL)!;
    expect(d).toEqual({
      attemptId: '_8100001_1',
      gradeId: '_7700001_1',
      status: 'COMPLETED',
      attemptDate: '2026-09-10T18:00:00.000Z',
      creationDate: '2026-09-10T17:40:00.000Z',
      modifiedDate: '2026-09-11T13:05:00.000Z',
      receiptId: '0F2A7C91',
      submissionDate: '2026-09-10T18:01:12.000Z',
      submissionType: 'MANUALLY_SUBMITTED',
      submissionTotalSize: 184213,
      displayScore: 18.5,
      fileCount: 1,
      hasRawText: true,
    });
    expect(JSON.stringify(d)).not.toContain('Draft attached');
    expect(JSON.stringify(d)).not.toContain('Solid first pass');
  });

  it('is null for a body that is not an attempt detail', () => {
    expect(mapAttemptDetail(null)).toBeNull();
    expect(mapAttemptDetail({ gradeId: '_1_1' })).toBeNull();
  });
});

describe('newestAttempts — the bound', () => {
  const rows = [
    { id: '_a1_1', attemptDate: '2026-09-01T00:00:00.000Z' },
    { id: '_a2_1', attemptDate: '2026-09-05T00:00:00.000Z' },
    { id: '_a3_1', attemptDate: '2026-09-03T00:00:00.000Z' },
    { id: '_a4_1', attemptDate: '2026-09-04T00:00:00.000Z' },
  ];

  it('takes the newest three, newest first', () => {
    expect(newestAttempts(rows).map((r) => r.id)).toEqual(['_a2_1', '_a4_1', '_a3_1']);
  });

  it('honours a different limit, including zero', () => {
    expect(newestAttempts(rows, 1).map((r) => r.id)).toEqual(['_a2_1']);
    expect(newestAttempts(rows, 0)).toEqual([]);
  });

  it('sorts an undated attempt last and breaks ties on the id, so a replay picks the same three', () => {
    const mixed = [{ id: '_b1_1' }, { id: '_b2_1' }, ...rows];
    const first = newestAttempts(mixed).map((r) => r.id);
    expect(first).toEqual(newestAttempts(mixed.slice().reverse()).map((r) => r.id));
    expect(first).not.toContain('_b1_1');
  });

  it('drops entries with no id and survives a non-array', () => {
    expect(newestAttempts([{ id: '' }, { id: null }, null, 'x'])).toEqual([]);
    expect(newestAttempts(undefined)).toEqual([]);
  });
});

describe('attempts() — the three-request chain', () => {
  const COURSE = '_571529_1';
  const USER = '_21025199_1';
  const GRADE_ROW = {
    id: '_7700001_1', status: 'GRADED', attemptsLeft: -1, effectiveScore: 18.5,
    pointsPossible: 20, displayGrade: { score: 18.5 }, isExempt: false,
    firstAttemptId: '_8100001_1', lastAttemptId: '_8100001_1',
  };
  const LIST_ROW = {
    id: '_8100001_1', status: 'COMPLETED', attemptDate: '2026-09-10T18:00:00.000Z',
    exempt: false, overrideStatus: 'NOT_OVERRIDDEN',
  };
  const COLUMN: GradebookColumn = {
    columnId: '_3560530_1', isCalc: false, submissionStatus: 'GRADED', contentId: '_12928186_1',
  };

  const original = globalThis.fetch;
  afterEach(() => { globalThis.fetch = original; });

  /** Route by URL; `overrides` replaces the status or body of one step. */
  function stubFetch(overrides: Record<string, { status?: number; body?: unknown }> = {}) {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      calls.push(String(url));
      const step = /\/grades\?/.test(String(url)) ? 'grade'
        : /\/grades\/[^/]+\/attempts$/.test(String(url)) ? 'attempts'
          : 'detail';
      const o = overrides[step] ?? {};
      const status = o.status ?? 200;
      const body = 'body' in o
        ? o.body
        : step === 'grade' ? { results: [GRADE_ROW] }
          : step === 'attempts' ? { results: [LIST_ROW] }
            : RAW_DETAIL;
      return {
        ok: status >= 200 && status <= 299,
        status,
        json: async () => body,
      };
    }) as unknown as typeof fetch;
    return calls;
  }

  const install = () => crawler.installCrawler({
    userId: USER, supabaseUrl: 'https://example.invalid', anonKey: 'k',
  });

  it('walks grade -> attempts -> detail, in that order and one at a time', async () => {
    const calls = stubFetch();
    const out = await install().attempts(COURSE, [COLUMN]);

    expect(calls).toEqual([
      `https://blackboard.syracuse.edu/learn/api/v1/courses/${COURSE}/gradebook/columns/_3560530_1/grades?expand=attemptsLeft&userId=${USER}`,
      `https://blackboard.syracuse.edu/learn/api/v1/courses/${COURSE}/gradebook/columns/_3560530_1/grades/_7700001_1/attempts`,
      `https://blackboard.syracuse.edu/learn/api/v1/courses/${COURSE}/gradebook/attempts/_8100001_1?columnId=_3560530_1&expand=toolAttemptDetail,attempts,attempts.toolAttemptDetail`,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe(200);
    expect(out[0].endpoint).toContain('/grades?expand=attemptsLeft');
  });

  it('keeps the v3 envelope and adds the chain', async () => {
    stubFetch();
    const [entry] = await install().attempts(COURSE, [COLUMN]);

    expect(entry.columnId).toBe('_3560530_1');
    expect(entry.contentId).toBe('_12928186_1');
    expect(entry.grade!.id).toBe('_7700001_1');
    expect(entry.attempts).toEqual([{
      id: '_8100001_1', status: 'COMPLETED', attemptDate: '2026-09-10T18:00:00.000Z',
      exempt: false, overrideStatus: 'NOT_OVERRIDDEN',
    }]);
    expect(entry.detail).toHaveLength(1);
    expect(entry.detail[0].fileCount).toBe(1);
    expect(entry.steps.grade!.status).toBe(200);
    expect(entry.steps.attempts!.status).toBe(200);
    expect(entry.steps.detail).toHaveLength(1);
  });

  it('records what Blackboard really sent, per response', async () => {
    stubFetch();
    const [entry] = await install().attempts(COURSE, [COLUMN]);
    expect(entry.keys.grade).toContain('firstAttemptId');
    expect(entry.keys.attempt).toContain('overrideStatus');
    expect(entry.keys.detail).toContain('studentSubmissionFiles');
    expect(entry.keys.file).toContain('bbFileUuid');
  });

  it('produces a results[] row the stage can catalogue, with the durable file URL', async () => {
    stubFetch();
    const [entry] = await install().attempts(COURSE, [COLUMN]);
    expect(entry.results).toHaveLength(1);
    const [r] = entry.results;
    expect(r.id).toBe('_8100001_1');
    expect(r.submitted).toBe('2026-09-10T18:01:12.000Z');
    expect(r.score).toBe(18.5);
    expect(r.files[0].downloadUrl).toBe('https://blackboard.syracuse.edu/bbcswebdav/xid-9000001_1');
    expect(r.files[0].mime).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(r.keys).toBeDefined();
  });

  it('skips the columns shouldProbeColumn rejects, so a term is not 45 chains', async () => {
    const calls = stubFetch();
    const out = await install().attempts(COURSE, [
      COLUMN,
      { columnId: '_total_1', isCalc: true, submissionStatus: 'GRADED' },
      { columnId: '_never_1', isCalc: false, submissionStatus: 'UNOPENED' },
    ]);
    expect(out).toHaveLength(1);
    expect(calls).toHaveLength(3);
  });

  it('stops at step 1 when the column has no grade row, without failing the crawl', async () => {
    const calls = stubFetch({ grade: { body: { results: [] } } });
    const [entry] = await install().attempts(COURSE, [COLUMN]);
    expect(calls).toHaveLength(1);
    expect(entry.grade).toBeNull();
    expect(entry.results).toEqual([]);
    expect(entry.status).toBe(200);
  });

  it('records the first non-2xx and carries on', async () => {
    stubFetch({ attempts: { status: 403 } });
    const [entry] = await install().attempts(COURSE, [COLUMN]);
    expect(entry.status).toBe(403);
    expect(entry.steps.attempts!.status).toBe(403);
    expect(entry.results).toEqual([]);
  });

  it('still records the submission when only the detail request fails, just without its files', async () => {
    stubFetch({ detail: { status: 500 } });
    const [entry] = await install().attempts(COURSE, [COLUMN]);
    expect(entry.status).toBe(500);
    expect(entry.detail).toEqual([]);
    expect(entry.results).toHaveLength(1);
    expect(entry.results[0].id).toBe('_8100001_1');
    expect(entry.results[0].submitted).toBe('2026-09-10T18:00:00.000Z');
    expect(entry.results[0].files).toEqual([]);
  });

  it('never throws: a network failure is a status 0 on the entry', async () => {
    globalThis.fetch = vi.fn(async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const [entry] = await install().attempts(COURSE, [COLUMN]);
    expect(entry.status).toBe(0);
    expect(entry.results).toEqual([]);
  });

  it('bounds the chain at the newest attempts', async () => {
    const many = [
      { ...LIST_ROW, id: '_a1_1', attemptDate: '2026-09-01T00:00:00.000Z' },
      { ...LIST_ROW, id: '_a2_1', attemptDate: '2026-09-02T00:00:00.000Z' },
      { ...LIST_ROW, id: '_a3_1', attemptDate: '2026-09-03T00:00:00.000Z' },
      { ...LIST_ROW, id: '_a4_1', attemptDate: '2026-09-04T00:00:00.000Z' },
      { ...LIST_ROW, id: '_a5_1', attemptDate: '2026-09-05T00:00:00.000Z' },
    ];
    const calls = stubFetch({ attempts: { body: { results: many } } });
    const [entry] = await install().attempts(COURSE, [COLUMN]);
    // 1 grade + 1 attempts + 3 details
    expect(calls).toHaveLength(5);
    expect(entry.attempts.map((a) => a.id)).toEqual(['_a5_1', '_a4_1', '_a3_1']);

    const one = stubFetch({ attempts: { body: { results: many } } });
    await install().attempts(COURSE, [COLUMN], { limit: 1 });
    expect(one).toHaveLength(3);
  });
});

describe('shouldProbeColumn — which columns cost a chain', () => {
  const col = (o: GradebookColumn): GradebookColumn => ({ columnId: '_3560530_1', isCalc: false, ...o });

  it('probes a column with a last attempt', () => {
    expect(shouldProbeColumn(col({ lastAttempt: { status: 'COMPLETED' }, submissionStatus: 'NO_STATUS' }))).toBe(true);
  });

  it('probes a column whose status says something happened', () => {
    for (const s of ['SUBMITTED', 'GRADED', 'DRAFT_SAVED_STUDENT', 'NEEDS_GRADING']) {
      expect(shouldProbeColumn(col({ submissionStatus: s })), s).toBe(true);
    }
  });

  it('skips a column Blackboard says was never opened, and one with no status', () => {
    expect(shouldProbeColumn(col({ submissionStatus: 'UNOPENED' }))).toBe(false);
    expect(shouldProbeColumn(col({ submissionStatus: 'NO_STATUS' }))).toBe(false);
    expect(shouldProbeColumn(col({ submissionStatus: null }))).toBe(false);
  });

  it('never probes a calculated column — a total has no submissions', () => {
    expect(shouldProbeColumn(col({ isCalc: true, submissionStatus: 'GRADED', lastAttempt: {} }))).toBe(false);
  });

  it('skips anything with no column id', () => {
    expect(shouldProbeColumn({ isCalc: false, submissionStatus: 'GRADED' })).toBe(false);
    expect(shouldProbeColumn(null)).toBe(false);
  });
});

describe('assessmentFields — the probe for where Ultra keeps the assessment fields', () => {
  it('finds the four fields at any depth and records where each came from', () => {
    const full = {
      id: '_12928186_1',
      contentDetail: {
        'resource/x-bb-asmt-test-link': {
          test: { assessment: { dueDate: '2026-10-01T03:59:00.000Z', points: 20, attemptsAllowed: 2 } },
        },
      },
      gradebookColumnId: '_3560530_1',
    };
    const out = assessmentFields(full)!;
    expect(out.values).toEqual({
      dueDate: '2026-10-01T03:59:00.000Z',
      points: 20,
      attemptsAllowed: 2,
      gradebookColumnId: '_3560530_1',
    });
    expect(out.paths.gradebookColumnId).toBe('gradebookColumnId');
    expect(out.paths.dueDate).toBe('contentDetail.resource/x-bb-asmt-test-link.test.assessment.dueDate');
  });

  it('prefers the shallower occurrence when a field appears twice', () => {
    const out = assessmentFields({ points: 5, nested: { points: 99 } })!;
    expect(out.values.points).toBe(5);
    expect(out.paths.points).toBe('points');
  });

  it('reads the alternate spellings', () => {
    const out = assessmentFields({ detail: { pointsPossible: 10, gradeColumnId: '_1_1', numberOfAttempts: 3 } })!;
    expect(out.values.points).toBe(10);
    expect(out.values.gradebookColumnId).toBe('_1_1');
    expect(out.values.attemptsAllowed).toBe(3);
  });

  it('walks arrays and survives a cycle', () => {
    const cyclic: Record<string, unknown> = { items: [{ deep: { dueDate: '2026-11-01T00:00:00.000Z' } }] };
    cyclic.self = cyclic;
    expect(assessmentFields(cyclic)!.values.dueDate).toBe('2026-11-01T00:00:00.000Z');
  });

  it('never stores an object as a value', () => {
    expect(assessmentFields({ dueDate: { when: 'later' } })).toBeNull();
  });

  it('returns null when the item exposes none of them, so nothing is invented', () => {
    expect(assessmentFields({ id: '_1_1', title: 'Quiz #1' })).toBeNull();
    expect(assessmentFields(null)).toBeNull();
  });
});
