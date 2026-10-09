// The exchange folder: the one place the worker and the parser meet (freeze amendment F-3).

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { clearExchange, EXCHANGE_FILES, handOver } from '../src/exchange.js';
import { fakeClock, listDir, parserAnswering, tempDir } from './helpers.js';

const UNITS = [{ unit_kind: 'page', unit_no: 1, text: 'Synthetic.' }];
const DOC = { documentId: 5, extension: 'pdf', bytes: Buffer.from('x') };

function deps(dir: string, onSleep: (d: string) => void) {
  const t = fakeClock(onSleep, dir);
  return { dir, now: t.now, sleep: t.sleep, pollMs: 500, timeoutMs: 330_000 };
}

describe('handOver', () => {
  it('writes the file and then the request, waits, reads the units and clears the folder', async () => {
    const dir = tempDir();
    const seen: string[][] = [];
    const answer = parserAnswering((id) => ({ document_id: id, ok: true, units: UNITS }));
    const r = await handOver(
      dir,
      { documentId: 5, extension: 'pdf', bytes: Buffer.from('%PDF-synthetic') },
      deps(dir, (d) => {
        seen.push(listDir(d));
        answer(d);
      }),
    );
    expect(r).toEqual({ ok: true, units: UNITS });
    expect(seen[0]).toEqual(['doc-5.pdf', 'request.json']);
    expect(listDir(dir)).toEqual([]);
  });

  it('keeps only the alive file when it clears', () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, EXCHANGE_FILES.alive), '');
    fs.writeFileSync(path.join(dir, 'doc-9.pdf'), 'x');
    fs.writeFileSync(path.join(dir, 'answer.json.tmp'), 'x');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'f'), 'x');
    clearExchange(dir);
    expect(listDir(dir)).toEqual(['alive']);
  });

  it('ignores an answer left by an earlier document and clears it', async () => {
    const dir = tempDir();
    fs.writeFileSync(path.join(dir, EXCHANGE_FILES.answer), JSON.stringify({ document_id: 4, ok: true, units: UNITS }));
    const r = await handOver(dir, DOC, deps(dir, () => undefined));
    expect(r).toEqual({ ok: false, code: 'extract_timeout' });
  });

  it('an answer for another document does not satisfy the wait', async () => {
    const dir = tempDir();
    const wrong = parserAnswering(() => ({ document_id: 99, ok: true, units: UNITS }));
    const r = await handOver(dir, DOC, deps(dir, wrong));
    expect(r).toEqual({ ok: false, code: 'extract_timeout' });
    expect(listDir(dir)).toEqual([]);
  });

  it('an answer.json that is not JSON is extract_failed', async () => {
    const dir = tempDir();
    const r = await handOver(
      dir,
      DOC,
      deps(dir, (d) => {
        if (fs.existsSync(path.join(d, 'request.json'))) fs.writeFileSync(path.join(d, 'answer.json'), '{not json');
      }),
    );
    expect(r).toEqual({ ok: false, code: 'extract_failed' });
  });

  it('throws when the folder cannot be written', async () => {
    const dir = path.join(tempDir(), 'missing');
    await expect(handOver(dir, DOC, deps(dir, () => undefined))).rejects.toThrow();
  });
});
