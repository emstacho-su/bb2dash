/**
 * Fakes for the runner tests: a database that records its five calls, a provider turn that follows
 * a script on the (fake) clock, and a CLI process that replays recorded stream lines.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Claim, FinishArgs, JobClaim, JobFinishArgs, SourceRow, TurnFacts, WorkspaceRpc } from '../../src/db.js';
import type { CliExit, CliProcess, CliTurn, SpawnOptions } from '../../src/providers/claude-cli.js';
import type { ResultEvent, TurnEvent, TurnInput } from '../../src/providers/types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.resolve(HERE, '..', 'fixtures');

export const CONVERSATION_ID = '0b0e7c1e-58a3-4d0b-9d5e-1d2c3b4a5f60';
export const STORED_SESSION_ID = '5e0c1a52-7d7e-4b8f-9a44-0f6f1f6f0a11';
export const QUESTION = 'What does the IST.323 syllabus say about late work?';

/**
 * Phase 21's recordings were made with two MCP servers. An answering turn now starts one, so the
 * notes server (and its tools) is taken out of an init line; every other line is as recorded.
 */
export function asAnsweringInit(line: Record<string, unknown>): Record<string, unknown> {
  if (line.type !== 'system' || line.subtype !== 'init') return line;
  const servers = Array.isArray(line.mcp_servers) ? (line.mcp_servers as Array<{ name?: unknown }>).filter((server) => server.name !== 'rag') : line.mcp_servers;
  const tools = Array.isArray(line.tools) ? (line.tools as unknown[]).filter((tool) => !(typeof tool === 'string' && tool.startsWith('mcp__rag__'))) : line.tools;
  return { ...line, mcp_servers: servers, tools };
}

export function readFixtureLines(name: string): Array<Record<string, unknown>> {
  return fs
    .readFileSync(path.join(FIXTURES, name), 'utf8')
    .split('\n')
    .filter((text) => text.trim() !== '')
    .map((text) => asAnsweringInit(JSON.parse(text) as Record<string, unknown>));
}

export function readFixtureJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8')) as T;
}

export function claimOf(overrides: Partial<Claim> = {}): Claim {
  return {
    requestId: '41',
    conversationId: CONVERSATION_ID,
    userMessageId: '7a7a7a7a-0000-4000-8000-000000000001',
    prompt: QUESTION,
    ...overrides,
  };
}

/** The jsonb of `workspace_turn_context` for a request with no options row: depth auto, format plain, nothing else. */
export function contextJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    options: { depth: 'auto', format: 'plain', routine_id: null, course_display_id: null, course_ids: null },
    routine: null,
    attachments: [],
    about_me: null,
    rolling_summary: null,
    summarised_through: null,
    messages: [],
    messages_left_out: 0,
    last_auto_tier: null,
    courses: [],
    today: '2026-10-08',
    ...overrides,
  };
}

export interface PutCall {
  readonly requestId: string;
  readonly runner: string;
  readonly facts: TurnFacts | null;
  readonly sources: readonly SourceRow[];
}

export interface StreamCall {
  readonly requestId: string;
  readonly seq: number;
  readonly delta: string;
  readonly at: number;
}

export interface FakeRpc {
  readonly rpc: WorkspaceRpc;
  readonly queue: Claim[];
  readonly claims: number[];
  /** What `workspace_turn_context` returns; set it to script a turn. */
  context: unknown;
  /** What `workspace_planner_feed` returns. */
  feed: unknown;
  readonly contextTries: number[];
  readonly feedCalls: Array<{ from: string | null; to: string | null }>;
  readonly puts: PutCall[];
  readonly jobQueue: JobClaim[];
  readonly jobClaims: Array<{ runner: string; kinds: readonly string[]; at: number }>;
  readonly jobFinishes: JobFinishArgs[];
  readonly begins: Array<{ requestId: string; tier: string; provider: string; model: string }>;
  /** When each `workspace_begin()` was tried, the tries that failed included. */
  readonly beginTries: number[];
  readonly streams: StreamCall[];
  readonly finishes: FinishArgs[];
  /** When each `workspace_finish()` was tried, the tries that failed included. */
  readonly finishTries: number[];
  readonly heartbeats: Array<{ runner: string; at: number }>;
  /** From now on `workspace_stream()` answers false: the owner pressed Stop. */
  cancel(): void;
  /** From now on every call rejects, as when the database cannot be reached. */
  breakDatabase(): void;
  /** The database can be reached again. */
  repairDatabase(): void;
  /** The next `times` begins fail (all of them when no count is given): with the database's own refusal, or with `error`. */
  failBegin(error?: Error, times?: number): void;
  /** The next `times` finishes fail: as a database that cannot be reached, or with `error`. */
  failFinish(times: number, error?: Error): void;
  /** The next `times` reads of the turn context fail (all of them when no count is given). */
  failContext(error: Error, times?: number): void;
  /** The next `times` puts of facts and sources fail. */
  failPut(times: number, error?: Error): void;
  /** From now on the feed call fails. */
  failFeed(error?: Error): void;
}

/** A refusal one of the five functions raises itself: SQLSTATE 22023 (migration 142). */
export const dbRefusal = (message: string): Error => Object.assign(new Error(message), { code: '22023' });
/** What a call sees when the database cannot be reached: no SQLSTATE. */
export const dbDown = (): Error => new Error('connection refused');

/** `now` is the clock the recorded times are read on: the wall clock unless a harness hands in its own. */
export function fakeRpc(now: () => number = () => Date.now()): FakeRpc {
  let cancelled = false;
  let broken = false;
  let beginFailure: { error: Error; left: number } | null = null;
  let finishFailure: { error: Error; left: number } | null = null;
  let contextFailure: { error: Error; left: number } | null = null;
  let putFailure: { error: Error; left: number } | null = null;
  let feedFailure: Error | null = null;
  const down = dbDown;
  /** The failure a scripted call still owes, used up by one. */
  const owed = (failure: { error: Error; left: number } | null): Error | null => {
    if (failure === null || failure.left <= 0) return null;
    failure.left -= 1;
    return failure.error;
  };
  const fake: FakeRpc = {
    queue: [],
    claims: [],
    context: contextJson(),
    feed: null,
    contextTries: [],
    feedCalls: [],
    puts: [],
    jobQueue: [],
    jobClaims: [],
    jobFinishes: [],
    begins: [],
    beginTries: [],
    streams: [],
    finishes: [],
    finishTries: [],
    heartbeats: [],
    cancel: () => {
      cancelled = true;
    },
    breakDatabase: () => {
      broken = true;
    },
    repairDatabase: () => {
      broken = false;
    },
    failBegin: (error = dbRefusal('workspace_begin: request 41 is not claimed (it is cancelled)'), times = Number.POSITIVE_INFINITY) => {
      beginFailure = { error, left: times };
    },
    failFinish: (times, error = down()) => {
      finishFailure = { error, left: times };
    },
    failContext: (error, times = Number.POSITIVE_INFINITY) => {
      contextFailure = { error, left: times };
    },
    failPut: (times, error = down()) => {
      putFailure = { error, left: times };
    },
    failFeed: (error = down()) => {
      feedFailure = error;
    },
    rpc: {
      async claim() {
        fake.claims.push(now());
        if (broken) throw down();
        return fake.queue.shift() ?? null;
      },
      async turnContext() {
        fake.contextTries.push(now());
        if (broken) throw down();
        const failure = owed(contextFailure);
        if (failure !== null) throw failure;
        return fake.context;
      },
      async turnPut(requestId, runner, facts, sources) {
        if (broken) throw down();
        const failure = owed(putFailure);
        if (failure !== null) throw failure;
        fake.puts.push({ requestId, runner, facts, sources });
        return sources.length;
      },
      async plannerFeed(_requestId, _runner, from, to) {
        fake.feedCalls.push({ from, to });
        if (broken) throw down();
        if (feedFailure !== null) throw feedFailure;
        return fake.feed;
      },
      async jobClaim(runner, kinds) {
        fake.jobClaims.push({ runner, kinds: [...kinds], at: now() });
        if (broken) throw down();
        return fake.jobQueue.shift() ?? null;
      },
      async jobFinish(_runner, args) {
        if (broken) throw down();
        fake.jobFinishes.push(args);
        return { stored: args.outcome === 'done', documentId: null };
      },
      async begin(requestId, tier, provider, model) {
        fake.beginTries.push(now());
        if (broken) throw down();
        const failure = owed(beginFailure);
        if (failure !== null) throw failure;
        fake.begins.push({ requestId, tier, provider, model });
        return '9c9c9c9c-0000-4000-8000-000000000001';
      },
      async stream(requestId, seq, delta) {
        if (broken) throw down();
        fake.streams.push({ requestId, seq, delta, at: now() });
        return !cancelled;
      },
      async finish(args) {
        fake.finishTries.push(now());
        if (broken) throw down();
        const failure = owed(finishFailure);
        if (failure !== null) throw failure;
        fake.finishes.push(args);
      },
      async heartbeat(runner) {
        if (broken) throw down();
        fake.heartbeats.push({ runner, at: now() });
      },
    },
  };
  return fake;
}

export interface Step {
  /** Milliseconds after the turn started. */
  readonly at: number;
  readonly event: TurnEvent;
}

export const delta = (at: number, text: string): Step => ({ at, event: { type: 'delta', text } });

export function result(at: number, overrides: Partial<ResultEvent> = {}): Step {
  return {
    at,
    event: {
      type: 'result',
      ok: true,
      errorCode: null,
      costUsd: 0.038524,
      claudeSessionId: STORED_SESSION_ID,
      model: 'claude-haiku-4-5-20251001',
      ...overrides,
    },
  };
}

/** What a provider reports when the runner stopped it: the runner's own reason decides the code. */
export const ABORTED: ResultEvent = {
  type: 'result',
  ok: false,
  errorCode: 'cli_error',
  costUsd: null,
  claudeSessionId: STORED_SESSION_ID,
  model: 'claude-haiku-4-5-20251001',
};

export interface ScriptedTurn {
  readonly turn: CliTurn;
  readonly inputs: TurnInput[];
  /** When the runner's abort reached the provider, on the test clock; null if it never did. */
  abortedAt: number | null;
  startedAt: number | null;
}

function waitUntil(time: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = (): void => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, Math.max(0, time - Date.now()));
    signal.addEventListener('abort', finish, { once: true });
  });
}

const FOREVER_MS = 24 * 60 * 60 * 1000;

/** A provider turn that yields its steps on the clock; with no result step it runs until aborted. */
export function scriptedTurn(steps: readonly Step[]): ScriptedTurn {
  const scripted: ScriptedTurn = {
    inputs: [],
    abortedAt: null,
    startedAt: null,
    turn: async function* (input, signal) {
      scripted.inputs.push(input);
      const start = Date.now();
      scripted.startedAt = start;
      const endsItself = steps[steps.length - 1]?.event.type === 'result';
      for (const step of steps) {
        await waitUntil(start + step.at, signal);
        if (signal.aborted) break;
        yield step.event;
      }
      if (!signal.aborted && endsItself) return;
      if (!signal.aborted) await waitUntil(start + FOREVER_MS, signal);
      scripted.abortedAt = Date.now();
      yield ABORTED;
    },
  };
  return scripted;
}

export interface FakeProcessOptions {
  readonly lines: ReadonlyArray<unknown>;
  readonly exit: CliExit;
  /** Stay alive after the lines until killed. */
  readonly hang?: boolean;
  /** Ignore SIGTERM, so only SIGKILL ends the process. */
  readonly ignoreSigterm?: boolean;
  /** Keep stdout open after the process is dead, as a child of the CLI holding the pipe would. */
  readonly holdsOutput?: boolean;
  /** Cut the output into chunks of this many characters, so lines arrive in pieces. */
  readonly chunkChars?: number;
  /**
   * What a hanging process still writes once it is told to stop, as one chunk, before its output
   * closes: a CLI that ends its turn on the signal. The reader sees it after the kill.
   */
  readonly linesOnKill?: ReadonlyArray<unknown>;
  readonly stderr?: string;
}

export interface FakeProcess {
  readonly process: CliProcess;
  readonly kills: Array<{ signal: string; at: number }>;
}

export function fakeProcess(options: FakeProcessOptions): FakeProcess {
  const kills: Array<{ signal: string; at: number }> = [];
  let release: () => void = () => undefined;
  const outputClosed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let ended: CliExit | null = null;
  let settle: (exit: CliExit) => void = () => undefined;
  const exited = new Promise<CliExit>((resolve) => {
    settle = resolve;
  });
  const finish = (exit: CliExit): void => {
    if (ended !== null) return;
    ended = exit;
    settle(exit);
  };
  const textOfLines = (lines: ReadonlyArray<unknown>): string => lines.map((line) => `${JSON.stringify(line)}\n`).join('');
  const body = textOfLines(options.lines);
  const size = options.chunkChars ?? body.length;
  const chunks: string[] = [];
  for (let at = 0; at < body.length; at += Math.max(1, size)) chunks.push(body.slice(at, at + Math.max(1, size)));

  async function* stdout(): AsyncIterable<Buffer> {
    for (const chunk of chunks) {
      if (ended !== null) return;
      yield Buffer.from(chunk, 'utf8');
    }
    if (options.hang) {
      await outputClosed;
      if (options.linesOnKill) yield Buffer.from(textOfLines(options.linesOnKill), 'utf8');
      return;
    }
    finish(options.exit);
  }

  return {
    kills,
    process: {
      stdout: stdout(),
      exited,
      stderrText: () => options.stderr ?? '',
      kill(signal) {
        kills.push({ signal, at: Date.now() });
        if (signal === 'SIGTERM' && options.ignoreSigterm) return;
        finish({ code: null, signal });
        if (!options.holdsOutput) release();
      },
      closeOutput() {
        kills.push({ signal: 'closeOutput', at: Date.now() });
        release();
      },
    },
  };
}

export interface SpawnCall {
  readonly argv: readonly string[];
  readonly options: SpawnOptions;
}

export interface FakeSpawn {
  readonly spawn: (argv: readonly string[], options: SpawnOptions) => CliProcess;
  readonly calls: SpawnCall[];
  readonly processes: FakeProcess[];
}

/** Each spawn takes the next scripted process; a spawn past the script throws. */
export function fakeSpawn(...scripts: FakeProcessOptions[]): FakeSpawn {
  const queue = [...scripts];
  const fake: FakeSpawn = {
    calls: [],
    processes: [],
    spawn(argv, options) {
      fake.calls.push({ argv: [...argv], options });
      const next = queue.shift();
      if (!next) throw new Error('the test scripted no more CLI starts');
      const made = fakeProcess(next);
      fake.processes.push(made);
      return made.process;
    },
  };
  return fake;
}

export async function collect(events: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
  const out: TurnEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

export const textOf = (events: readonly TurnEvent[]): string =>
  events.flatMap((event) => (event.type === 'delta' ? [event.text] : [])).join('');

export const resultOf = (events: readonly TurnEvent[]): ResultEvent | undefined =>
  events.flatMap((event) => (event.type === 'result' ? [event] : [])).pop();

export function valueAfter(argv: readonly string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
}
