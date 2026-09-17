/**
 * M-3 / P-materials-4 and the label half of P-materials-2.
 *
 * Two complaints about the same rows. An off-platform reading offered a
 * disabled "How to access" button and no way to find out how; and 41 rows were
 * tagged "Off-platform" when only 21 of them were — the other 20 were GEO 103
 * readings sitting on Blackboard that had simply never been pulled.
 *
 * The fixtures below are the seven real `courses` rows and the ten real
 * `syllabus_policy` files from prod, because the resolver's whole job is
 * picking the right one out of a course that has two.
 */

import { describe, expect, it } from 'vitest';
import {
  READING_TAG,
  lectureShellFor,
  resolveReadingRoute,
  resolveSyllabusFiles,
  syllabusBasename,
  type BbFileRow,
  type CourseSyllabusRow,
} from '@/lib/queries.materials';

/** The seven `courses` rows, as prod has them. */
const COURSES: CourseSyllabusRow[] = [
  { id: 'ECN.304', kind: 'lecture', syllabus_path: 'ECN.304/ECN 304 F26 Syllabus_M001.pdf' },
  {
    id: 'GEO.103.lecture',
    kind: 'lecture',
    syllabus_path: 'GEO.103/GEO 103 (2026) - syllabus - FINAL.pdf',
  },
  {
    id: 'GEO.103.recitation',
    kind: 'recitation',
    syllabus_path: 'GEO.103/GEO 103 (2026) - syllabus - FINAL.pdf',
  },
  { id: 'IST.323', kind: 'lecture', syllabus_path: 'IST.323/323Fall26V1.3.1.docx' },
  {
    id: 'IST.352',
    kind: 'lecture',
    syllabus_path: 'IST.352/syllabus_policy/IST 352 Syllabus Fall 2026.docx',
  },
  {
    id: 'IST.466',
    kind: 'lecture',
    syllabus_path: 'IST.466/syllabus_policy/IST466M3 Fall2026 Syllabus.docx',
  },
  { id: 'IST.471', kind: 'internship', syllabus_path: 'IST.471/IST 471 Syllabus.pdf' },
];

function file(
  id: number,
  course_id: string,
  file_name: string,
  bucket = 'syllabus_policy',
): BbFileRow {
  return {
    id,
    course_id,
    file_name,
    bucket,
    mime_type: 'application/pdf',
    bytes: 1024,
    storage_path: `${course_id}/${file_name}`,
    source_url: null,
    local_path: null,
    reading_id: null,
    session_id: null,
    week_no: null,
    notes: null,
    path: file_name,
  } as unknown as BbFileRow;
}

/** The ten real `syllabus_policy` rows; three courses carry two apiece. */
const FILES: BbFileRow[] = [
  file(23, 'ECN.304', 'ECN 304 F26 Syllabus_M001.pdf'),
  file(42, 'GEO.103.lecture', 'GEO 103 (2026) - syllabus - FINAL.pdf'),
  file(22, 'GEO.103.recitation', 'Discussion Section Syllabus Fall 2026.docx'),
  file(2, 'IST.323', '323Fall26V1.3.1.docx'),
  file(3, 'IST.323', 'Student Policies and Services - syllabus appendix August 2026 .docx'),
  file(27, 'IST.352', 'IST 352 Syllabus Fall 2026.docx'),
  file(73, 'IST.352', 'Project Prioritization Scoring Criteria v2.xlsx'),
  file(33, 'IST.466', 'Student Policies and Services - Syllabus appendix August 2026 .docx'),
  file(39, 'IST.466', 'IST466M3 Fall2026 Syllabus.docx'),
  file(26, 'IST.471', 'IST 471 Syllabus.pdf'),
];

describe('syllabusBasename', () => {
  it('takes the file name off the end of the path', () => {
    expect(syllabusBasename('IST.352/syllabus_policy/IST 352 Syllabus Fall 2026.docx')).toBe(
      'IST 352 Syllabus Fall 2026.docx',
    );
    expect(syllabusBasename('IST.471/IST 471 Syllabus.pdf')).toBe('IST 471 Syllabus.pdf');
  });

  it('says nothing for a course with no path recorded', () => {
    expect(syllabusBasename(null)).toBeNull();
    expect(syllabusBasename('')).toBeNull();
    expect(syllabusBasename('   ')).toBeNull();
  });
});

describe('lectureShellFor', () => {
  it('names the lecture shell a recitation belongs to', () => {
    expect(lectureShellFor('GEO.103.recitation')).toBe('GEO.103.lecture');
    expect(lectureShellFor('BIO.121.lab')).toBe('BIO.121.lecture');
  });

  it('has nothing to say about a lecture or an unsplit course', () => {
    expect(lectureShellFor('GEO.103.lecture')).toBeNull();
    expect(lectureShellFor('IST.323')).toBeNull();
  });
});

describe('resolveSyllabusFiles — picking the right one of two', () => {
  const resolved = resolveSyllabusFiles(COURSES, FILES);

  it('matches the basename of syllabus_path, not just any file in the bucket', () => {
    // Both of these courses file a student-policy appendix beside the syllabus.
    expect(resolved.get('IST.323')?.id).toBe(2);
    expect(resolved.get('IST.466')?.id).toBe(39);
    expect(resolved.get('IST.352')?.id).toBe(27);
  });

  it('resolves the single-file courses', () => {
    expect(resolved.get('ECN.304')?.id).toBe(23);
    expect(resolved.get('IST.471')?.id).toBe(26);
    expect(resolved.get('GEO.103.lecture')?.id).toBe(42);
  });

  it('falls the recitation shell back to its lecture’s file', () => {
    // Its own syllabus_policy file is the discussion-section guide, which is a
    // different document — and syllabus_path points at the lecture's anyway.
    expect(resolved.get('GEO.103.recitation')?.id).toBe(42);
    expect(resolved.get('GEO.103.recitation')?.file_name).toBe(
      'GEO 103 (2026) - syllabus - FINAL.pdf',
    );
  });

  it('answers for all seven courses', () => {
    expect([...resolved.keys()].sort()).toEqual(COURSES.map((c) => c.id).sort());
  });

  it('takes a course’s sole syllabus file when the recorded path does not match', () => {
    const one = resolveSyllabusFiles(
      [{ id: 'ECN.304', kind: 'lecture', syllabus_path: 'ECN.304/stale-name.pdf' }],
      [file(23, 'ECN.304', 'ECN 304 F26 Syllabus_M001.pdf')],
    );
    expect(one.get('ECN.304')?.id).toBe(23);
  });

  it('chooses nothing rather than guessing between two unmatched candidates', () => {
    const ambiguous = resolveSyllabusFiles(
      [{ id: 'IST.323', kind: 'lecture', syllabus_path: 'IST.323/stale-name.docx' }],
      FILES.filter((f) => f.course_id === 'IST.323'),
    );
    expect(ambiguous.get('IST.323')).toBeUndefined();
  });

  it('ignores files in other buckets', () => {
    const wrongBucket = resolveSyllabusFiles(
      [{ id: 'ECN.304', kind: 'lecture', syllabus_path: 'ECN.304/notes.pdf' }],
      [file(1, 'ECN.304', 'notes.pdf', 'lecture_slides')],
    );
    expect(wrongBucket.get('ECN.304')).toBeUndefined();
  });

  it('answers for nothing when there is nothing to answer with', () => {
    expect(resolveSyllabusFiles([], FILES).size).toBe(0);
    expect(resolveSyllabusFiles(COURSES, []).size).toBe(0);
  });
});

/* ---------------------------------------------------------------------------
 * P-materials-2, label half — "Off-platform" split in two
 * ------------------------------------------------------------------------ */

const TEXTBOOK = {
  url: null,
  on_blackboard: false,
  citation: 'Mankiw, Principles of Economics, 9e, ch. 4, pp. 70–92',
};
const ON_BLACKBOARD = { url: null, on_blackboard: true, citation: 'Week 3 reading' };

describe('reading tags', () => {
  it('calls a Blackboard reading we have not pulled what it is', () => {
    const route = resolveReadingRoute(ON_BLACKBOARD, undefined, 'https://bb/course/GEO103');
    expect(route.tag).toBe(READING_TAG.notPulled);
    expect(route.tag).not.toBe(READING_TAG.offPlatform);
  });

  it('says the same with no Blackboard URL to send you to', () => {
    expect(resolveReadingRoute(ON_BLACKBOARD, undefined, null).tag).toBe(READING_TAG.notPulled);
  });

  it('keeps "Off-platform" for a reading that really is', () => {
    expect(resolveReadingRoute(TEXTBOOK, undefined, null).tag).toBe(READING_TAG.offPlatform);
  });

  it('tags the other two rungs as it always did', () => {
    const stored = file(1, 'IST.323', 'ch1.pdf', 'readings');
    expect(resolveReadingRoute(TEXTBOOK, stored, null).tag).toBe(READING_TAG.library);
    expect(
      resolveReadingRoute({ ...TEXTBOOK, url: 'https://x/y' }, undefined, null).tag,
    ).toBe(READING_TAG.external);
    expect(
      resolveReadingRoute({ url: null, on_blackboard: false, citation: 'a talk' }, undefined, null)
        .tag,
    ).toBe(READING_TAG.none);
  });
});

describe('resolveReadingRoute — "How to access" carries the syllabus (M-3)', () => {
  const syllabus = FILES.find((f) => f.id === 23) as BbFileRow;

  it('attaches the course syllabus to an off-platform reading', () => {
    const route = resolveReadingRoute(TEXTBOOK, undefined, null, syllabus);
    expect(route.action).toBe('How to access');
    expect(route.syllabus?.id).toBe(23);
    expect(route.reason).toContain('The syllabus says how to get it.');
  });

  it('says the old thing when no syllabus could be resolved', () => {
    const route = resolveReadingRoute(TEXTBOOK, undefined, null, undefined);
    expect(route.syllabus).toBeUndefined();
    expect(route.reason).toContain('SU Libraries');
  });

  it('does not put the syllabus on a rung that has its own answer', () => {
    // A reading we can actually open, or one that is on Blackboard, does not
    // need to be told to go and read the syllabus.
    const stored = file(1, 'IST.323', 'ch1.pdf', 'readings');
    expect(resolveReadingRoute(TEXTBOOK, stored, null, syllabus).syllabus).toBeUndefined();
    expect(resolveReadingRoute(ON_BLACKBOARD, undefined, null, syllabus).syllabus).toBeUndefined();
  });

  it('leaves a genuinely unrouted reading unrouted', () => {
    const route = resolveReadingRoute(
      { url: null, on_blackboard: false, citation: 'a guest talk' },
      undefined,
      null,
      syllabus,
    );
    expect(route.kind).toBe('none');
    expect(route.syllabus).toBeUndefined();
  });
});
