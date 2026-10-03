// Task 10 (R-81, P-104): the files step and the embed step, on Phase 18's signed fetch and
// pull_files.mjs's pure helpers, with fakes for the network, Storage, extraction and the embed.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FileStoredArgs, WorklistRow } from '../src/db.js';
import {
  makeEmbedder,
  makeExtractor,
  makeSupabaseFiles,
  moveIntoPlace,
  runFilesStep,
  safeJoin,
  type FilesPorts,
} from '../src/files.js';

const CDN = 'https://abc.content.blackboardcdn.com/signed/file?sig=1';
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2000, 0x20)]);
const SHA = createHash('sha256').update(PDF).digest('hex');

let dir: string;
let tmpDir: string;
let courseDir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w55-files-'));
  tmpDir = path.join(dir, 'tmp');
  courseDir = path.join(dir, 'course context');
  fs.mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function row(id: string, over: Partial<WorklistRow> = {}): WorklistRow {
  return {
    id,
    file_name: `Lecture ${id}.pdf`,
    relpath: `IST.323/lecture_slides/week-01/Lecture ${id}.pdf`,
    mime: 'application/pdf',
    source_url: `https://blackboard.syracuse.edu/bbcswebdav/xid-${id}_1`,
    bucket: 'lecture_slides',
    attempt_id: null,
    ...over,
  };
}

/** Hops: the durable URL 302s to the CDN, unless a status is scripted for that row's URL. */
function hopFor(statusByUrl: Record<string, number> = {}) {
  return vi.fn(async (url: string): Promise<{ status: number; headers: Record<string, string> }> => {
    const scripted = statusByUrl[url];
    if (scripted !== undefined) return { status: scripted, headers: {} };
    return { status: 302, headers: { location: CDN } };
  });
}

function ports(rows: WorklistRow[], over: Partial<FilesPorts> = {}) {
  const stored: FileStoredArgs[] = [];
  const order: string[] = [];
  const p: FilesPorts = {
    rpc: {
      fileWorklist: vi.fn(async () => rows),
      fileStored: vi.fn(async (a: FileStoredArgs) => {
        stored.push(a);
        order.push(`stored ${a.id}`);
        return true;
      }),
    },
    hop: hopFor(),
    fetchSigned: vi.fn(async () => new Response(PDF, { status: 200 })),
    storagePost: vi.fn(async () => {
      order.push('storage');
      return { status: 200, body: '{}' };
    }),
    textPost: vi.fn(async () => {
      order.push('text');
      return { status: 201, body: '' };
    }),
    extract: vi.fn(async () => [{ unit_kind: 'page', unit_no: 1, text: 'hello' }]),
    embed: vi.fn(async () => {
      order.push('embed');
      return { code: 0, tail: 'remaining_parts=0' };
    }),
    fs: { mkdir: fs.promises.mkdir, rename: fs.promises.rename, copyFile: fs.promises.copyFile, unlink: fs.promises.unlink, readFile: fs.promises.readFile },
    tmpDir,
    courseFilesDir: courseDir,
    log: () => {},
    ...over,
  };
  return { p, stored, order };
}

describe('the files step', () => {
  it('pulls a file: Storage, course-files, extract, text, then sync_file_stored with its sha256', async () => {
    const { p, stored, order } = ports([row('11')]);
    const r = await runFilesStep(p);
    expect(r.files).toEqual({ pulled: 1, not_pulled: [] });
    expect(r.stopped).toBeNull();
    expect(stored).toEqual([{
      id: '11',
      key: 'IST.323/lecture_slides/week-01/Lecture 11.pdf',
      relpath: 'IST.323/lecture_slides/week-01/Lecture 11.pdf',
      sha256: SHA,
      bytes: PDF.length,
      mime: 'application/pdf',
      textStatus: 'extracted',
    }]);
    expect(order).toEqual(['storage', 'text', 'stored 11', 'embed']);
    expect(fs.readFileSync(path.join(courseDir, 'IST.323/lecture_slides/week-01/Lecture 11.pdf'))).toEqual(PDF);
    expect(fs.readdirSync(tmpDir)).toEqual([]);
    expect(p.hop).toHaveBeenCalledWith('https://blackboard.syracuse.edu/bbcswebdav/xid-11_1');
  });

  it('a key drops "#" the way storageKeyFor does; the relpath keeps it', async () => {
    const { p, stored } = ports([row('12', { file_name: 'HW #2.pdf', relpath: 'IST.323/assignment_spec/HW #2.pdf' })]);
    await runFilesStep(p);
    expect(stored[0]).toMatchObject({ key: 'IST.323/assignment_spec/HW _2.pdf', relpath: 'IST.323/assignment_spec/HW #2.pdf' });
  });

  it.each([401, 403])('session_expired (%i at the first hop) stops the step: later rows are not tried', async (status) => {
    const rows = [row('21'), row('22'), row('23')];
    const { p, stored } = ports(rows, { hop: hopFor({ 'https://blackboard.syracuse.edu/bbcswebdav/xid-22_1': status }) });
    const r = await runFilesStep(p);
    expect(r.stopped).toBe('session_expired');
    expect(stored.map((s) => s.id)).toEqual(['21']);
    expect(r.files.pulled).toBe(1);
    expect(r.files.not_pulled).toEqual([{ id: '22', reason: `session_expired: status ${status}` }]);
    expect(p.hop).toHaveBeenCalledTimes(2);
  });

  it('gone (404) is reported in not_pulled and never reaches sync_file_stored', async () => {
    const { p, stored } = ports([row('31')], { hop: hopFor({ 'https://blackboard.syracuse.edu/bbcswebdav/xid-31_1': 404 }) });
    const r = await runFilesStep(p);
    expect(r.files.not_pulled).toEqual([{ id: '31', reason: 'gone: status 404' }]);
    expect(stored).toEqual([]);
    expect(p.storagePost).not.toHaveBeenCalled();
  });

  it('refused (a redirect off the CDN) is reported in not_pulled and never stored', async () => {
    const hop = vi.fn(async () => ({ status: 302, headers: { location: 'https://evil.example.com/x' } }));
    const { p, stored } = ports([row('32')], { hop });
    const r = await runFilesStep(p);
    expect(r.files.not_pulled[0]).toMatchObject({ id: '32', reason: expect.stringMatching(/^refused: /) });
    expect(stored).toEqual([]);
  });

  it('a Storage 409 (or a Duplicate answer) is reported in not_pulled, never done, never stored', async () => {
    const rows = [row('41'), row('42')];
    const answers = [{ status: 409, body: '{"error":"Duplicate"}' }, { status: 400, body: '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}' }];
    const { p, stored } = ports(rows, { storagePost: vi.fn(async () => answers.shift()!) });
    const r = await runFilesStep(p);
    expect(r.files.pulled).toBe(0);
    expect(r.files.not_pulled.map((n) => n.id)).toEqual(['41', '42']);
    expect(r.files.not_pulled[0]!.reason).toMatch(/^storage 409/);
    expect(stored).toEqual([]);
    expect(p.extract).not.toHaveBeenCalled();
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });

  it('bytes that do not look like the file are reported, not stored', async () => {
    const { p, stored } = ports([row('51')], { fetchSigned: vi.fn(async () => new Response('<html>login</html>', { status: 200 })) });
    const r = await runFilesStep(p);
    expect(r.files.not_pulled[0]).toMatchObject({ id: '51', reason: expect.stringMatching(/^bad bytes/) });
    expect(stored).toEqual([]);
  });

  it('a relpath that climbs out of course-files is refused before any request', async () => {
    const { p, stored } = ports([row('52', { relpath: '../../etc/passwd' })]);
    const r = await runFilesStep(p);
    expect(r.files.not_pulled).toEqual([{ id: '52', reason: 'unsafe relpath' }]);
    expect(p.hop).not.toHaveBeenCalled();
    expect(stored).toEqual([]);
  });

  it('a text POST error leaves the row unstored and reported; an already-present answer keeps the text', async () => {
    const rows = [row('61'), row('62')];
    const answers = [{ status: 500, body: 'boom' }, { status: 409, body: '23505' }];
    const { p, stored } = ports(rows, { textPost: vi.fn(async () => answers.shift()!) });
    const r = await runFilesStep(p);
    expect(r.files.not_pulled).toEqual([{ id: '61', reason: 'bb_file_text 500: boom' }]);
    expect(stored.map((s) => s.id)).toEqual(['62']);
    expect(p.embed).not.toHaveBeenCalled();
  });

  it('an extraction that fails still stores the bytes, with text_status failed', async () => {
    const { p, stored } = ports([row('63')], { extract: vi.fn(async () => { throw new Error('uv: not found'); }) });
    const r = await runFilesStep(p);
    expect(r.files.pulled).toBe(1);
    expect(stored[0]!.textStatus).toBe('failed');
    expect(p.textPost).not.toHaveBeenCalled();
  });

  it('sync_file_stored refusing (false or an error) is reported, not counted', async () => {
    const answers: (boolean | Error)[] = [false, new Error('relpath is not bb_file_relpath(72)')];
    const { p } = ports([row('71'), row('72')], {
      rpc: {
        fileWorklist: vi.fn(async () => [row('71'), row('72')]),
        fileStored: vi.fn(async () => {
          const a = answers.shift()!;
          if (a instanceof Error) throw a;
          return a;
        }),
      },
    });
    const r = await runFilesStep(p);
    expect(r.files.pulled).toBe(0);
    expect(r.files.not_pulled).toEqual([
      { id: '71', reason: 'already stored by another writer' },
      { id: '72', reason: 'sync_file_stored refused: relpath is not bb_file_relpath(72)' },
    ]);
  });

  it('spawns embed_corpus.mjs once after at least one unit, and never on none', async () => {
    const two = ports([row('81'), row('82')]);
    await runFilesStep(two.p);
    expect(two.p.embed).toHaveBeenCalledTimes(1);

    const none = ports([row('83')], { extract: vi.fn(async () => []) });
    await runFilesStep(none.p);
    expect(none.p.embed).not.toHaveBeenCalled();

    const empty = ports([]);
    const r = await runFilesStep(empty.p);
    expect(empty.p.embed).not.toHaveBeenCalled();
    expect(r.files).toEqual({ pulled: 0, not_pulled: [] });
  });

  it('an embed that exits non-zero is the step\'s embedError', async () => {
    const { p } = ports([row('84')], { embed: vi.fn(async () => ({ code: 1, tail: 'embed-corpus 401' })) });
    const r = await runFilesStep(p);
    expect(Object.keys(r).sort()).toEqual(['embedError', 'files', 'stopped']);
    expect(r.embedError).toBe('embed_corpus.mjs exited 1: embed-corpus 401');
  });
});

describe('the move into course-files', () => {
  it('renames when it can', async () => {
    const ops = { mkdir: vi.fn(async () => undefined), rename: vi.fn(async () => undefined), copyFile: vi.fn(), unlink: vi.fn() };
    await moveIntoPlace('/tmp/a', '/app/course context/x/a', ops);
    expect(ops.rename).toHaveBeenCalledWith('/tmp/a', '/app/course context/x/a');
    expect(ops.copyFile).not.toHaveBeenCalled();
  });

  it('an EXDEV from the move takes copy-then-unlink (tmpfs to the course-files volume)', async () => {
    const exdev = Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' });
    const ops = {
      mkdir: vi.fn(async () => undefined),
      rename: vi.fn(async () => { throw exdev; }),
      copyFile: vi.fn(async () => undefined),
      unlink: vi.fn(async () => undefined),
    };
    await moveIntoPlace('/tmp/a', '/app/course context/x/a', ops);
    expect(ops.copyFile).toHaveBeenCalledWith('/tmp/a', '/app/course context/x/a');
    expect(ops.unlink).toHaveBeenCalledWith('/tmp/a');
  });

  it('any other rename error is thrown', async () => {
    const ops = {
      mkdir: vi.fn(async () => undefined),
      rename: vi.fn(async () => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); }),
      copyFile: vi.fn(),
      unlink: vi.fn(),
    };
    await expect(moveIntoPlace('/tmp/a', '/b', ops)).rejects.toThrow('EACCES');
    expect(ops.copyFile).not.toHaveBeenCalled();
  });

  it('safeJoin keeps a relpath inside its base', () => {
    expect(safeJoin('/app/course context', 'IST.323/a.pdf')).toBe(path.resolve('/app/course context', 'IST.323/a.pdf'));
    expect(safeJoin('/app/course context', '../x')).toBeNull();
    expect(safeJoin('/app/course context', '/etc/passwd')).toBeNull();
    expect(safeJoin('/app/course context', '')).toBeNull();
  });
});

describe('the adapters', () => {
  it('Storage: POST bb-files/<encoded key> with the publishable key and no x-upsert; text: bb_file_text', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    });
    const sb = makeSupabaseFiles('https://x.supabase.co', 'sb_publishable_abc', fetchImpl as unknown as typeof fetch);
    await sb.storagePost('IST.323/a b.pdf', Buffer.from('x'), 'application/pdf');
    await sb.textPost([{ file_id: 1, unit_kind: 'page', unit_no: 1, text: 't' }]);
    expect(calls[0]!.url).toBe('https://x.supabase.co/storage/v1/object/bb-files/IST.323/a%20b.pdf');
    const h0 = calls[0]!.init.headers as Record<string, string>;
    expect(h0.apikey).toBe('sb_publishable_abc');
    expect(h0['Content-Type']).toBe('application/pdf');
    expect(Object.keys(h0).map((k) => k.toLowerCase())).not.toContain('x-upsert');
    expect(calls[1]!.url).toBe('https://x.supabase.co/rest/v1/bb_file_text');
    expect((calls[1]!.init.headers as Record<string, string>).Prefer).toBe('return=minimal');
  });

  it('the extractor runs the locked project and reads extract_text.py\'s units', async () => {
    const exec = vi.fn(async () => ({ stdout: JSON.stringify([{ file: 'a.pdf', status: 'ok', units: [{ unit_kind: 'page', unit_no: 1, text: 'x' }] }]) }));
    const extract = makeExtractor('/app/ingest', exec);
    expect(await extract('/app/course context/a.pdf')).toEqual([{ unit_kind: 'page', unit_no: 1, text: 'x' }]);
    expect(exec).toHaveBeenCalledWith('uv', ['run', '--locked', '--project', '/app/ingest', 'python', path.join('/app/ingest', 'extract_text.py'), '/app/course context/a.pdf'], expect.objectContaining({ cwd: '/app/ingest' }));
  });

  it('the embedder runs node ingest/embed_corpus.mjs once and returns its exit code and last line', async () => {
    const run = vi.fn(async () => ({ code: 0, output: 'parts 3\nremaining_parts=0\n' }));
    const embed = makeEmbedder('/app/ingest', run);
    expect(await embed()).toEqual({ code: 0, tail: 'remaining_parts=0' });
    expect(run).toHaveBeenCalledWith(process.execPath, [path.join('/app/ingest', 'embed_corpus.mjs')], '/app/ingest');
  });
});
