// Task 36 (brief 109, "Uploads and extraction", steps 1 to 8): one claimed document, start to end,
// with the database, the network, the clock, the embed call and the parser all standing in.

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { processDocument } from '../src/process-document.js';
import {
  claimFor,
  claimOf,
  fixture,
  harness,
  listDir,
  NOW_MS,
  parserAnswering,
  pdfBytes,
  sha256Of,
  zipBytes,
} from './helpers.js';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TWO_PAGES = [
  { unit_kind: 'page', unit_no: 1, text: 'Synthetic page one.' },
  { unit_kind: 'page', unit_no: 2, text: 'Synthetic page two.' },
];
const answersWith = (units: unknown[]) => parserAnswering((id) => ({ document_id: id, ok: true, units }));
const answersWithError = (error: string) => parserAnswering((id) => ({ document_id: id, ok: false, error }));

describe('a parsed file', () => {
  it('goes to the parser through the exchange folder, comes back as units, is embedded and finished', async () => {
    const body = pdfBytes();
    const h = harness({ body, parser: answersWith(TWO_PAGES) });
    const state = await processDocument(claimFor(body, 'application/pdf'), h.deps);
    expect(state).toBe('indexed');
    expect(h.rpc.puts).toEqual([{ documentId: 17, units: TWO_PAGES }]);
    expect(h.embed).toHaveBeenCalledWith(17, NOW_MS + 540_000);
    expect(h.rpc.finishes).toEqual([{ documentId: 17, outcome: 'indexed', code: null }]);
    expect(h.requests).toEqual([{ document_id: 17, file: 'doc-17.pdf' }]);
  });

  it('leaves the exchange folder empty, the alive file apart, after the document', async () => {
    const body = pdfBytes();
    const h = harness({ body, parser: answersWith(TWO_PAGES) });
    fs.writeFileSync(path.join(h.dir, 'alive'), '');
    await processDocument(claimFor(body, 'application/pdf'), h.deps);
    expect(listDir(h.dir)).toEqual(['alive']);
  });

  it('writes a docx under .docx, named by the document id and never by a title', async () => {
    const body = zipBytes();
    const h = harness({ body, parser: answersWith([{ unit_kind: 'doc', unit_no: 1, text: 'Synthetic.' }]) });
    await processDocument(claimFor(body, DOCX), h.deps);
    expect(h.requests).toEqual([{ document_id: 17, file: 'doc-17.docx' }]);
  });

  it.each([
    ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'doc-17.pptx'],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'doc-17.xlsx'],
  ])('writes %s as %s', async (mime, name) => {
    const body = zipBytes();
    const h = harness({ body, parser: answersWith(TWO_PAGES) });
    await processDocument(claimFor(body, mime), h.deps);
    expect(h.requests[0]?.file).toBe(name);
  });

  it('bad first bytes give bad_bytes and no hand-over', async () => {
    const body = Buffer.alloc(2000, 0x62);
    const h = harness({ body });
    expect(await processDocument(claimFor(body, 'application/pdf'), h.deps)).toBe('failed');
    expect(h.rpc.finishes).toEqual([{ documentId: 17, outcome: 'failed', code: 'bad_bytes' }]);
    expect(h.requests).toEqual([]);
    expect(h.rpc.puts).toEqual([]);
  });

  it('a file under 1,000 bytes is bad_bytes (bytesLookValid)', async () => {
    const body = pdfBytes(500);
    const h = harness({ body });
    await processDocument(claimFor(body, 'application/pdf'), h.deps);
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'bad_bytes' });
  });

  it('bytes that do not hash to the row sha256 give bad_bytes and no unit is put', async () => {
    const body = pdfBytes();
    const h = harness({ body, parser: answersWith(TWO_PAGES) });
    await processDocument(claimFor(body, 'application/pdf', { sha256: 'a'.repeat(64) }), h.deps);
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'bad_bytes' });
    expect(h.rpc.puts).toEqual([]);
    expect(h.requests).toEqual([]);
  });

  it('no answer inside 330 s is extract_timeout, a retry, and the folder is empty', async () => {
    const body = pdfBytes();
    const h = harness({ body });
    await processDocument(claimFor(body, 'application/pdf'), h.deps);
    expect(h.rpc.finishes).toEqual([{ documentId: 17, outcome: 'retry', code: 'extract_timeout' }]);
    expect(listDir(h.dir)).toEqual([]);
  });

  it('waits the whole 330 s and not much more', async () => {
    const body = pdfBytes();
    const h = harness({ body });
    const stamps: number[] = [];
    const realSleep = h.deps.sleep;
    await processDocument(claimFor(body, 'application/pdf'), {
      ...h.deps,
      sleep: async (ms) => {
        stamps.push(h.deps.now());
        await realSleep(ms);
      },
    });
    const waited = h.deps.now() - (stamps[0] ?? 0);
    expect(waited).toBeGreaterThanOrEqual(330_000);
    expect(waited).toBeLessThan(335_000);
  });

  it('an answer over 64 MB is extract_failed, is not read, and the folder is empty', async () => {
    const body = pdfBytes();
    const h = harness({
      body,
      parser: (dir) => {
        if (!fs.existsSync(path.join(dir, 'request.json'))) return;
        const file = path.join(dir, 'answer.json');
        fs.closeSync(fs.openSync(file, 'w'));
        fs.truncateSync(file, 64 * 1024 * 1024 + 1);
      },
    });
    await processDocument(claimFor(body, 'application/pdf'), h.deps);
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'retry', code: 'extract_failed' });
    expect(listDir(h.dir)).toEqual([]);
  });

  it('the parser saying extract_failed or extract_timeout is a retry of that code', async () => {
    const body = pdfBytes();
    for (const code of ['extract_failed', 'extract_timeout']) {
      const h = harness({ body, parser: answersWithError(code) });
      await processDocument(claimFor(body, 'application/pdf'), h.deps);
      expect(h.rpc.finishes[0]).toEqual({ documentId: 17, outcome: 'retry', code });
      expect(listDir(h.dir)).toEqual([]);
    }
  });

  it('an answer that is not the agreed shape is extract_failed', async () => {
    const body = pdfBytes();
    const h = harness({ body, parser: parserAnswering((id) => ({ document_id: id, ok: true, units: [{ unit_kind: 5 }] })) });
    await processDocument(claimFor(body, 'application/pdf'), h.deps);
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'retry', code: 'extract_failed' });
  });

  it('1,001 units give too_many_units and none is put', async () => {
    const body = pdfBytes();
    const units = Array.from({ length: 1001 }, (_, i) => ({ unit_kind: 'page', unit_no: i + 1, text: 'x' }));
    const h = harness({ body, parser: answersWith(units) });
    await processDocument(claimFor(body, 'application/pdf'), h.deps);
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'too_many_units' });
    expect(h.rpc.puts).toEqual([]);
  });

  it('1,000 units go in; more than 1.5 million characters do not', async () => {
    const body = pdfBytes();
    const ok = Array.from({ length: 1000 }, (_, i) => ({ unit_kind: 'page', unit_no: i + 1, text: 'x' }));
    const a = harness({ body, parser: answersWith(ok) });
    expect(await processDocument(claimFor(body, 'application/pdf'), a.deps)).toBe('indexed');

    const big = [{ unit_kind: 'doc', unit_no: 1, text: 'y'.repeat(1_500_001) }];
    const b = harness({ body, parser: answersWith(big) });
    await processDocument(claimFor(body, 'application/pdf'), b.deps);
    expect(b.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'too_many_units' });
  });

  it('a docx whose one unit is empty text gives no_text and no unit is put', async () => {
    const body = zipBytes();
    const h = harness({ body, parser: answersWith([{ unit_kind: 'doc', unit_no: 1, text: '' }]) });
    await processDocument(claimFor(body, DOCX), h.deps);
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'no_text' });
    expect(h.rpc.puts).toEqual([]);
  });

  it('a parsed file that gives no unit gives no_text', async () => {
    const body = pdfBytes();
    const h = harness({ body, parser: answersWith([]) });
    await processDocument(claimFor(body, 'application/pdf'), h.deps);
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'no_text' });
  });

  it('an empty unit among others is left out of the put', async () => {
    const body = pdfBytes();
    const units = [
      { unit_kind: 'page', unit_no: 1, text: 'Synthetic one.' },
      { unit_kind: 'page', unit_no: 2, text: ' \n\t ' },
      { unit_kind: 'page', unit_no: 3, text: 'Synthetic three.' },
    ];
    const h = harness({ body, parser: answersWith(units) });
    await processDocument(claimFor(body, 'application/pdf'), h.deps);
    expect(h.rpc.puts[0]?.units).toEqual([units[0], units[2]]);
  });
});

describe('a text file', () => {
  const textClaim = (bytes: Buffer, mime = 'text/plain') => claimFor(bytes, mime);

  it('a 12-byte plain text file gives one unit of kind doc, number 1, and no parser runs', async () => {
    const body = Buffer.from('hello, world');
    expect(body.length).toBe(12);
    const h = harness({ body });
    expect(await processDocument(textClaim(body), h.deps)).toBe('indexed');
    expect(h.rpc.puts).toEqual([{ documentId: 17, units: [{ unit_kind: 'doc', unit_no: 1, text: 'hello, world' }] }]);
    expect(h.requests).toEqual([]);
  });

  it('Markdown is read the same way', async () => {
    const body = Buffer.from('# Synthetic\n\nA line.');
    const h = harness({ body });
    await processDocument(textClaim(body, 'text/markdown'), h.deps);
    expect(h.rpc.puts[0]?.units).toEqual([{ unit_kind: 'doc', unit_no: 1, text: '# Synthetic\n\nA line.' }]);
  });

  it('a NUL byte gives bad_bytes', async () => {
    const body = Buffer.from('abc\u0000def');
    const h = harness({ body });
    await processDocument(textClaim(body), h.deps);
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'bad_bytes' });
    expect(h.rpc.puts).toEqual([]);
  });

  it('bytes that are not UTF-8 give bad_bytes', async () => {
    const body = Buffer.from([0xff, 0xfe, 0x41, 0x42]);
    const h = harness({ body });
    await processDocument(textClaim(body), h.deps);
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'bad_bytes' });
  });

  it('white space alone gives no_text', async () => {
    const body = Buffer.from('   \n\t  ');
    const h = harness({ body });
    await processDocument(textClaim(body), h.deps);
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'no_text' });
  });
});

describe('the link', () => {
  const body = pdfBytes();
  const key = `u/${sha256Of(body)}`;
  const good = `https://goultdzqcavefcgnifdy.supabase.co/storage/v1/object/sign/workspace-uploads/${key}?token=t`;

  const refused = async (signedUrl: string | null) => {
    const h = harness({ body });
    await processDocument(claimFor(body, 'application/pdf', { signed_url: signedUrl }), h.deps);
    expect(h.fetch).not.toHaveBeenCalled();
    return h;
  };

  it('the unedited good link reaches the download', async () => {
    const h = harness({ body });
    await processDocument(claimFor(body, 'application/pdf', { signed_url: good }), h.deps);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.fetch.mock.calls[0]?.[0]).toBe(good);
  });

  it('another host is refused before any request', async () => {
    const h = await refused(good.replace('goultdzqcavefcgnifdy', 'evil'));
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'download_failed' });
  });

  it.each([
    ['http, not https', (u: string) => u.replace('https:', 'http:')],
    ['a link that does not end in the row key', (u: string) => u.replace(/u\/[0-9a-f]{64}/, `u/${'b'.repeat(64)}`)],
    ['a key with a suffix', (u: string) => u.replace('?token', 'x?token')],
    ['another bucket', (u: string) => u.replace('workspace-uploads', 'bb-files')],
    ['a public path', (u: string) => u.replace('/sign/', '/public/')],
    ['credentials in the link', (u: string) => u.replace('https://', 'https://user:pw@')],
    ['a port', (u: string) => u.replace('.co/', '.co:8443/')],
    ['a host that only starts with the project host', (u: string) => u.replace('.supabase.co', '.supabase.co.evil.example')],
    ['a fragment', (u: string) => `${u}#frag`],
  ])('%s is refused before any request', async (_name, edit) => {
    const h = await refused(edit(good));
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'download_failed' });
  });

  it('a missing link is link_expired', async () => {
    const h = await refused(null);
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'link_expired' });
  });

  it('an expired link is link_expired and no request is made', async () => {
    const h = harness({ body });
    const expired = new Date(NOW_MS - 1000).toISOString();
    await processDocument(claimFor(body, 'application/pdf', { signed_url_expires_at: expired }), h.deps);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'link_expired' });
  });

  it('a redirect is not followed', async () => {
    const h = harness({
      body,
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } }),
    });
    await processDocument(claimFor(body, 'application/pdf'), h.deps);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.fetch.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'retry', code: 'download_failed' });
  });

  it('a non-200 answer or a network error is a retry of download_failed, with no message logged', async () => {
    for (const impl of [
      async () => new Response('no', { status: 403 }),
      async () => {
        throw new Error('SENTINEL-NETWORK');
      },
    ]) {
      const h = harness({ body, fetchImpl: impl });
      await processDocument(claimFor(body, 'application/pdf'), h.deps);
      expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'retry', code: 'download_failed' });
      expect(h.logs.join('\n')).not.toContain('SENTINEL-NETWORK');
    }
  });

  it('a download past the size limit stops reading and is too_large', async () => {
    const huge = new Response(
      new ReadableStream({
        start(controller) {
          for (let i = 0; i < 25; i += 1) controller.enqueue(new Uint8Array(1024 * 1024));
          controller.close();
        },
      }),
      { status: 200 },
    );
    const h = harness({ fetchImpl: async () => huge });
    await processDocument(claimOf({ mime: 'application/pdf' }), h.deps);
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'too_large' });
  });
});

describe('the claim itself', () => {
  it('a type outside the six is bad_type, with no request', async () => {
    const h = harness();
    await processDocument(claimOf({ mime: 'image/png' }), h.deps);
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'bad_type' });
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('a declared size over 20 MiB is too_large, with no request', async () => {
    const h = harness();
    await processDocument(claimOf({ byte_size: 20_971_521 }), h.deps);
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'failed', code: 'too_large' });
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('a claimed memory document starts at the embed call and no download is tried', async () => {
    const h = harness();
    const claim = claimOf({
      kind: 'memory',
      step: 'embed',
      mime: null,
      byte_size: null,
      sha256: null,
      signed_url: null,
      signed_url_expires_at: null,
    });
    expect(await processDocument(claim, h.deps)).toBe('indexed');
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.embed).toHaveBeenCalledWith(17, NOW_MS + 540_000);
    expect(h.rpc.puts).toEqual([]);
    expect(h.rpc.finishes).toEqual([{ documentId: 17, outcome: 'indexed', code: null }]);
  });

  it('an upload whose units are already put (step embed) starts at the embed call too', async () => {
    const h = harness();
    await processDocument(claimOf({ step: 'embed' }), h.deps);
    expect(h.fetch).not.toHaveBeenCalled();
    expect(h.embed).toHaveBeenCalledTimes(1);
  });
});

describe('the embed and the end', () => {
  const body = Buffer.from('Synthetic text file.');

  it('an embed that exits 1 is a retry of embed_failed', async () => {
    const h = harness({ body, embedExit: 1 });
    await processDocument(claimFor(body, 'text/plain'), h.deps);
    expect(h.rpc.finishes).toEqual([{ documentId: 17, outcome: 'retry', code: 'embed_failed' }]);
  });

  it('an embed that stops with progress made is a retry too, and the stop is logged by name', async () => {
    const h = harness({ body });
    (h.embed as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce({ exitCode: 1, stop: 'timed_out', progressed: true });
    await processDocument(claimFor(body, 'text/plain'), h.deps);
    expect(h.rpc.finishes).toEqual([{ documentId: 17, outcome: 'retry', code: 'embed_failed' }]);
    expect(h.logs.some((l) => l.includes('embed stopped (timed_out, progress made)'))).toBe(true);
  });

  it('a finish that refuses indexed becomes a retry of embed_failed', async () => {
    const h = harness({
      body,
      rpc: {
        finish: async (documentId, outcome, code) => {
          if (outcome === 'indexed') throw Object.assign(new Error('SENTINEL-REFUSAL'), { code: '22023' });
          h.rpc.finishes.push({ documentId, outcome, code });
          return 'retry';
        },
      },
    });
    await processDocument(claimFor(body, 'text/plain'), h.deps);
    expect(h.rpc.finishes).toEqual([{ documentId: 17, outcome: 'retry', code: 'embed_failed' }]);
    expect(h.logs.join('\n')).not.toContain('SENTINEL-REFUSAL');
  });

  it('a put that throws is a retry, not a crash', async () => {
    const h = harness({
      body,
      rpc: {
        putText: async () => {
          throw new Error('SENTINEL-PUT');
        },
      },
    });
    await processDocument(claimFor(body, 'text/plain'), h.deps);
    expect(h.rpc.finishes[0]).toMatchObject({ outcome: 'retry', code: 'extract_failed' });
    expect(h.logs.join('\n')).not.toContain('SENTINEL-PUT');
  });

  it('three failed tries give failed', async () => {
    const h = harness({ body, embedExit: 1 });
    const states: string[] = [];
    for (let i = 0; i < 3; i += 1) states.push(await processDocument(claimFor(body, 'text/plain', { attempts: i }), h.deps));
    expect(states).toEqual(['retry', 'retry', 'failed']);
  });

  it('a log line holds ids, states and timings only: never the text, a name or an error message', async () => {
    const bytes = Buffer.from('SENTINEL-TEXT secret words');
    const h = harness({ body: bytes, embedExit: 1 });
    await processDocument(claimFor(bytes, 'text/plain'), h.deps);
    const pdf = pdfBytes();
    const parsed = harness({ body: pdf, parser: answersWith([{ unit_kind: 'page', unit_no: 1, text: 'SENTINEL-UNIT-TEXT' }]) });
    await processDocument(claimFor(pdf, 'application/pdf'), parsed.deps);
    const all = [...h.logs, ...parsed.logs];
    expect(all.length).toBeGreaterThan(0);
    for (const line of all) {
      expect(line).not.toContain('SENTINEL');
      expect(line).toMatch(/^ingest: document \d+ /);
    }
  });

  it("carries the claim's document id, as the frozen fixture names it", async () => {
    const id = fixture('ingest-claim.json').returns.document_id;
    const h = harness({ body });
    await processDocument(claimFor(body, 'text/plain', { document_id: id }), h.deps);
    expect(h.rpc.finishes[0]?.documentId).toBe(id);
  });
});
