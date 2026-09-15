/**
 * Staging a file: what is refused at the boundary, exactly what row is written,
 * and what happens when Storage and `bb_files` disagree.
 *
 * The two failure paths are the point of half of this file. An object that
 * uploads and then loses its `bb_files` insert is invisible to every screen AND
 * occupies the key the next attempt will pick, so it has to be removed. A key
 * that is already taken by something with no row has to be stepped over, not
 * reported as a conflict the reader cannot see.
 *
 * The client is a recording fake; nothing here touches the network, Storage or
 * a Supabase project.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { relation: string; filters: string[] };

const calls: Call[] = [];
const resultsByRelation = new Map<string, { data: unknown; error: unknown }>();

const uploads: { key: string; options: unknown }[] = [];
const inserts: Record<string, unknown>[] = [];
const removals: string[][] = [];
const listings: string[] = [];

/** Errors to hand back, newest call first; `null` entries succeed. */
let uploadErrors: unknown[] = [];
let insertError: unknown = null;
let listed: { name: string }[] = [];
let removeThrows = false;

function fakeBuilder(relation: string) {
  const call: Call = { relation, filters: [] };
  const settle = () => {
    if (relation === 'bb_files' && inserts.length > 0) return { data: null, error: insertError };
    return resultsByRelation.get(relation) ?? { data: [], error: null };
  };

  const builder = {
    select() {
      calls.push(call);
      return builder;
    },
    insert(row: Record<string, unknown>) {
      inserts.push(row);
      return builder;
    },
    eq(column: string, value: unknown) {
      call.filters.push(`eq:${column}=${String(value)}`);
      return builder;
    },
    is(column: string, value: unknown) {
      call.filters.push(`is:${column}=${String(value)}`);
      return builder;
    },
    maybeSingle: () => Promise.resolve(settle()),
    then: (resolve: (value: { data: unknown; error: unknown }) => unknown) => resolve(settle()),
  };
  return builder;
}

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: (relation: string) => fakeBuilder(relation),
    storage: {
      from: () => ({
        upload: (key: string, _file: unknown, options: unknown) => {
          uploads.push({ key, options });
          return Promise.resolve({ data: null, error: uploadErrors.shift() ?? null });
        },
        list: (prefix: string) => {
          listings.push(prefix);
          return Promise.resolve({ data: listed, error: null });
        },
        remove: (keys: string[]) => {
          removals.push(keys);
          if (removeThrows) return Promise.reject(new Error('remove failed too'));
          return Promise.resolve({ data: null, error: null });
        },
      }),
    },
    auth: { getSession: vi.fn() },
  }),
}));

const {
  assignmentSlug,
  isStorageConflict,
  sanitizeFileName,
  stageUpload,
  submissionFolder,
  submissionRelPath,
  validateUpload,
  withCollisionSuffix,
  MAX_UPLOAD_BYTES,
} = await import('@/lib/queries.submissions');

function fakeFile(name: string, size = 10, type = 'application/pdf'): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

beforeEach(() => {
  calls.length = 0;
  uploads.length = 0;
  inserts.length = 0;
  removals.length = 0;
  listings.length = 0;
  resultsByRelation.clear();
  uploadErrors = [];
  insertError = null;
  listed = [];
  removeThrows = false;
});

/* ===========================================================================
 * The boundary
 * ======================================================================== */

describe('sanitizeFileName', () => {
  it('replaces path separators so a name cannot move the object', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(sanitizeFileName('a\\b.pdf')).toBe('a_b.pdf');
  });

  it('replaces control characters', () => {
    expect(sanitizeFileName(`lab${String.fromCharCode(9)}1.pdf`)).toBe('lab_1.pdf');
    expect(sanitizeFileName(`lab${String.fromCharCode(0)}1.pdf`)).toBe('lab_1.pdf');
  });

  it('caps the name at 180 characters, keeping the extension', () => {
    const long = sanitizeFileName(`${'n'.repeat(400)}.pdf`);
    expect(long).toHaveLength(180);
    expect(long.endsWith('.pdf')).toBe(true);
  });

  it('refuses a name with nothing usable left', () => {
    expect(() => sanitizeFileName('   ')).toThrow(/cannot be used/);
    expect(() => sanitizeFileName(null)).toThrow(/no name/);
  });
});

describe('withCollisionSuffix', () => {
  it('leaves a free name alone', () => {
    expect(withCollisionSuffix('lab1.pdf', ['other.pdf'])).toBe('lab1.pdf');
  });

  it('numbers a collision before the extension rather than overwriting', () => {
    expect(withCollisionSuffix('lab1.pdf', ['lab1.pdf'])).toBe('lab1 (2).pdf');
    expect(withCollisionSuffix('lab1.pdf', ['lab1.pdf', 'lab1 (2).pdf'])).toBe('lab1 (3).pdf');
  });

  it('compares names case-insensitively, as Storage keys are used', () => {
    expect(withCollisionSuffix('Lab1.pdf', ['lab1.pdf'])).toBe('Lab1 (2).pdf');
  });
});

describe('assignmentSlug / submissionRelPath', () => {
  it("is Postgres split_part(assignment_id, '/', 2)", () => {
    expect(assignmentSlug('IST.323/lab-1')).toBe('lab-1');
    expect(assignmentSlug('IST.323/lab-1/extra')).toBe('lab-1');
    expect(assignmentSlug('IST.323')).toBe('');
    expect(assignmentSlug(null)).toBe('');
  });

  it('builds the same key bb_file_relpath builds for a staged row', () => {
    expect(submissionRelPath('IST.323', 'IST.323/lab-1', 'lab1.pdf')).toBe(
      'IST.323/my_submissions/lab-1/lab1.pdf',
    );
    expect(submissionRelPath('IST.323', null, 'lab1.pdf')).toBe(
      'IST.323/my_submissions/lab1.pdf',
    );
    expect(submissionFolder('IST.323', 'IST.323/lab-1')).toBe('IST.323/my_submissions/lab-1');
  });
});

describe('validateUpload', () => {
  it('takes exactly one file', () => {
    const f = fakeFile('lab1.pdf');
    expect(validateUpload([f])).toBe(f);
    expect(() => validateUpload([])).toThrow(/No file/);
    expect(() => validateUpload(null)).toThrow(/No file/);
    expect(() => validateUpload([f, fakeFile('b.pdf')])).toThrow(/One file at a time/);
  });

  it('refuses an empty file and one over 50 MB', () => {
    expect(() => validateUpload([fakeFile('empty.pdf', 0)])).toThrow(/empty/);
    expect(() => validateUpload([fakeFile('huge.zip', MAX_UPLOAD_BYTES + 1)])).toThrow(
      /the limit is 50 MB/,
    );
    expect(validateUpload([fakeFile('just.zip', MAX_UPLOAD_BYTES)])).toBeTruthy();
  });
});

describe('isStorageConflict', () => {
  it('recognises the 409 in either of the shapes Storage reports it', () => {
    expect(isStorageConflict({ statusCode: '409' })).toBe(true);
    expect(isStorageConflict({ status: 409 })).toBe(true);
    expect(isStorageConflict({ message: 'The resource already exists' })).toBe(true);
  });

  it('does not treat an unrelated failure as a name clash', () => {
    expect(isStorageConflict({ statusCode: '403', message: 'not authorised' })).toBe(false);
    expect(isStorageConflict(null)).toBe(false);
  });
});

/* ===========================================================================
 * The write
 * ======================================================================== */

describe('stageUpload — the row it writes', () => {
  beforeEach(() => {
    resultsByRelation.set('courses', {
      data: { id: 'IST.323', bb_id: '_571529_1' },
      error: null,
    });
    resultsByRelation.set('bb_files', { data: [], error: null });
  });

  function stage(name = 'lab1.pdf') {
    return stageUpload({
      courseId: 'IST.323',
      assignmentId: 'IST.323/lab-1',
      files: [fakeFile(name, 12_345)],
    });
  }

  it('uploads to bb_file_relpath, never overwriting', async () => {
    await stage();
    expect(uploads).toEqual([
      {
        key: 'IST.323/my_submissions/lab-1/lab1.pdf',
        options: { upsert: false, contentType: 'application/pdf' },
      },
    ]);
  });

  it('writes exactly the Contract row', async () => {
    const result = await stage();
    expect(inserts).toHaveLength(1);
    const row = inserts[0];

    expect(row.bb_course_id).toBe('_571529_1');
    expect(row.course_id).toBe('IST.323');
    expect(row.file_name).toBe('lab1.pdf');
    expect(row.mime_type).toBe('application/pdf');
    expect(row.bytes).toBe(12_345);
    expect(row.sha256).toBe(result.sha256);
    expect(row.storage_path).toBe('bb-files/IST.323/my_submissions/lab-1/lab1.pdf');
    expect(row.local_path).toBeNull();
    expect(row.bucket).toBe('my_submissions');
    expect(row.classified_by).toBe('stack');
    expect(row.classification_confidence).toBe(1);
    expect(row.assignment_id).toBe('IST.323/lab-1');
    expect(row.text_status).toBe('na');
    expect(row.source_url).toBeNull();
    expect(row.downloaded_at).toEqual(expect.any(String));
    expect(row.notes).toMatch(/^staged in bb2dash 20/);
  });

  it('hashes the bytes with sha256', async () => {
    const result = await stage();
    // 'x', the single byte every fake file carries.
    expect(result.sha256).toBe(
      '2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881',
    );
  });

  it('suffixes a name that is already taken rather than replacing it', async () => {
    resultsByRelation.set('bb_files', { data: [{ file_name: 'lab1.pdf' }], error: null });
    const result = await stage();
    expect(result.fileName).toBe('lab1 (2).pdf');
    expect(uploads[0].key).toBe('IST.323/my_submissions/lab-1/lab1 (2).pdf');
  });

  it('refuses a course with no Blackboard id rather than guessing one', async () => {
    resultsByRelation.set('courses', { data: { id: 'IST.323', bb_id: null }, error: null });
    await expect(stage()).rejects.toThrow(/no Blackboard id recorded/);
    expect(uploads).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it('never touches assignments, assignment_progress, bb_gradebook or bb_attempts', async () => {
    await stage();
    const relations = new Set(calls.map((call) => call.relation));
    for (const forbidden of [
      'assignments',
      'assignment_progress',
      'bb_gradebook',
      'bb_attempts',
    ]) {
      expect(relations.has(forbidden)).toBe(false);
    }
  });
});

describe('stageUpload — when Storage and bb_files disagree', () => {
  beforeEach(() => {
    resultsByRelation.set('courses', {
      data: { id: 'IST.323', bb_id: '_571529_1' },
      error: null,
    });
    resultsByRelation.set('bb_files', { data: [], error: null });
  });

  function stage() {
    return stageUpload({
      courseId: 'IST.323',
      assignmentId: 'IST.323/lab-1',
      files: [fakeFile('lab1.pdf', 12_345)],
    });
  }

  it('removes the orphan object when the bb_files insert fails, and still reports it', async () => {
    insertError = new Error('new row violates row-level security policy');

    await expect(stage()).rejects.toThrow('row-level security');
    expect(removals).toEqual([['IST.323/my_submissions/lab-1/lab1.pdf']]);
  });

  it('reports the insert failure even when the cleanup fails too', async () => {
    insertError = new Error('permission denied for table bb_files');
    removeThrows = true;

    await expect(stage()).rejects.toThrow('permission denied for table bb_files');
    expect(removals).toHaveLength(1);
  });

  it('leaves the object alone when the insert worked', async () => {
    await stage();
    expect(removals).toEqual([]);
  });

  it('steps over a key Storage holds but no bb_files row knows about', async () => {
    uploadErrors = [{ statusCode: '409', message: 'The resource already exists' }];
    listed = [{ name: 'lab1.pdf' }];

    const result = await stage();

    expect(listings).toEqual(['IST.323/my_submissions/lab-1']);
    expect(uploads.map((u) => u.key)).toEqual([
      'IST.323/my_submissions/lab-1/lab1.pdf',
      'IST.323/my_submissions/lab-1/lab1 (2).pdf',
    ]);
    expect(result.fileName).toBe('lab1 (2).pdf');
    expect(inserts[0].storage_path).toBe('bb-files/IST.323/my_submissions/lab-1/lab1 (2).pdf');
  });

  it('retries the suffix once, then reports the conflict rather than looping', async () => {
    uploadErrors = [
      { statusCode: '409', message: 'The resource already exists' },
      { statusCode: '409', message: 'The resource already exists' },
    ];

    await expect(stage()).rejects.toMatchObject({ statusCode: '409' });
    expect(uploads).toHaveLength(2);
    expect(inserts).toHaveLength(0);
  });

  it('does not retry a failure that is not a name clash', async () => {
    uploadErrors = [{ statusCode: '403', message: 'new row violates row-level security policy' }];

    await expect(stage()).rejects.toMatchObject({ statusCode: '403' });
    expect(uploads).toHaveLength(1);
    expect(listings).toEqual([]);
    expect(inserts).toHaveLength(0);
  });
});
