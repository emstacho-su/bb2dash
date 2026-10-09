import { describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../src/config.js';
import { runWorkerLoop } from '../src/worker-loop.js';
import { claimOf, fakeRpc, RUNNER } from './helpers.js';

describe('the worker loop', () => {
  it('claims, processes and claims again at once; sleeps only when nothing was handed out', async () => {
    const claims = [claimOf({ document_id: 1 }), claimOf({ document_id: 2 }), null];
    const rpc = fakeRpc({ claim: vi.fn(async () => claims.shift() ?? null) });
    const processed: number[] = [];
    const sleeps: number[] = [];
    let n = 0;
    await runWorkerLoop({
      rpc,
      process: async (c) => {
        processed.push(c.document_id);
        return 'indexed';
      },
      sleep: async (ms) => {
        sleeps.push(ms);
        n += 1;
      },
      shouldStop: () => n >= 1,
      log: () => undefined,
    });
    expect(processed).toEqual([1, 2]);
    expect(sleeps).toEqual([5000]);
  });

  it('a claim that throws is logged by class and the loop goes on', async () => {
    const lines: string[] = [];
    let n = 0;
    await runWorkerLoop({
      rpc: fakeRpc({
        claim: async () => {
          throw Object.assign(new Error(`SENTINEL-DSN ${RUNNER}`), { code: '08006' });
        },
      }),
      process: async () => 'indexed',
      sleep: async () => {
        n += 1;
      },
      shouldStop: () => n >= 2,
      log: (l) => lines.push(l),
    });
    expect(n).toBe(2);
    expect(lines.join('\n')).not.toContain('SENTINEL');
    expect(lines.join('\n')).toContain('08006');
  });

  it('a process that throws is logged by class, never stops the loop', async () => {
    const lines: string[] = [];
    let n = 0;
    const claims = [claimOf(), null];
    await runWorkerLoop({
      rpc: fakeRpc({ claim: async () => claims.shift() ?? null }),
      process: async () => {
        throw new Error('SENTINEL-BOOM');
      },
      sleep: async () => {
        n += 1;
      },
      shouldStop: () => n >= 1,
      log: (l) => lines.push(l),
    });
    expect(lines.join('\n')).not.toContain('SENTINEL');
    expect(lines.some((l) => l.includes('document 17'))).toBe(true);
  });
});

describe('the configuration', () => {
  const dsn = 'postgresql://workspace_ingest_runner.goultdzqcavefcgnifdy:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full';
  const files: Record<string, string> = {
    '/run/secrets/workspace_ingest_db_url': `${dsn}\n`,
    '/run/secrets/supabase_anon_jwt': 'eyJ.synthetic.anon\n',
    '/app/certs/prod-ca.crt': '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n',
  };
  const read = (f: string): string | null => files[f] ?? null;

  it('reads the two secrets and the pinned CA', () => {
    const c = loadConfig({ env: {}, readFile: read });
    expect(c.dbUrl).toBe(dsn);
    expect(c.anonJwt).toBe('eyJ.synthetic.anon');
    expect(c.dbCa).toContain('BEGIN CERTIFICATE');
  });

  it('refuses a DSN for another role, the transaction pooler, or a missing sslmode', () => {
    const bad = (value: string) => () => loadConfig({ env: {}, readFile: (f) => (f.endsWith('workspace_ingest_db_url') ? value : read(f)) });
    expect(bad(dsn.replace('workspace_ingest_runner', 'workspace_runner'))).toThrow(/workspace_ingest_runner/);
    expect(bad(dsn.replace(':5432', ':6543'))).toThrow(/6543/);
    expect(bad(dsn.replace('?sslmode=verify-full', ''))).toThrow(/sslmode/);
    expect(bad('')).toThrow(/missing or empty/);
  });

  it('refuses a publishable key where the legacy anon JWT is needed, and a missing key', () => {
    const withJwt = (value: string) => () => loadConfig({ env: {}, readFile: (f) => (f.endsWith('supabase_anon_jwt') ? value : read(f)) });
    expect(withJwt('sb_publishable_abc')).toThrow(/publishable/);
    expect(withJwt('')).toThrow(/missing or empty/);
  });

  it('never prints a secret in an error', () => {
    try {
      loadConfig({ env: {}, readFile: (f) => (f.endsWith('workspace_ingest_db_url') ? dsn.replace('pw@', 'SENTINEL@').replace('workspace_ingest_runner', 'other') : read(f)) });
    } catch (e) {
      expect(String((e as Error).message)).not.toContain('SENTINEL');
    }
  });
});
