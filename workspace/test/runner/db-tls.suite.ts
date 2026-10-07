/**
 * The runner's database connection verifies the pooler's certificate against the pinned CA whatever
 * the DSN says (ruling V1, SR-1): the client is built from the DSN's parsed parts, never from the
 * string, and the handshake is tried against a pooler on the loopback interface whose certificates
 * are made for this run (test/helpers/throwaway-ca.ts). Part of runner.test.ts.
 */

import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { APPLICATION_NAME, PG_CLIENT_OPTIONS, createPgQuery, dsnParts, newPgClient, type PgClientLike } from '../../src/db.js';
import { startFakePooler, type FakePooler } from '../helpers/fake-pooler.js';
import { makeThrowawayCa, type ThrowawayCa } from '../helpers/throwaway-ca.js';

// Made-up values in the shapes the real ones have; none is a credential.
const USER = 'workspace_runner.projectref';
const PASSWORD = 'not-a-password';
const HOST = 'aws-0-us-east-1.pooler.supabase.com';
const STORED_FLAGS = '?uselibpqcompat=true&sslmode=require';
const dsnFor = (host: string, port: number | null, query: string): string =>
  `postgresql://${USER}:${PASSWORD}@${host}${port === null ? '' : `:${port}`}/postgres${query}`;
const DSN = dsnFor(HOST, 5432, STORED_FLAGS);
/** Stands in for a CA where no handshake is made: the client only carries it. */
const CA_TEXT = '-----BEGIN CERTIFICATE-----\nnot-a-real-certificate\n-----END CERTIFICATE-----\n';

/** Every way a DSN could ask for a connection that is not verified, or not encrypted. */
const UNVERIFIED_FORMS = [
  ['the stored form', STORED_FLAGS],
  ['sslmode=no-verify', '?sslmode=no-verify'],
  ['sslmode=disable', '?sslmode=disable'],
  ['ssl=false', '?ssl=false'],
  ['another root certificate named in the DSN', '?sslmode=verify-full&sslrootcert=/tmp/another-ca.crt'],
  ['no flag at all', ''],
] as const;

type BuiltClient = PgClientLike & {
  connectionParameters: { host: string; port: number; user: string; password: string; database: string; ssl: unknown; application_name: string };
};
const build = (dsn: string, ca: string): BuiltClient => newPgClient(dsn, ca) as BuiltClient;

/**
 * Where the driver (pg 8.23.0, pinned in package.json) keeps the three bounds on a client it built,
 * each the field it acts on: `connect()` arms its timer from `_connectionTimeoutMillis`, `query()`
 * its read timer from `connectionParameters.query_timeout`, and the connection switches TCP
 * keep-alive on from `connection._keepAlive`. Left out of the options they read 0, false and false.
 */
type BoundClient = BuiltClient & {
  _connectionTimeoutMillis: number;
  connectionParameters: { query_timeout: number | false };
  connection: { _keepAlive: boolean };
};

const boundsOf = (client: BoundClient): { connectionTimeoutMillis: number; query_timeout: number | false; keepAlive: boolean } => ({
  connectionTimeoutMillis: client._connectionTimeoutMillis,
  query_timeout: client.connectionParameters.query_timeout,
  keepAlive: client.connection._keepAlive,
});

describe('the client is built from the parsed parts of the DSN', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the host, the port, the user, the password and the database, and nothing else', () => {
    expect(dsnParts(DSN)).toEqual({ host: HOST, port: 5432, user: USER, password: PASSWORD, database: 'postgres' });
  });

  it('decodes a user and a password that are percent-encoded', () => {
    const parts = dsnParts('postgresql://workspace%5Frunner.ref:p%40ss%2Fw%3Ard@db.example:5432/post%67res?sslmode=require');
    expect(parts).toMatchObject({ user: 'workspace_runner.ref', password: 'p@ss/w:rd', database: 'postgres' });
  });

  it('reads port 5432 when the DSN names none', () => {
    expect(dsnParts(dsnFor(HOST, null, STORED_FLAGS)).port).toBe(5432);
  });

  it.each([
    ['no host', `postgresql://${USER}:${PASSWORD}@/postgres`],
    ['no user', `postgresql://:${PASSWORD}@${HOST}:5432/postgres`],
    ['no password', `postgresql://${USER}@${HOST}:5432/postgres`],
    ['no database', `postgresql://${USER}:${PASSWORD}@${HOST}:5432/`],
    ['text that is not a URL', `${USER}:${PASSWORD} at ${HOST}`],
  ])('refuses a DSN with %s, so no part is ever filled in from somewhere else', (_what, dsn) => {
    expect(() => dsnParts(dsn)).toThrow(/DSN/);
    try {
      dsnParts(dsn);
    } catch (error) {
      expect((error as Error).message).not.toContain(PASSWORD);
      expect((error as Error).message).not.toContain(HOST);
    }
  });

  it.each(UNVERIFIED_FORMS)('builds a client that verifies against the given CA and the host name: %s', (_what, query) => {
    const client = build(dsnFor(HOST, 5432, query), CA_TEXT);
    expect(client.connectionParameters.ssl).toEqual({ ca: CA_TEXT, rejectUnauthorized: true, servername: HOST });
    expect(client.connectionParameters).toMatchObject({ host: HOST, port: 5432, user: USER, password: PASSWORD, database: 'postgres' });
  });

  // Ruling X1: read from the client `newPgClient` built, never from the constant it was built with,
  // so a `newPgClient` that drops one of the three fails here.
  it('carries the three bounds on the client as built: the time a connect gets, the time a query gets, the keep-alive', () => {
    const bounds = boundsOf(build(DSN, CA_TEXT) as BoundClient);
    expect(bounds).toEqual({
      connectionTimeoutMillis: PG_CLIENT_OPTIONS.connectionTimeoutMillis,
      query_timeout: PG_CLIENT_OPTIONS.query_timeout,
      keepAlive: PG_CLIENT_OPTIONS.keepAlive,
    });
    // Each is switched on: the driver reads 0, false and false as no bound at all.
    expect(bounds.connectionTimeoutMillis).toBeGreaterThan(0);
    expect(bounds.query_timeout).toBeGreaterThan(0);
    expect(bounds.keepAlive).toBe(true);
  });

  it('keeps its name on the client as built', () => {
    expect(build(DSN, CA_TEXT).connectionParameters.application_name).toBe(APPLICATION_NAME);
  });

  it('takes nothing from the PG* environment: not the host, the user, the password, the database, the port or the ssl mode', () => {
    vi.stubEnv('PGHOST', 'elsewhere.example');
    vi.stubEnv('PGPORT', '6543');
    vi.stubEnv('PGUSER', 'postgres');
    vi.stubEnv('PGPASSWORD', 'another-password');
    vi.stubEnv('PGDATABASE', 'template1');
    vi.stubEnv('PGSSLMODE', 'disable');
    vi.stubEnv('PGSSLROOTCERT', '/tmp/another-ca.crt');
    const client = build(DSN, CA_TEXT);
    expect(client.connectionParameters).toMatchObject({ host: HOST, port: 5432, user: USER, password: PASSWORD, database: 'postgres' });
    expect(client.connectionParameters.ssl).toEqual({ ca: CA_TEXT, rejectUnauthorized: true, servername: HOST });
  });

  // Why the string is never handed over: this is what the driver itself makes of the stored DSN.
  it.each([
    ['the stored form', STORED_FLAGS],
    ['sslmode=no-verify', '?sslmode=no-verify'],
  ])('the driver, given the DSN as a string, would switch verification off: %s', (_what, query) => {
    const fromString = new pg.Client({ connectionString: dsnFor(HOST, 5432, query) }) as unknown as BuiltClient;
    expect(fromString.connectionParameters.ssl).toEqual({ rejectUnauthorized: false });
  });

  it('hands the DSN and the CA to the client it opens, on every connect', async () => {
    const seen: Array<[string, string]> = [];
    const newClient = (dsn: string, ca: string): PgClientLike => {
      seen.push([dsn, ca]);
      return {
        connect: async () => undefined,
        query: async (sql: string) => {
          if (sql.includes('current_user')) return { rows: [{ role: 'workspace_runner' }] };
          throw new Error('read ECONNRESET');
        },
        end: async () => undefined,
        on: () => undefined,
      };
    };
    const query = createPgQuery({ dsn: DSN, ca: CA_TEXT, log: () => undefined, newClient });
    await expect(query('select 1')).rejects.toThrow(/ECONNRESET/);
    await expect(query('select 1')).rejects.toThrow(/ECONNRESET/);
    expect(seen).toEqual([
      [DSN, CA_TEXT],
      [DSN, CA_TEXT],
    ]);
  });
});

describe('the handshake with a pooler, on the loopback interface', () => {
  const POOLER_HOST = 'localhost';
  const CERTIFICATE_REFUSED = /^(SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_VERIFY_LEAF_SIGNATURE|UNABLE_TO_GET_ISSUER_CERT(_LOCALLY)?|DEPTH_ZERO_SELF_SIGNED_CERT)$/;

  let pinned: ThrowawayCa;
  let another: ThrowawayCa;
  /** Signed by the pinned CA, for the host name the client dials. */
  let trusted: FakePooler;
  /** Signed by another CA, for the same host name: what someone standing in for the pooler could show. */
  let impostor: FakePooler;
  /** Signed by the pinned CA, for another host name. */
  let misnamed: FakePooler;

  beforeAll(async () => {
    pinned = makeThrowawayCa('w64 test CA, pinned');
    another = makeThrowawayCa('w64 test CA, another');
    trusted = await startFakePooler({ ...pinned.issueFor(POOLER_HOST), chain: [pinned.certPem] });
    impostor = await startFakePooler({ ...another.issueFor(POOLER_HOST), chain: [another.certPem] });
    misnamed = await startFakePooler({ ...pinned.issueFor('another-pooler.invalid'), chain: [pinned.certPem] });
  });

  afterAll(async () => {
    await Promise.all([trusted, impostor, misnamed].map((pooler) => pooler?.close()));
  });

  /** Connect, then close whatever was opened; the error a refused connect gave, or null. */
  async function connectOnce(pooler: FakePooler, query: string, ca: string): Promise<(Error & { code?: string }) | null> {
    const client = build(dsnFor(POOLER_HOST, pooler.port, query), ca);
    client.on('error', () => undefined);
    try {
      await client.connect();
      return null;
    } catch (error) {
      return error as Error & { code?: string };
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  it('connects to a pooler whose certificate the pinned CA signed, as the user and database of the DSN', async () => {
    const before = trusted.startups.length;
    expect(await connectOnce(trusted, STORED_FLAGS, pinned.certPem)).toBeNull();
    expect(trusted.startups).toHaveLength(before + 1);
    expect(trusted.startups[before]).toMatchObject({ user: USER, database: 'postgres', application_name: APPLICATION_NAME });
  });

  it.each(UNVERIFIED_FORMS)('refuses a pooler whose certificate another CA signed, whatever the DSN says: %s', async (_what, query) => {
    const before = impostor.startups.length;
    const refused = await connectOnce(impostor, query, pinned.certPem);
    expect(refused).not.toBeNull();
    expect(refused?.code).toMatch(CERTIFICATE_REFUSED);
    // The connection ended in the handshake: the client never introduced itself.
    expect(impostor.startups).toHaveLength(before);
  });

  it('refuses the same pooler when only the other CA is pinned: the pin, not the system store, decides', async () => {
    expect((await connectOnce(trusted, STORED_FLAGS, another.certPem))?.code).toMatch(CERTIFICATE_REFUSED);
    expect(await connectOnce(impostor, STORED_FLAGS, another.certPem)).toBeNull();
  });

  it("refuses the impostor even with node's own switch set: NODE_TLS_REJECT_UNAUTHORIZED=0 does not reach this connection", async () => {
    vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED', '0');
    try {
      const before = impostor.startups.length;
      expect((await connectOnce(impostor, STORED_FLAGS, pinned.certPem))?.code).toMatch(CERTIFICATE_REFUSED);
      expect(impostor.startups).toHaveLength(before);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('refuses a certificate the pinned CA signed for another host name', async () => {
    const before = misnamed.startups.length;
    const refused = await connectOnce(misnamed, STORED_FLAGS, pinned.certPem);
    expect(refused?.code).toBe('ERR_TLS_CERT_ALTNAME_INVALID');
    expect(misnamed.startups).toHaveLength(before);
  });

  it('fails the call, with nothing of the DSN in the message, when the runner meets the impostor', async () => {
    const logs: string[] = [];
    const dsn = dsnFor(POOLER_HOST, impostor.port, STORED_FLAGS);
    const query = createPgQuery({ dsn, ca: pinned.certPem, log: (line) => logs.push(line), newClient: newPgClient });
    const error = await query('select public.workspace_heartbeat($1)', ['workspace@test']).catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(PASSWORD);
    expect(logs.some((line) => /connected as/.test(line))).toBe(false);
    await query.end();
  });
});
