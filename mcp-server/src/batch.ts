#!/usr/bin/env node
/**
 * The batch entry: how the Workspace runner searches. NOT an MCP tool: `server.ts` still
 * registers three tools, so host sessions and the apply container gain nothing, and memory
 * stays inside the app.
 *
 * `node /app/mcp-materials/dist/batch.js`, started with the two environment values the
 * materials server gets. One JSON object in on stdin (`batch-request.json`), one out on stdout
 * (`batch-answer.json`), nothing else printed. For each query: `ok` and its hits as data. For
 * each attachment: what `workspace_attachment_read` returned, cut on the server.
 *
 * States of a query: `ok`; `refused` (the search function answered 4xx); `failed` (anything
 * else, its 8 s limit included). Exit 0 whenever the object was written, whatever the states
 * inside; non-zero only when no object could be written (bad stdin, bad configuration). The
 * project comes from `loadConfig`, as the server's does, so the vault's project is refused
 * before any request.
 *
 * A hit is data: it comes from the structured rows of the search function and nothing in a
 * passage is ever read as an id, a label or another hit. Logs carry states and counts only,
 * never a query or a passage.
 */

import { pathToFileURL } from 'node:url';
import { SupabaseMaterialsClient, type WorkspaceClient } from './client.js';
import { type Config, loadConfig } from './config.js';
import { ApiError, ConfigError, describeError } from './errors.js';
import {
  type AttachmentKind,
  type AttachmentRead,
  type BatchAnswer,
  type BatchRequest,
  type QueryAnswer,
  batchRequestSchema,
} from './workspace-shapes.js';

/** Each call inside the child, so it answers inside the runner's 10 s with what it has. */
export const BATCH_CALL_TIMEOUT_MS = 8_000;

const EXIT_OK = 0;
const EXIT_NO_ANSWER = 1;
const LOG_PREFIX = '[bb2dash-batch]';

type BatchQuery = BatchRequest['queries'][number];
type BatchAttachment = BatchRequest['attachments'][number];

function isClientError(error: unknown): boolean {
  return error instanceof ApiError && error.status !== null && error.status >= 400 && error.status < 500;
}

async function runQuery(
  client: WorkspaceClient,
  query: BatchQuery,
  request: BatchRequest,
  minSimilarity: number | null,
): Promise<QueryAnswer> {
  try {
    const hits = await client.searchWorkspace(
      { q: query.q, kinds: query.kinds, courses: query.courses, limit: request.limit, minSimilarity },
      BATCH_CALL_TIMEOUT_MS,
    );
    return { ok: true, state: 'ok', hits };
  } catch (error) {
    return { ok: false, state: isClientError(error) ? 'refused' : 'failed', hits: [] };
  }
}

/** The shape a failed read keeps: every key present, so the runner reads one object type. */
function failedAttachment(kind: AttachmentKind, id: number): AttachmentRead {
  return {
    kind, id, state: 'failed', title: null, course_id: null,
    units_total: 0, units_read: 0, chars_total: 0, chars_read: 0, units: [], left_out_unit_ids: [],
  };
}

async function runAttachment(client: WorkspaceClient, attachment: BatchAttachment): Promise<AttachmentRead> {
  try {
    return await client.readAttachment(attachment.kind, attachment.id, attachment.max_chars, BATCH_CALL_TIMEOUT_MS);
  } catch {
    return failedAttachment(attachment.kind, attachment.id);
  }
}

/** All queries and attachments run at once; the answer keeps the request's order. */
export async function runBatch(client: WorkspaceClient, request: BatchRequest, config: Config): Promise<BatchAnswer> {
  const minSimilarity = request.min_similarity === undefined ? config.search.minSimilarity : request.min_similarity;
  const [queries, attachments] = await Promise.all([
    Promise.all(request.queries.map((query) => runQuery(client, query, request, minSimilarity))),
    Promise.all(request.attachments.map((attachment) => runAttachment(client, attachment))),
  ]);
  return { version: 1, queries, attachments };
}

export interface BatchCliOptions {
  stdin: string;
  env: Record<string, string | undefined>;
  out: (text: string) => void;
  err: (text: string) => void;
  fetchImpl?: typeof fetch;
}

/** Parse stdin as a request. The message names fields, never values. */
function parseRequest(stdin: string): { request: BatchRequest } | { problem: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(stdin);
  } catch {
    return { problem: 'stdin is not JSON' };
  }
  const parsed = batchRequestSchema.safeParse(raw);
  if (parsed.success) return { request: parsed.data };
  const fields = parsed.error.issues.map((issue) => issue.path.join('.') || '(root)');
  return { problem: `stdin is not a batch request (check: ${[...new Set(fields)].join(', ')})` };
}

/** The whole entry, with its I/O handed in. Returns the exit code. */
export async function runBatchCli(options: BatchCliOptions): Promise<number> {
  let config: Config;
  try {
    config = loadConfig(options.env);
  } catch (error) {
    options.err(`${LOG_PREFIX} ${error instanceof ConfigError ? describeError(error) : 'configuration failed'}\n`);
    return EXIT_NO_ANSWER;
  }

  const parsed = parseRequest(options.stdin);
  if ('problem' in parsed) {
    options.err(`${LOG_PREFIX} ${parsed.problem}\n`);
    return EXIT_NO_ANSWER;
  }

  const client = new SupabaseMaterialsClient({
    supabaseUrl: config.supabaseUrl,
    serviceKey: config.serviceKey,
    timeoutMs: BATCH_CALL_TIMEOUT_MS,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });
  const startedAt = Date.now();
  const answer = await runBatch(client, parsed.request, config);

  options.out(JSON.stringify(answer));
  const states = answer.queries.map((q) => q.state).join(',');
  options.err(
    `${LOG_PREFIX} queries=${answer.queries.length} states=[${states}] attachments=${answer.attachments.length} ms=${Date.now() - startedAt}\n`,
  );
  return EXIT_OK;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  const code = await runBatchCli({
    stdin: await readStdin(),
    env: process.env,
    out: (text) => process.stdout.write(`${text}\n`),
    err: (text) => process.stderr.write(text),
  });
  process.exitCode = code;
}

// Run only when started as the entry, never when a test imports this file.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write(`${LOG_PREFIX} fatal error\n`);
    process.exit(EXIT_NO_ANSWER);
  });
}
