/**
 * The crawler's attempts mappers (`ingest/bb_crawler.js`, Phase 10a / crawler version 3).
 *
 * The mappers are module-level pure functions so they can be covered without a Blackboard
 * session: loaded through `createRequire` rather than Vite, because the crawler is a plain
 * CommonJS script that is also pasted verbatim into an Ultra browser tab.
 *
 * WHAT THIS PROVES, AND WHAT IT CANNOT. The attempts endpoint is not in Anthology's published
 * schema and no bb_raw payload has ever carried an attempt, so every key name the mapper reads is
 * a candidate. These tests prove the mapper produces the FROZEN payload shape migration 050 reads,
 * caps prose, never invents a value, and emits the `keys` probe. They do not prove Blackboard's
 * real key names — that is settled by one live crawl, which needs Stack's MFA and is step 0 of his
 * acceptance script. See docs/planning/66_W17_VERIFICATION.md.
 */

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface AttemptFile {
  id: string;
  name: string | null;
  size: number | null;
  downloadUrl: string | null;
}

interface MappedAttempt {
  id: string | null;
  status: string | null;
  created: string | null;
  modified: string | null;
  submitted: string | null;
  score: number | null;
  feedback: string | null;
  studentComments: string | null;
  studentSubmission: string | null;
  exempt: boolean | null;
  receipt: string | null;
  files: AttemptFile[];
  keys?: string[];
}

interface GradebookColumn {
  columnId?: string;
  isCalc?: boolean;
  lastAttempt?: unknown;
  submissionStatus?: string | null;
}

const require = createRequire(import.meta.url);
const crawler = require('../../ingest/bb_crawler.js') as {
  mapAttempt: (a: unknown, files?: unknown[], includeKeys?: boolean) => MappedAttempt | null;
  mapAttemptFile: (
    f: unknown,
    ctx?: { base?: string; courseId?: string | null; attemptId?: string | null },
  ) => AttemptFile | null;
  shouldProbeColumn: (g: unknown) => boolean;
  assessmentFields: (item: unknown, maxDepth?: number) =>
    | { values: Record<string, unknown>; paths: Record<string, string> }
    | null;
  ATTEMPT_FIELD_KEYS: Record<string, string[]>;
  CRAWLER_VERSION: number;
};
const { mapAttempt, mapAttemptFile, shouldProbeColumn, assessmentFields, ATTEMPT_FIELD_KEYS } = crawler;

const CTX = { courseId: '_571529_1', attemptId: '_8100001_1' };

describe('the envelope version', () => {
  it('is 3 — the first versioned crawler payload', () => {
    expect(crawler.CRAWLER_VERSION).toBe(3);
  });
});

describe('mapAttemptFile', () => {
  it('builds the absolute two-call download URL', () => {
    const f = mapAttemptFile({ id: '_4400001_1', name: 'quiz1.pdf', size: 184213 }, CTX)!;
    expect(f.downloadUrl).toBe(
      'https://blackboard.syracuse.edu/learn/api/v1/courses/_571529_1/gradebook/attempts/_8100001_1/files/_4400001_1/download',
    );
    expect(f).toEqual({ id: '_4400001_1', name: 'quiz1.pdf', size: 184213, downloadUrl: f.downloadUrl });
  });

  it('honours a different Blackboard host', () => {
    const f = mapAttemptFile({ id: '_1_1' }, { ...CTX, base: 'https://bb.example.edu' })!;
    expect(f.downloadUrl!.startsWith('https://bb.example.edu/learn/api/v1/')).toBe(true);
  });

  it('reads the alternate name and size spellings', () => {
    expect(mapAttemptFile({ id: '_1_1', fileName: 'a.docx', fileSize: 12 }, CTX)!.name).toBe('a.docx');
    expect(mapAttemptFile({ id: '_1_1', displayName: 'b.docx' }, CTX)!.name).toBe('b.docx');
    expect(mapAttemptFile({ id: '_1_1', bytes: 99 }, CTX)!.size).toBe(99);
  });

  it('leaves an unknown field null rather than guessing', () => {
    const f = mapAttemptFile({ id: '_1_1' }, CTX)!;
    expect(f.name).toBeNull();
    expect(f.size).toBeNull();
  });

  it('drops an entry with no id, because nothing could ever download it', () => {
    expect(mapAttemptFile({ name: 'ghost.pdf' }, CTX)).toBeNull();
    expect(mapAttemptFile(null, CTX)).toBeNull();
    expect(mapAttemptFile('nonsense', CTX)).toBeNull();
  });

  it('has no download URL when the attempt context is missing', () => {
    expect(mapAttemptFile({ id: '_1_1' })!.downloadUrl).toBeNull();
  });
});

describe('mapAttempt — the frozen payload shape', () => {
  const raw = {
    id: '_8100001_1',
    status: 'COMPLETED',
    createdDate: '2026-08-31T22:14:11.000Z',
    modifiedDate: '2026-09-01T14:22:03.000Z',
    attemptDate: '2026-08-31T22:51:49.847Z',
    score: 8,
    feedback: { rawText: '<p>Solid first pass.</p>' },
    studentComments: 'Resubmitting.',
    studentSubmission: 'Answers attached.',
    exempt: false,
    receipt: '0f2a7c91',
  };

  it('emits exactly the keys migration 050 reads', () => {
    const out = mapAttempt(raw, [], false)!;
    expect(Object.keys(out).sort()).toEqual([
      'created', 'exempt', 'feedback', 'files', 'id', 'modified', 'receipt', 'score', 'status',
      'studentComments', 'studentSubmission', 'submitted',
    ]);
  });

  it('carries the identifiers, timestamps and score through', () => {
    const out = mapAttempt(raw)!;
    expect(out.id).toBe('_8100001_1');
    expect(out.status).toBe('COMPLETED');
    expect(out.created).toBe('2026-08-31T22:14:11.000Z');
    expect(out.modified).toBe('2026-09-01T14:22:03.000Z');
    expect(out.submitted).toBe('2026-08-31T22:51:49.847Z');
    expect(out.score).toBe(8);
    expect(out.exempt).toBe(false);
    expect(out.receipt).toBe('0f2a7c91');
  });

  it('prefers submittedDate over attemptDate when Blackboard sends both', () => {
    const out = mapAttempt({ ...raw, submittedDate: '2026-09-02T00:00:00.000Z' })!;
    expect(out.submitted).toBe('2026-09-02T00:00:00.000Z');
    expect(ATTEMPT_FIELD_KEYS.submitted[0]).toBe('submittedDate');
  });

  it('flattens prose to plain text and caps each field', () => {
    expect(mapAttempt(raw)!.feedback).toBe('Solid first pass.');
    const long = mapAttempt({
      ...raw,
      feedback: 'f'.repeat(4000),
      studentComments: 'c'.repeat(4000),
      studentSubmission: 's'.repeat(9000),
    })!;
    expect(long.feedback).toHaveLength(1000);
    expect(long.studentComments).toHaveLength(2000);
    expect(long.studentSubmission).toHaveLength(4000);
  });

  it('keeps a zero score, which is a grade, not an absence', () => {
    expect(mapAttempt({ ...raw, score: 0 })!.score).toBe(0);
  });

  it('returns null for an unknown key rather than guessing', () => {
    const bare = mapAttempt({ id: '_8100009_1' })!;
    expect(bare.status).toBeNull();
    expect(bare.created).toBeNull();
    expect(bare.submitted).toBeNull();
    expect(bare.score).toBeNull();
    expect(bare.feedback).toBeNull();
    expect(bare.receipt).toBeNull();
    expect(bare.exempt).toBeNull();
    expect(bare.files).toEqual([]);
  });

  it('never passes a non-number off as a score or a non-boolean as exempt', () => {
    const odd = mapAttempt({ id: '_1_1', score: 'eight', exempt: 'yes' })!;
    expect(odd.score).toBeNull();
    expect(odd.exempt).toBeNull();
  });

  it('carries its files and drops the unusable ones', () => {
    const files = [
      mapAttemptFile({ id: '_4400001_1', name: 'a.pdf' }, CTX),
      mapAttemptFile({ name: 'no-id.pdf' }, CTX),
    ];
    const out = mapAttempt(raw, files)!;
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
    const out = mapAttempt({ id: '_1_1', status: 'X', createdDate: 'd', groupAttemptId: null }, [], true)!;
    expect(out.keys).toEqual(['id', 'status', 'createdDate', 'groupAttemptId']);
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

describe('shouldProbeColumn — which columns cost a round trip', () => {
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
