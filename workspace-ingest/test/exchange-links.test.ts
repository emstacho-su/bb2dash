// Round 3, finding 3: the exchange folder is the parser's to write, so neither side follows a link in
// it or reads anything that is not a regular file. A parser that was taken over must not be able to
// make the worker write an upload's bytes somewhere else, or read a device or a FIFO as its answer.

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  EXCHANGE_FILES,
  NOFOLLOW_READ_FLAGS,
  NOFOLLOW_CREATE_FLAGS,
  clearExchange,
  handOver,
  isRegularFileStat,
  readRegularFile,
  writeJsonAtomic,
  writeNewFile,
} from '../src/exchange.js';
import { serveOne } from '../src/parser-loop.js';
import { fakeClock, listDir, tempDir } from './helpers.js';

const UNITS = [{ unit_kind: 'page', unit_no: 1, text: 'Synthetic.' }];
const DOC = { documentId: 5, extension: 'pdf', bytes: Buffer.from('%PDF-synthetic') };

/** True when this platform lets the test make a symlink (Windows needs a privilege most sessions lack). */
function canSymlink(): boolean {
  const dir = tempDir('link-probe-');
  try {
    fs.writeFileSync(path.join(dir, 't'), 'x');
    fs.symlinkSync(path.join(dir, 't'), path.join(dir, 'l'));
    return true;
  } catch {
    return false;
  }
}
const SYMLINKS = canSymlink();
const linkIt = SYMLINKS ? it : it.skip; // skipped: this platform refuses fs.symlinkSync (Windows without the privilege)

function deps(dir: string, onSleep: (d: string) => void = () => undefined) {
  const t = fakeClock(onSleep, dir);
  return { dir, now: t.now, sleep: t.sleep, pollMs: 30_000, timeoutMs: 330_000 };
}

describe('the decision, on every platform', () => {
  const stat = (kind: 'file' | 'dir' | 'link' | 'fifo') => ({
    isFile: () => kind === 'file',
    isSymbolicLink: () => kind === 'link',
    isDirectory: () => kind === 'dir',
  });

  it('only a regular file passes: a link, a directory and a FIFO do not', () => {
    expect(isRegularFileStat(stat('file') as fs.Stats)).toBe(true);
    for (const kind of ['link', 'dir', 'fifo'] as const) expect(isRegularFileStat(stat(kind) as fs.Stats), kind).toBe(false);
  });

  it('the flags: read and create never follow a link where the platform has the flag, and create is exclusive', () => {
    const nofollow = fs.constants.O_NOFOLLOW ?? 0;
    expect(NOFOLLOW_READ_FLAGS & nofollow).toBe(nofollow);
    expect(NOFOLLOW_READ_FLAGS & fs.constants.O_RDONLY).toBe(fs.constants.O_RDONLY);
    expect(NOFOLLOW_CREATE_FLAGS & nofollow).toBe(nofollow);
    expect(NOFOLLOW_CREATE_FLAGS & fs.constants.O_EXCL).toBe(fs.constants.O_EXCL);
    expect(NOFOLLOW_CREATE_FLAGS & fs.constants.O_CREAT).toBe(fs.constants.O_CREAT);
    expect(NOFOLLOW_CREATE_FLAGS & fs.constants.O_WRONLY).toBe(fs.constants.O_WRONLY);
  });

  it('readRegularFile reads a regular file, says absent for none, and refuses a directory', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'f'), 'hello');
    expect(readRegularFile(path.join(dir, 'f'), 100)).toEqual(Buffer.from('hello'));
    expect(readRegularFile(path.join(dir, 'none'), 100)).toBe('absent');
    fs.mkdirSync(path.join(dir, 'd'));
    expect(readRegularFile(path.join(dir, 'd'), 100)).toBe('refused');
  });

  it('readRegularFile refuses a file over the limit without reading it', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, 'f'), 'hello');
    expect(readRegularFile(path.join(dir, 'f'), 4)).toBe('refused');
  });

  it('writeNewFile refuses a name that is already there, whatever it is', () => {
    const dir = tempDir();
    fs.mkdirSync(path.join(dir, 'd'));
    expect(() => writeNewFile(path.join(dir, 'd'), Buffer.from('x'))).toThrow();
    fs.writeFileSync(path.join(dir, 'f'), 'old');
    expect(() => writeNewFile(path.join(dir, 'f'), Buffer.from('new'))).toThrow();
    expect(fs.readFileSync(path.join(dir, 'f'), 'utf8')).toBe('old');
  });

  it('a directory where the answer should be is extract_failed, and the folder is cleared', async () => {
    const dir = tempDir();
    const r = await handOver(dir, DOC, deps(dir, (d) => {
      if (fs.existsSync(path.join(d, 'request.json')) && !fs.existsSync(path.join(d, 'answer.json'))) fs.mkdirSync(path.join(d, 'answer.json'));
    }));
    expect(r).toEqual({ ok: false, code: 'extract_failed' });
    expect(listDir(dir)).toEqual([]);
  });
});

describe('with a real symlink in the folder', () => {
  linkIt('an answer.json that is a link is never followed: extract_failed, the link removed, the target untouched', async () => {
    const outside = tempDir('outside-');
    const target = path.join(outside, 'answer-elsewhere.json');
    fs.writeFileSync(target, JSON.stringify({ document_id: 5, ok: true, units: UNITS }));
    const dir = tempDir();
    const r = await handOver(dir, DOC, deps(dir, (d) => {
      if (fs.existsSync(path.join(d, 'request.json')) && !fs.existsSync(path.join(d, 'answer.json'))) fs.symlinkSync(target, path.join(d, 'answer.json'));
    }));
    expect(r).toEqual({ ok: false, code: 'extract_failed' });
    expect(listDir(dir)).toEqual([]);
    expect(fs.readFileSync(target, 'utf8')).toContain('"ok":true');
  });

  linkIt('a link at the document file name is not written through (the create is exclusive)', () => {
    const outside = tempDir('outside-');
    const target = path.join(outside, 'victim');
    fs.writeFileSync(target, 'untouched');
    const dir = tempDir();
    fs.symlinkSync(target, path.join(dir, 'doc-5.pdf'));
    expect(() => writeNewFile(path.join(dir, 'doc-5.pdf'), Buffer.from('upload bytes'))).toThrow();
    expect(fs.readFileSync(target, 'utf8')).toBe('untouched');
  });

  linkIt('a link at request.json.tmp is replaced, not written through', () => {
    const outside = tempDir('outside-');
    const target = path.join(outside, 'victim');
    fs.writeFileSync(target, 'untouched');
    const dir = tempDir();
    fs.symlinkSync(target, path.join(dir, `${EXCHANGE_FILES.request}${EXCHANGE_FILES.tmpSuffix}`));
    writeJsonAtomic(dir, EXCHANGE_FILES.request, { document_id: 5, file: 'doc-5.pdf' });
    expect(fs.readFileSync(target, 'utf8')).toBe('untouched');
    expect(fs.lstatSync(path.join(dir, EXCHANGE_FILES.request)).isFile()).toBe(true);
  });

  linkIt('clearing removes a link and not what it points at', () => {
    const outside = tempDir('outside-');
    const target = path.join(outside, 'victim');
    fs.writeFileSync(target, 'untouched');
    const dir = tempDir();
    fs.symlinkSync(target, path.join(dir, 'doc-9.pdf'));
    clearExchange(dir);
    expect(listDir(dir)).toEqual([]);
    expect(fs.readFileSync(target, 'utf8')).toBe('untouched');
  });

  linkIt('the parser does not read a request.json that is a link, nor extract a document that is one', async () => {
    const outside = tempDir('outside-');
    const target = path.join(outside, 'elsewhere');
    fs.writeFileSync(target, JSON.stringify({ document_id: 5, file: 'doc-5.pdf' }));
    const extract = vi.fn(async () => UNITS);

    const dirA = tempDir();
    fs.symlinkSync(target, path.join(dirA, EXCHANGE_FILES.request));
    expect(await serveOne({ dir: dirA, extract, log: () => undefined })).toBe(true);
    expect(extract).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(dirA, EXCHANGE_FILES.request))).toBe(false);

    const dirB = tempDir();
    fs.symlinkSync(target, path.join(dirB, 'doc-5.pdf'));
    fs.writeFileSync(path.join(dirB, EXCHANGE_FILES.request), JSON.stringify({ document_id: 5, file: 'doc-5.pdf' }));
    await serveOne({ dir: dirB, extract, log: () => undefined });
    expect(extract).not.toHaveBeenCalled();
    expect(JSON.parse(fs.readFileSync(path.join(dirB, EXCHANGE_FILES.answer), 'utf8'))).toEqual({ document_id: 5, ok: false, error: 'extract_failed' });
    expect(fs.readFileSync(target, 'utf8')).toContain('doc-5.pdf');
  });
});
