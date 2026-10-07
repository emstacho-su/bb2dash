/** The runner's database side: five calls, and one connection that reconnects. Part of runner.test.ts. */

import { describe, expect, it } from 'vitest';

import { HEARTBEAT_MS } from '../../src/config.js';
import {
  APPLICATION_NAME,
  PG_CLIENT_OPTIONS,
  createPgQuery,
  createRpc,
  isStatementError,
  newPgClient,
  redactDsn,
  type PgClientLike,
  type QueryResult,
} from '../../src/db.js';
import { CONVERSATION_ID, STORED_SESSION_ID } from '../helpers/fakes.js';

// A made-up DSN in the real one's shape; not a credential.
const DSN = 'postgresql://workspace_runner.projectref:not-a-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require';
// Stands in for the pinned CA where no handshake is made; db-tls.suite.ts makes real ones.
const CA = '-----BEGIN CERTIFICATE-----\nnot-a-real-certificate\n-----END CERTIFICATE-----\n';

interface Sent {
  sql: string;
  params: readonly unknown[] | undefined;
}

function fakeQuery(rows: Record<string, unknown>[] = []) {
  const sent: Sent[] = [];
  const query = async (sql: string, params?: readonly unknown[]): Promise<QueryResult> => {
    sent.push({ sql, params });
    return { rows };
  };
  return { query, sent };
}

const CLAIM_ROW = {
  request_id: '41',
  conversation_id: CONVERSATION_ID,
  user_message_id: '7a7a7a7a-0000-4000-8000-000000000001',
  prompt: 'What is due on Friday?',
  claude_session_id: STORED_SESSION_ID,
  prior_tier: 'mid',
  history: [
    { role: 'user', content: 'first' },
    { role: 'assistant', content: 'answer' },
  ],
};

describe('the five runner calls', () => {
  it('claims under the runner name and reads the row', async () => {
    const { query, sent } = fakeQuery([CLAIM_ROW]);
    const claim = await createRpc(query).claim('workspace@test');
    expect(sent[0]?.sql).toContain('public.workspace_claim($1)');
    expect(sent[0]?.params).toEqual(['workspace@test']);
    expect(claim).toEqual({
      requestId: '41',
      conversationId: CONVERSATION_ID,
      userMessageId: CLAIM_ROW.user_message_id,
      prompt: 'What is due on Friday?',
      claudeSessionId: STORED_SESSION_ID,
      priorTier: 'mid',
      history: CLAIM_ROW.history,
    });
  });

  it('is null when nothing is queued', async () => {
    expect(await createRpc(fakeQuery([]).query).claim('w')).toBeNull();
  });

  it('reads a first question: no session id, no prior tier, an empty history', async () => {
    const row = { ...CLAIM_ROW, claude_session_id: null, prior_tier: null, history: [] };
    const claim = await createRpc(fakeQuery([row]).query).claim('w');
    expect(claim).toMatchObject({ claudeSessionId: null, priorTier: null, history: [] });
  });

  it('reads a bigint request id whatever type the driver gives it', async () => {
    for (const id of [41, 41n, '41']) {
      const claim = await createRpc(fakeQuery([{ ...CLAIM_ROW, request_id: id }]).query).claim('w');
      expect(claim?.requestId).toBe('41');
    }
  });

  it('refuses a claim row with no usable request id', async () => {
    await expect(createRpc(fakeQuery([{ ...CLAIM_ROW, request_id: 'abc' }]).query).claim('w')).rejects.toThrow(/request id/);
  });

  it('drops what is not a stored message from the history, and a prior tier it does not know', async () => {
    const history = [{ role: 'user', content: 'kept' }, { role: 'system', content: 'no' }, { role: 'assistant' }, 'text', null];
    const claim = await createRpc(fakeQuery([{ ...CLAIM_ROW, history, prior_tier: 'ultra' }]).query).claim('w');
    expect(claim?.history).toEqual([{ role: 'user', content: 'kept' }]);
    expect(claim?.priorTier).toBeNull();
  });

  it('reads a history that arrives as JSON text', async () => {
    const claim = await createRpc(fakeQuery([{ ...CLAIM_ROW, history: JSON.stringify(CLAIM_ROW.history) }]).query).claim('w');
    expect(claim?.history).toEqual(CLAIM_ROW.history);
  });

  it('begins with the tier, the provider and the alias, and returns the message id', async () => {
    const { query, sent } = fakeQuery([{ id: '9c9c9c9c-0000-4000-8000-000000000001' }]);
    const id = await createRpc(query).begin('41', 'low', 'claude-cli', 'haiku');
    expect(sent[0]?.sql).toContain('public.workspace_begin($1::bigint, $2, $3, $4)');
    expect(sent[0]?.params).toEqual(['41', 'low', 'claude-cli', 'haiku']);
    expect(id).toBe('9c9c9c9c-0000-4000-8000-000000000001');
  });

  it('streams a delta under its seq and answers whether the request is still claimed', async () => {
    const yes = fakeQuery([{ ok: true }]);
    const no = fakeQuery([{ ok: false }]);
    expect(await createRpc(yes.query).stream('41', 3, 'text')).toBe(true);
    expect(await createRpc(no.query).stream('41', 3, 'text')).toBe(false);
    expect(await createRpc(fakeQuery([]).query).stream('41', 3, 'text')).toBe(false);
    expect(yes.sent[0]?.sql).toContain('public.workspace_stream($1::bigint, $2::integer, $3)');
    expect(yes.sent[0]?.params).toEqual(['41', 3, 'text']);
  });

  it('finishes with all nine arguments in the function order, the tool calls as JSON', async () => {
    const { query, sent } = fakeQuery();
    const toolCalls = [{ tool: 'search_materials', query: 'late work', scope: 'IST.323', ok: true }];
    await createRpc(query).finish({
      requestId: '41',
      state: 'done',
      content: 'The answer.',
      toolCalls,
      errorCode: null,
      costUsd: 0.038524,
      durationMs: 9972,
      claudeSessionId: STORED_SESSION_ID,
      model: 'claude-haiku-4-5-20251001',
    });
    expect(sent[0]?.sql).toContain(
      'public.workspace_finish($1::bigint, $2, $3, $4::jsonb, $5, $6::numeric, $7::integer, $8, $9)',
    );
    expect(sent[0]?.params).toEqual([
      '41',
      'done',
      'The answer.',
      JSON.stringify(toolCalls),
      null,
      0.038524,
      9972,
      STORED_SESSION_ID,
      'claude-haiku-4-5-20251001',
    ]);
  });

  it('finishes a failed turn with its code and nulls where nothing was reported', async () => {
    const { query, sent } = fakeQuery();
    await createRpc(query).finish({
      requestId: '41',
      state: 'failed',
      content: '',
      toolCalls: [],
      errorCode: 'timeout',
      costUsd: null,
      durationMs: 480000.7,
      claudeSessionId: null,
      model: null,
    });
    expect(sent[0]?.params).toEqual(['41', 'failed', '', '[]', 'timeout', null, 480001, null, null]);
  });

  it('sends the heartbeat under the runner name', async () => {
    const { query, sent } = fakeQuery();
    await createRpc(query).heartbeat('workspace@test');
    expect(sent[0]?.sql).toContain('public.workspace_heartbeat($1)');
    expect(sent[0]?.params).toEqual(['workspace@test']);
  });

  it('touches no table: every statement is one of the five functions', async () => {
    const { query, sent } = fakeQuery([CLAIM_ROW]);
    const rpc = createRpc(query);
    await rpc.claim('w');
    await rpc.begin('41', 'low', 'claude-cli', 'haiku');
    await rpc.stream('41', 1, 'x');
    await rpc.finish({ requestId: '41', state: 'done', content: '', toolCalls: [], errorCode: null, costUsd: null, durationMs: 1, claudeSessionId: null, model: null });
    await rpc.heartbeat('w');
    expect(sent).toHaveLength(5);
    for (const { sql } of sent) {
      expect(sql).toMatch(/public\.workspace_(claim|begin|stream|finish|heartbeat)\(/);
      expect(sql).not.toMatch(/\b(insert|update|delete)\b/i);
      expect(sql).not.toMatch(/\bfrom\s+(public\.)?(workspace_messages|workspace_requests|assignment_progress|reading_progress)/i);
    }
  });
});

describe('the connection', () => {
  function fakeClients(script: Array<(sql: string) => QueryResult | Error>) {
    const made: Array<{ dsn: string; ended: boolean; queries: string[] }> = [];
    const newClient = (dsn: string): PgClientLike => {
      const record = { dsn, ended: false, queries: [] as string[] };
      made.push(record);
      return {
        connect: async () => undefined,
        query: async (sql: string) => {
          record.queries.push(sql);
          if (sql.includes('current_user')) return { rows: [{ role: 'workspace_runner' }] };
          const next = script.shift();
          const outcome = next ? next(sql) : { rows: [] };
          if (outcome instanceof Error) throw outcome;
          return outcome;
        },
        end: async () => {
          record.ended = true;
        },
        on: () => undefined,
      };
    };
    return { newClient, made };
  }

  const withCode = (message: string, code?: string): Error => Object.assign(new Error(message), code ? { code } : {});

  it('connects once, says who it is, and reuses the connection', async () => {
    const logs: string[] = [];
    const { newClient, made } = fakeClients([() => ({ rows: [{ n: 1 }] }), () => ({ rows: [{ n: 2 }] })]);
    const query = createPgQuery({ dsn: DSN, ca: CA,log: (line) => logs.push(line), newClient });
    expect((await query('select 1')).rows).toEqual([{ n: 1 }]);
    expect((await query('select 2')).rows).toEqual([{ n: 2 }]);
    expect(made).toHaveLength(1);
    expect(logs.filter((line) => /connected as workspace_runner/.test(line))).toHaveLength(1);
    for (const line of logs) expect(line).not.toContain('not-a-password');
  });

  it('keeps the connection after a statement the database refused', async () => {
    const { newClient, made } = fakeClients([() => withCode('workspace_stream: delta too long', '22023'), () => ({ rows: [] })]);
    const query = createPgQuery({ dsn: DSN, ca: CA,log: () => undefined, newClient });
    await expect(query('select 1')).rejects.toMatchObject({ code: '22023' });
    await query('select 2');
    expect(made).toHaveLength(1);
  });

  it('drops the connection after a socket error and connects again on the next call', async () => {
    const { newClient, made } = fakeClients([() => withCode(`connect ECONNRESET ${DSN}`), () => ({ rows: [] })]);
    const query = createPgQuery({ dsn: DSN, ca: CA,log: () => undefined, newClient });
    await expect(query('select 1')).rejects.toThrow(/ECONNRESET/);
    await query('select 2');
    expect(made).toHaveLength(2);
    expect(made[0]?.ended).toBe(true);
  });

  describe('with two calls in flight', () => {
    interface Held {
      /** Which connection the statement ran on, counted from 0. */
      readonly connection: number;
      readonly sql: string;
      readonly answer: (result: QueryResult) => void;
      readonly fail: (error: Error) => void;
    }

    /** Clients whose statements stay open until the test answers or fails each one. */
    function heldClients() {
      const made: Array<{ ended: number }> = [];
      const held: Held[] = [];
      const newClient = (): PgClientLike => {
        const connection = made.length;
        const record = { ended: 0 };
        made.push(record);
        return {
          connect: async () => undefined,
          query: (sql: string) => {
            if (sql.includes('current_user')) return Promise.resolve({ rows: [{ role: 'workspace_runner' }] });
            return new Promise<QueryResult>((answer, fail) => held.push({ connection, sql, answer, fail }));
          },
          end: async () => {
            record.ended += 1;
          },
          on: () => undefined,
        };
      };
      return { newClient, made, held };
    }

    /** One turn of the event loop: every statement already sent has reached its client. */
    const sent = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

    it('a call that fails late drops the connection it ran on, never the one opened since', async () => {
      const { newClient, made, held } = heldClients();
      const query = createPgQuery({ dsn: DSN, ca: CA,log: () => undefined, newClient });

      const first = query('select 1');
      const second = query('select 2');
      await sent();
      expect(held.map((h) => h.connection)).toEqual([0, 0]);

      // The first fails: connection 1 is dropped.
      held[0]?.fail(withCode('read ECONNRESET'));
      await expect(first).rejects.toThrow(/ECONNRESET/);
      expect(made[0]?.ended).toBe(1);

      // The next call opens connection 2.
      const third = query('select 3');
      await sent();
      expect(made).toHaveLength(2);
      expect(held[2]).toMatchObject({ connection: 1, sql: 'select 3' });

      // The second fails late, on connection 1: connection 2 is healthy and stays open.
      held[1]?.fail(withCode('Connection terminated unexpectedly'));
      await expect(second).rejects.toThrow(/terminated/);
      expect(made[1]?.ended).toBe(0);

      held[2]?.answer({ rows: [{ n: 3 }] });
      expect((await third).rows).toEqual([{ n: 3 }]);

      // The call after it runs on connection 2 as well: no third connection is opened.
      const fourth = query('select 4');
      await sent();
      expect(held[3]).toMatchObject({ connection: 1, sql: 'select 4' });
      held[3]?.answer({ rows: [] });
      await fourth;
      expect(made).toHaveLength(2);
    });

    it('closes a connection once when both calls on it fail', async () => {
      const { newClient, made, held } = heldClients();
      const query = createPgQuery({ dsn: DSN, ca: CA,log: () => undefined, newClient });

      const first = query('select 1');
      const second = query('select 2');
      await sent();
      held[0]?.fail(withCode('read ECONNRESET'));
      held[1]?.fail(withCode('read ECONNRESET'));
      await expect(first).rejects.toThrow(/ECONNRESET/);
      await expect(second).rejects.toThrow(/ECONNRESET/);
      expect(made).toHaveLength(1);
      expect(made[0]?.ended).toBe(1);
    });

    it('a late 57P01 from a dropped connection leaves the new one alone', async () => {
      const { newClient, made, held } = heldClients();
      const query = createPgQuery({ dsn: DSN, ca: CA,log: () => undefined, newClient });

      const first = query('select 1');
      const second = query('select 2');
      await sent();
      held[0]?.fail(withCode('read ECONNRESET'));
      await expect(first).rejects.toThrow(/ECONNRESET/);

      const third = query('select 3');
      await sent();
      held[1]?.fail(withCode('terminating connection due to administrator command', '57P01'));
      await expect(second).rejects.toMatchObject({ code: '57P01' });
      expect(made[1]?.ended).toBe(0);

      held[2]?.answer({ rows: [] });
      await third;
      expect(made).toHaveLength(2);
    });
  });

  it('never lets the DSN, its password or its host into an error message', async () => {
    const { newClient } = fakeClients([() => withCode(`could not reach ${DSN} at aws-0-us-east-1.pooler.supabase.com with not-a-password`)]);
    const query = createPgQuery({ dsn: DSN, ca: CA,log: () => undefined, newClient });
    const error = await query('select 1').catch((caught: Error) => caught);
    expect((error as Error).message).not.toContain('not-a-password');
    expect((error as Error).message).not.toContain('pooler.supabase.com');
    expect((error as Error).message).toContain('<redacted>');
  });

  describe('a connection error between calls', () => {
    /** Clients whose `error` listener the test fires, as the driver does when a socket fails with no call in flight. */
    function listeningClients() {
      const made: Array<{ fire: (error: Error) => void }> = [];
      const newClient = (): PgClientLike => {
        const record = { fire: (_error: Error): void => undefined };
        made.push(record);
        return {
          connect: async () => undefined,
          query: async (sql: string) => (sql.includes('current_user') ? { rows: [{ role: 'workspace_runner' }] } : { rows: [] }),
          end: async () => undefined,
          on: (_event, listener) => {
            record.fire = listener;
          },
        };
      };
      return { newClient, made };
    }

    it('is logged once, with the DSN, its password and its host taken out', async () => {
      const logs: string[] = [];
      const { newClient, made } = listeningClients();
      const query = createPgQuery({ dsn: DSN, ca: CA, log: (line) => logs.push(line), newClient });
      await query('select 1');
      made[0]?.fire(new Error(`read ECONNRESET ${DSN} at aws-0-us-east-1.pooler.supabase.com with not-a-password`));
      const said = logs.filter((line) => /connection error/.test(line));
      expect(said).toHaveLength(1);
      expect(said[0]).toContain('read ECONNRESET');
      expect(said[0]).toContain('<redacted>');
      expect(said[0]).not.toContain(DSN);
      expect(said[0]).not.toContain('not-a-password');
      expect(said[0]).not.toContain('pooler.supabase.com');
    });

    it('makes the next call connect afresh', async () => {
      const { newClient, made } = listeningClients();
      const query = createPgQuery({ dsn: DSN, ca: CA, log: () => undefined, newClient });
      await query('select 1');
      made[0]?.fire(new Error('Connection terminated unexpectedly'));
      await query('select 2');
      expect(made).toHaveLength(2);
    });

    it('on a connection already replaced leaves the one in use alone', async () => {
      const { newClient, made } = listeningClients();
      const query = createPgQuery({ dsn: DSN, ca: CA, log: () => undefined, newClient });
      await query('select 1');
      made[0]?.fire(new Error('Connection terminated unexpectedly'));
      await query('select 2');
      made[0]?.fire(new Error('read ECONNRESET'));
      await query('select 3');
      expect(made).toHaveLength(2);
    });
  });

  it('closes the connection when asked', async () => {
    const { newClient, made } = fakeClients([() => ({ rows: [] })]);
    const query = createPgQuery({ dsn: DSN, ca: CA,log: () => undefined, newClient });
    await query('select 1');
    await query.end();
    expect(made[0]?.ended).toBe(true);
  });

  it('fails the call when the connect itself fails, and tries again next time', async () => {
    let attempts = 0;
    const newClient = (): PgClientLike => ({
      connect: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('getaddrinfo ENOTFOUND');
      },
      query: async () => ({ rows: [{ role: 'workspace_runner' }] }),
      end: async () => undefined,
      on: () => undefined,
    });
    const query = createPgQuery({ dsn: DSN, ca: CA,log: () => undefined, newClient });
    await expect(query('select 1')).rejects.toThrow(/ENOTFOUND/);
    await expect(query('select 1')).resolves.toBeDefined();
    expect(attempts).toBe(2);
  });

  // Ruling X1. Node reports a refused connect to a host with two addresses as an AggregateError with
  // no message and the reason in `code`: without the code the log line would end in nothing.
  it('names a failed connect by its code when the error carries no message', async () => {
    const refused = (): Error =>
      Object.assign(new AggregateError([new Error('connect ECONNREFUSED ::1:5432'), new Error('connect ECONNREFUSED 127.0.0.1:5432')], ''), {
        code: 'ECONNREFUSED',
      });
    const newClient = (): PgClientLike => ({
      connect: async () => {
        throw refused();
      },
      query: async () => ({ rows: [] }),
      end: async () => undefined,
      on: () => undefined,
    });
    const query = createPgQuery({ dsn: DSN, ca: CA, log: () => undefined, newClient });
    const error = await query('select 1').catch((caught: Error) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('ECONNREFUSED');
    expect(error).toMatchObject({ code: 'ECONNREFUSED' });
  });

  it('knows which SQLSTATEs leave a session usable', () => {
    expect(isStatementError('22023')).toBe(true);
    expect(isStatementError('23505')).toBe(true);
    expect(isStatementError('57014')).toBe(true);
    expect(isStatementError('08006')).toBe(false);
    expect(isStatementError('57P01')).toBe(false);
    expect(isStatementError('XX000')).toBe(false);
    expect(isStatementError(undefined)).toBe(false);
  });

  it('redacts a DSN from any text', () => {
    expect(redactDsn(`failed: ${DSN}`, DSN)).toBe('failed: <redacted>');
    expect(redactDsn('password not-a-password leaked', DSN)).toBe('password <redacted> leaked');
    expect(redactDsn('nothing to hide', null)).toBe('nothing to hide');
  });

  it('names itself to the database', () => {
    expect(APPLICATION_NAME).toBe('bb2dash-workspace-runner');
  });

  it('bounds a connect and a query, so an unreachable database fails a call instead of holding it', () => {
    expect(PG_CLIENT_OPTIONS).toMatchObject({ application_name: APPLICATION_NAME, keepAlive: true });
    expect(PG_CLIENT_OPTIONS.connectionTimeoutMillis).toBeLessThanOrEqual(15_000);
    expect(PG_CLIENT_OPTIONS.query_timeout).toBeGreaterThan(15_000);
    expect(PG_CLIENT_OPTIONS.query_timeout).toBeLessThan(HEARTBEAT_MS);
  });

  it('makes a client for the DSN without opening a connection', () => {
    const client = newPgClient(DSN, CA) as unknown as { connectionParameters: { application_name: string; port: number; user: string } };
    expect(client.connectionParameters.application_name).toBe(APPLICATION_NAME);
    expect(client.connectionParameters.port).toBe(5432);
    expect(client.connectionParameters.user).toBe('workspace_runner.projectref');
  });
});
