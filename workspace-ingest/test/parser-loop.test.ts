// The parser's loop (freeze amendment F-3): one request at a time, extractUnits with the 300 s
// limit in its run argument, one JSON answer. It reads no secret and opens no connection.

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { EXCHANGE_FILES } from '../src/exchange.js';
import { makeExtractor, runParserLoop, serveOne, uvEnv } from '../src/parser-loop.js';
import { listDir, tempDir } from './helpers.js';

const UNITS = [{ unit_kind: 'page', unit_no: 1, text: 'Synthetic.' }];

function put(dir: string, request: unknown, files: Record<string, string> = {}): void {
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  fs.writeFileSync(path.join(dir, EXCHANGE_FILES.request), typeof request === 'string' ? request : JSON.stringify(request));
}

const answerOf = (dir: string) => JSON.parse(fs.readFileSync(path.join(dir, EXCHANGE_FILES.answer), 'utf8'));

describe('serveOne', () => {
  it('extracts the named file and writes the units back as one JSON file', async () => {
    const dir = tempDir();
    put(dir, { document_id: 17, file: 'doc-17.pdf' }, { 'doc-17.pdf': '%PDF' });
    const extract = vi.fn(async () => UNITS);
    expect(await serveOne({ dir, extract, log: () => undefined })).toBe(true);
    expect(extract).toHaveBeenCalledWith(path.join(dir, 'doc-17.pdf'));
    expect(answerOf(dir)).toEqual({ document_id: 17, ok: true, units: UNITS });
    expect(fs.existsSync(path.join(dir, EXCHANGE_FILES.request))).toBe(false);
    expect(listDir(dir).some((n) => n.endsWith('.tmp'))).toBe(false);
  });

  it('does nothing while there is no request', async () => {
    const dir = tempDir();
    const extract = vi.fn(async () => UNITS);
    expect(await serveOne({ dir, extract, log: () => undefined })).toBe(false);
    expect(extract).not.toHaveBeenCalled();
  });

  it('answers extract_timeout for a timed-out child and extract_failed for anything else, with no message', async () => {
    const lines: string[] = [];
    const cases: [Error, string][] = [
      [Object.assign(new Error('SENTINEL-STDERR'), { code: 'ETIMEDOUT' }), 'extract_timeout'],
      [new Error('SENTINEL-STDERR'), 'extract_failed'],
    ];
    for (const [error, code] of cases) {
      const dir = tempDir();
      put(dir, { document_id: 3, file: 'doc-3.docx' }, { 'doc-3.docx': 'PK' });
      await serveOne({
        dir,
        extract: async () => {
          throw error;
        },
        log: (l) => lines.push(l),
      });
      expect(answerOf(dir)).toEqual({ document_id: 3, ok: false, error: code });
    }
    expect(lines.join('\n')).not.toContain('SENTINEL');
  });

  it.each(['../etc/passwd', 'doc-17.pdf/../../x', '/exchange/doc-17.pdf', 'doc-17.exe', 'DOC-17.pdf', 'my file.pdf', 'doc-17.txt'])(
    'refuses a file name that is not doc-<id>.<ext>: %s',
    async (file) => {
      const dir = tempDir();
      put(dir, { document_id: 17, file });
      const extract = vi.fn(async () => UNITS);
      await serveOne({ dir, extract, log: () => undefined });
      expect(extract).not.toHaveBeenCalled();
      expect(answerOf(dir)).toEqual({ document_id: 17, ok: false, error: 'extract_failed' });
    },
  );

  it('a request that is not JSON, or has no integer id, is dropped with no answer', async () => {
    for (const bad of ['{nope', { document_id: 'x', file: 'doc-1.pdf' }, []]) {
      const dir = tempDir();
      put(dir, bad);
      const extract = vi.fn(async () => UNITS);
      expect(await serveOne({ dir, extract, log: () => undefined })).toBe(true);
      expect(extract).not.toHaveBeenCalled();
      expect(fs.existsSync(path.join(dir, EXCHANGE_FILES.answer))).toBe(false);
      expect(fs.existsSync(path.join(dir, EXCHANGE_FILES.request))).toBe(false);
    }
  });

  it('a named file that is not there is extract_failed', async () => {
    const dir = tempDir();
    put(dir, { document_id: 8, file: 'doc-8.pdf' });
    await serveOne({ dir, extract: async () => UNITS, log: () => undefined });
    expect(answerOf(dir)).toEqual({ document_id: 8, ok: false, error: 'extract_failed' });
  });

  it('logs ids and timings only', async () => {
    const dir = tempDir();
    put(dir, { document_id: 17, file: 'doc-17.pdf' }, { 'doc-17.pdf': '%PDF' });
    const lines: string[] = [];
    await serveOne({ dir, extract: async () => UNITS, log: (l) => lines.push(l), now: () => 0 });
    expect(lines).toEqual(['parser: document 17 answered ok in 0 ms (1 units)']);
  });
});

describe('runParserLoop', () => {
  it('serves one request at a time, polls between, and stops when told', async () => {
    const dir = tempDir();
    put(dir, { document_id: 1, file: 'doc-1.pdf' }, { 'doc-1.pdf': '%PDF' });
    let polls = 0;
    await runParserLoop({
      dir,
      extract: async () => UNITS,
      log: () => undefined,
      sleep: async () => {
        polls += 1;
      },
      shouldStop: () => polls >= 2,
    });
    expect(answerOf(dir).document_id).toBe(1);
    expect(polls).toBe(2);
  });

  it('survives a pass that throws, and logs its class only', async () => {
    let n = 0;
    const lines: string[] = [];
    await runParserLoop({
      dir: '/exchange',
      extract: async () => UNITS,
      log: (l) => lines.push(l),
      sleep: async () => {
        n += 1;
      },
      shouldStop: () => n >= 2,
      serve: async () => {
        throw new Error('SENTINEL-PATH /exchange/x');
      },
    });
    expect(n).toBe(2);
    expect(lines).toEqual(['parser: pass failed (Error)', 'parser: pass failed (Error)']);
  });
});

describe('makeExtractor', () => {
  it('calls extractUnits with the 300 s limit in its run argument and a child environment of what uv needs', async () => {
    const exec = vi.fn(() => JSON.stringify([{ file: 'x', status: 'extracted', units: UNITS }]));
    const extract = makeExtractor('/app/ingest', {
      exec,
      parentEnv: { PATH: '/bin', UV_CACHE_DIR: '/tmp/uv', ANON_JWT: 'SENTINEL', SUPABASE_URL: 'x' },
    });
    expect(await extract('/exchange/doc-1.pdf')).toEqual(UNITS);
    const call = exec.mock.calls[0] as unknown as [string, string[], { timeout: number; env: Record<string, string> }];
    expect(call[0]).toBe('uv');
    expect(call[1]).toContain('/exchange/doc-1.pdf');
    expect(call[2].timeout).toBe(300_000);
    expect(call[2].env).toEqual({ PATH: '/bin', UV_CACHE_DIR: '/tmp/uv' });
  });

  it('uvEnv keeps only the names uv needs', () => {
    expect(uvEnv({ PATH: 'a', HOME: 'b', TOKEN: 'c', UV_X: 'd', LANG: undefined })).toEqual({ PATH: 'a', HOME: 'b', UV_X: 'd' });
  });
});

describe('what the parser side may hold', () => {
  const SOURCES = ['parser-loop.ts', 'parser-main.ts', 'exchange.ts', 'alive-beat.ts', 'constants.ts'];
  const read = (n: string) => fs.readFileSync(path.join(__dirname, '..', 'src', n), 'utf8');

  it('names no secret, opens no connection and imports no database or HTTP module', () => {
    for (const name of SOURCES) {
      expect(read(name), name).not.toMatch(
        /\/run\/secrets|fetch\(|node:https?|node:net|node:tls|node:dgram|node:dns|from 'pg'|workspace\/src\/db|workspace\/src\/config/,
      );
    }
  });
});
