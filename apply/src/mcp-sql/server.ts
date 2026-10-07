/**
 * The SQL MCP server the CLI starts (`/run/apply/mcp.json`, server `db`):
 *   node /app/apply/dist/mcp-sql/server.js
 *
 * stdio, one JSON-RPC message per line. It connects as `inbox_apply_runner` with the worker's own
 * DSN, read from its secret file here and never from the environment or an argument, over the
 * verified connection Phase 21 builds (`workspace/src/db.ts`). Nothing it prints holds the DSN.
 *
 * What the database is asked to hold, beyond the guard:
 *   * a read runs inside a READ ONLY transaction and as one statement (the extended protocol), so
 *     it cannot write, queue a pg_net request or call a function that does;
 *   * an item is one transaction the server opens and closes itself;
 *   * after every call the session is rolled back and `discard all` is run, so no open
 *     transaction, setting, advisory lock or prepared statement outlives the call that made it.
 *
 * When its stdin closes (the CLI is gone, however it went) it closes its connection and exits: an
 * orphan must not keep one of the role's four connections.
 *
 * This file runs on load and is never imported; the protocol and the tools are in `rpc.ts`, the
 * text rules in `guard.ts`.
 */

import readline from 'node:readline';

import { readTextOrNull } from '../../../workspace/src/config.js';
import { newPgClient, redactDsn, type PgClientLike } from '../../../workspace/src/db.js';
import { DECISION_SCHEMA } from '../batch.js';
import { loadConfig } from '../config.js';
import { handle, type ApplyItemInput, type ApplyItemResult, type SqlRunner, type StatementResult } from './rpc.js';

type DriverResult = { command?: string; rowCount?: number | null; rows?: Record<string, unknown>[] };
/** The driver's own query call: text with values, or an object form that forces one statement. */
type Driver = PgClientLike & { query(config: unknown, values?: readonly unknown[]): Promise<DriverResult> };

const EXIT_OK = 0;

const toStatement = (result: DriverResult): StatementResult => ({
  command: result.command ?? null,
  rowCount: result.rowCount ?? null,
  rows: result.rows ?? [],
});

/** One statement and no more: the extended protocol refuses a second. */
const single = (text: string): { text: string; queryMode: 'extended' } => ({ text, queryMode: 'extended' });

function createRunner(dsn: string, ca: string, log: (line: string) => void): SqlRunner & { end(): Promise<void> } {
  let client: Driver | null = null;

  const connected = async (): Promise<Driver> => {
    if (client !== null) return client;
    const fresh = newPgClient(dsn, ca) as Driver;
    fresh.on('error', (error) => {
      log(`db: connection error: ${redactDsn(error.message, dsn)}`);
      if (client === fresh) client = null;
    });
    await fresh.connect();
    client = fresh;
    return fresh;
  };

  const drop = async (driver: Driver): Promise<void> => {
    if (client === driver) client = null;
    try {
      await driver.end();
    } catch {
      // Already gone.
    }
  };

  /** Leave the session as a new one would be; a connection that cannot do that is dropped. */
  const settle = async (driver: Driver): Promise<void> => {
    try {
      await driver.query('rollback');
      await driver.query('discard all');
    } catch {
      await drop(driver);
    }
  };

  return {
    async query(sql, limit) {
      const driver = await connected();
      try {
        await driver.query('begin transaction read only');
        // Wrapped, so at most `limit` rows cross the wire. The line breaks keep a trailing `--`
        // comment of the statement from swallowing the closing bracket.
        const inner = sql.trim().replace(/;\s*$/, '');
        return toStatement(await driver.query(single(`select * from (\n${inner}\n) as q limit ${Math.trunc(limit)}`)));
      } finally {
        await settle(driver);
      }
    },

    async applyItem(input: ApplyItemInput): Promise<ApplyItemResult> {
      const driver = await connected();
      try {
        await driver.query('begin');
        const begun = await driver.query('select public.inbox_apply_begin_item($1::bigint, $2::bigint) as ok', [input.request, input.item]);
        if (begun.rows?.[0]?.ok !== true) return { outcome: 'skipped' };

        const results: StatementResult[] = [];
        for (const statement of input.statements) results.push(toStatement(await driver.query(single(statement))));

        // The three fields the database checks are the server's to set, not the model's to get right.
        const record = { ...input.record, schema: DECISION_SCHEMA, item: input.item, request: input.request, mode: 'unattended' };
        const archived = await driver.query('select public.inbox_apply_archive($1::bigint, $2::bigint, $3::jsonb) as ok', [
          input.request,
          input.item,
          JSON.stringify(record),
        ]);
        if (archived.rows?.[0]?.ok !== true) throw new Error('the item is no longer answered, so it was not archived');
        await driver.query('commit');
        return { outcome: 'archived', statements: results };
      } finally {
        // After a commit this is a no-op; after anything else it undoes the whole item.
        await settle(driver);
      }
    },

    async end() {
      if (client !== null) await drop(client);
    },
  };
}

const log = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

const config = loadConfig({ env: process.env, readFile: readTextOrNull });
const runner = createRunner(config.dbUrl, config.dbCa, log);

// One message at a time, in order: an item's transaction must finish before the next call starts.
let chain: Promise<void> = Promise.resolve();
const input = readline.createInterface({ input: process.stdin });

input.on('line', (lineText) => {
  if (lineText.trim() === '') return;
  chain = chain.then(async () => {
    let message: unknown;
    try {
      message = JSON.parse(lineText);
    } catch {
      return;
    }
    try {
      const answer = await handle(message, runner);
      if (answer !== null) process.stdout.write(`${JSON.stringify(answer)}\n`);
    } catch (error) {
      log(`sql server: ${redactDsn(error instanceof Error ? error.message : String(error), config.dbUrl)}`);
    }
  });
});

input.on('close', () => {
  void chain
    .then(() => runner.end())
    .catch(() => undefined)
    .finally(() => process.exit(EXIT_OK));
});
