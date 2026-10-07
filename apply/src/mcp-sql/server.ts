/**
 * The SQL MCP server the CLI starts (`/run/apply/mcp.json`, server `db`):
 *   node /app/apply/dist/mcp-sql/server.js
 *
 * stdio, one JSON-RPC message per line. It connects as `inbox_apply_runner` with the worker's own
 * DSN, read from its secret file here and never from the environment or an argument, over the
 * verified connection Phase 21 builds (`workspace/src/db.ts`). Nothing it prints holds the DSN.
 *
 * This file runs on load and is never imported; the protocol and the tools are in `rpc.ts` and
 * the text rules in `guard.ts`.
 */

import readline from 'node:readline';

import { readTextOrNull } from '../../../workspace/src/config.js';
import { newPgClient, redactDsn, type PgClientLike } from '../../../workspace/src/db.js';
import { loadConfig } from '../config.js';
import { handle, type SqlRunner, type StatementResult } from './rpc.js';

type DriverResult = { command?: string; rowCount?: number | null; rows?: Record<string, unknown>[] };
/** The driver's own query call: an object form (one statement, extended protocol) or a text batch. */
type Driver = PgClientLike & { query(config: unknown): Promise<DriverResult | DriverResult[]> };

const toStatement = (result: DriverResult): StatementResult => ({
  command: result.command ?? null,
  rowCount: result.rowCount ?? null,
  rows: result.rows ?? [],
});

function createRunner(dsn: string, ca: string, log: (line: string) => void): SqlRunner {
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

  /** Close whatever the last call left open; a connection that cannot even do that is dropped. */
  const settle = async (driver: Driver): Promise<void> => {
    try {
      await driver.query('rollback');
    } catch {
      client = null;
      try {
        await driver.end();
      } catch {
        // Already gone.
      }
    }
  };

  return {
    async query(sql) {
      const driver = await connected();
      try {
        await driver.query('begin transaction read only');
        // The extended protocol parses exactly one statement: a second one is the database's error.
        return toStatement((await driver.query({ text: sql, queryMode: 'extended' })) as DriverResult);
      } finally {
        await settle(driver);
      }
    },
    async execute(sql) {
      const driver = await connected();
      try {
        const results = await driver.query(sql);
        return (Array.isArray(results) ? results : [results]).map(toStatement);
      } finally {
        await settle(driver);
      }
    },
  };
}

const log = (line: string): void => {
  process.stderr.write(`${line}\n`);
};

const config = loadConfig({ env: process.env, readFile: readTextOrNull });
const runner = createRunner(config.dbUrl, config.dbCa, log);

// One message at a time, in order: a batch must finish (and be rolled back) before the next starts.
let chain: Promise<void> = Promise.resolve();
readline.createInterface({ input: process.stdin }).on('line', (lineText) => {
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
