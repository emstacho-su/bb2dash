// Shared fakes for the suite: everything external is injected, so no test needs a network, a database
// or a parser binary. All bytes and text here are synthetic.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { vi } from 'vitest';

import type { IngestClaim, IngestRpc } from '../src/db.js';
import type { ProcessDeps } from '../src/process-document.js';

const FIXTURES = path.join(__dirname, '..', '..', 'workspace', 'test', 'fixtures', 'contract24');

export function fixture<T = any>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8')) as T;
}

export const FAKE_POLL_MS = 30_000;
export const NOW_MS = Date.parse('2026-10-10T12:00:00Z');
export const PROJECT_URL = 'https://goultdzqcavefcgnifdy.supabase.co';
export const RUNNER = 'workspace-ingest@a1b2c3d4e5f6';

/** A claim built from the frozen fixture, with overrides; the link follows the sha256 unless set. */
export function claimOf(over: Partial<IngestClaim> = {}): IngestClaim {
  const base = fixture('ingest-claim.json').returns as IngestClaim;
  const sha256 = over.sha256 ?? base.sha256;
  const merged = { ...base, ...over, sha256 };
  if (over.signed_url === undefined && over.sha256 !== undefined && merged.signed_url !== null) {
    merged.signed_url = `${PROJECT_URL}/storage/v1/object/sign/workspace-uploads/u/${sha256}?token=synthetic-token`;
  }
  return merged;
}

export function zipBytes(size = 2000): Buffer {
  const b = Buffer.alloc(size, 0x61);
  b[0] = 0x50;
  b[1] = 0x4b;
  return b;
}

export function pdfBytes(size = 2000): Buffer {
  const b = Buffer.alloc(size, 0x61);
  b.write('%PDF', 0, 'latin1');
  return b;
}

/** A claim whose sha256 and link match these bytes. */
export function claimFor(bytes: Buffer, mime: string, over: Partial<IngestClaim> = {}): IngestClaim {
  const sha256 = sha256Of(bytes);
  return claimOf({ mime, byte_size: bytes.length, sha256, ...over });
}

export const sha256Of = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

export function okResponse(bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), { status: 200 });
}

export function tempDir(prefix = 'ingest-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function listDir(dir: string): string[] {
  return fs.readdirSync(dir).sort();
}

export interface FakeRpc extends IngestRpc {
  puts: { documentId: number; units: unknown[] }[];
  finishes: { documentId: number; outcome: string; code: string | null }[];
}

/** A database that counts tries the way workspace_ingest_finish does: the third retry ends failed. */
export function fakeRpc(over: Partial<IngestRpc> = {}): FakeRpc {
  const state = { attempts: 0 };
  const rpc: FakeRpc = {
    puts: [],
    finishes: [],
    claim: vi.fn(async () => null),
    putText: vi.fn(async (documentId, units) => {
      rpc.puts.push({ documentId, units: [...units] });
      return units.length;
    }),
    finish: vi.fn(async (documentId, outcome, code) => {
      rpc.finishes.push({ documentId, outcome, code });
      if (outcome === 'indexed') return 'indexed';
      if (outcome === 'failed') return 'failed';
      state.attempts += 1;
      return state.attempts >= 3 ? 'failed' : 'retry';
    }),
    heartbeat: vi.fn(async () => undefined),
    ...over,
  };
  return rpc;
}

/**
 * A fake clock and a sleep that moves it. `onSleep` plays the parser: it may look at the exchange
 * folder and answer.
 */
export function fakeClock(onSleep: (dir: string) => void = () => undefined, dir = '') {
  const clock = { ms: NOW_MS };
  return {
    clock,
    now: () => clock.ms,
    sleep: async (ms: number) => {
      clock.ms += ms;
      onSleep(dir);
    },
  };
}

/** A parser stand-in: when it sees a request, it writes this answer for it. */
export function parserAnswering(answer: (documentId: number) => unknown) {
  return (dir: string): void => {
    const requestFile = path.join(dir, 'request.json');
    if (!fs.existsSync(requestFile)) return;
    const request = JSON.parse(fs.readFileSync(requestFile, 'utf8')) as { document_id: number };
    fs.writeFileSync(path.join(dir, 'answer.json'), JSON.stringify(answer(request.document_id)));
  };
}

export interface Harness {
  deps: ProcessDeps;
  rpc: FakeRpc;
  dir: string;
  logs: string[];
  fetch: ReturnType<typeof vi.fn>;
  embed: ReturnType<typeof vi.fn>;
  requests: { file: string; document_id: number }[];
}

export function harness(opts: {
  body?: Buffer;
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
  parser?: (dir: string) => void;
  embedExit?: number;
  rpc?: Partial<IngestRpc>;
} = {}): Harness {
  const dir = tempDir();
  const requests: { file: string; document_id: number }[] = [];
  const parser = opts.parser ?? (() => undefined);
  const watching = (d: string): void => {
    const requestFile = path.join(d, 'request.json');
    if (fs.existsSync(requestFile)) requests.push(JSON.parse(fs.readFileSync(requestFile, 'utf8')));
    parser(d);
  };
  const time = fakeClock(watching, dir);
  const rpc = fakeRpc(opts.rpc);
  const logs: string[] = [];
  const fetchFn = vi.fn(opts.fetchImpl ?? (async () => okResponse(opts.body ?? Buffer.alloc(0))));
  const embed = vi.fn(async (_documentId: number) => ({ exitCode: opts.embedExit ?? 0 }));
  const deps: ProcessDeps = {
    rpc,
    fetch: fetchFn as unknown as typeof fetch,
    embed,
    exchangeDir: dir,
    now: time.now,
    sleep: time.sleep,
    // A coarse tick: a 330 s wait is 11 ticks on the fake clock, not 660 rounds of real file work.
    exchangePollMs: FAKE_POLL_MS,
    log: (line) => logs.push(line),
  };
  return { deps, rpc, dir, logs, fetch: fetchFn, embed, requests };
}
