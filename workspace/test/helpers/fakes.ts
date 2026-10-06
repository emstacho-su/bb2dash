/**
 * Fakes for the runner tests: a database that records its five calls, a provider turn that follows
 * a script on the (fake) clock, and a CLI process that replays recorded stream lines.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Claim, FinishArgs, WorkspaceRpc } from '../../src/db.js';
import type { CliExit, CliProcess, CliTurn, SpawnOptions } from '../../src/providers/claude-cli.js';
import type { ResultEvent, TurnEvent, TurnInput } from '../../src/providers/types.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.resolve(HERE, '..', 'fixtures');

export const CONVERSATION_ID = '0b0e7c1e-58a3-4d0b-9d5e-1d2c3b4a5f60';
export const STORED_SESSION_ID = '5e0c1a52-7d7e-4b8f-9a44-0f6f1f6f0a11';
export const QUESTION = 'What does the IST.323 syllabus say about late work?';

export function readFixtureLines(name: string): Array<Record<string, unknown>> {
  return fs
    .readFileSync(path.join(FIXTURES, name), 'utf8')
    .split('\n')
    .filter((text) => text.trim() !== '')
    .map((text) => JSON.parse(text) as Record<string, unknown>);
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
    claudeSessionId: null,
    priorTier: null,
    history: [],
    ...overrides,
  };
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
  readonly begins: Array<{ requestId: string; tier: string; provider: string; model: string }>;
  readonly streams: StreamCall[];
  readonly finishes: FinishArgs[];
  readonly heartbeats: Array<{ runner: string; at: number }>;
  /** From now on `workspace_stream()` answers false: the owner pressed Stop. */
  cancel(): void;
  /** From now on every call rejects, as when the database cannot be reached. */
  breakDatabase(): void;
  failBegin(): void;
  failFinish(times: number): void;
}

export function fakeRpc(): FakeRpc {
  let cancelled = false;
  let broken = false;
  let beginFails = false;
  let finishFailures = 0;
  const down = (): Error => new Error('connection refused');
  const fake: FakeRpc = {
    queue: [],
    claims: [],
    begins: [],
    streams: [],
    finishes: [],
    heartbeats: [],
    cancel: () => {
      cancelled = true;
    },
    breakDatabase: () => {
      broken = true;
    },
    failBegin: () => {
      beginFails = true;
    },
    failFinish: (times) => {
      finishFailures = times;
    },
    rpc: {
      async claim() {
        fake.claims.push(Date.now());
        if (broken) throw down();
        return fake.queue.shift() ?? null;
      },
      async begin(requestId, tier, provider, model) {
        if (broken) throw down();
        if (beginFails) throw new Error('workspace_begin: the request is not claimed');
        fake.begins.push({ requestId, tier, provider, model });
        return '9c9c9c9c-0000-4000-8000-000000000001';
      },
      async stream(requestId, seq, delta) {
        if (broken) throw down();
        fake.streams.push({ requestId, seq, delta, at: Date.now() });
        return !cancelled;
      },
      async finish(args) {
        if (broken) throw down();
        if (finishFailures > 0) {
          finishFailures -= 1;
          throw down();
        }
        fake.finishes.push(args);
      },
      async heartbeat(runner) {
        if (broken) throw down();
        fake.heartbeats.push({ runner, at: Date.now() });
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
  const body = options.lines.map((line) => `${JSON.stringify(line)}\n`).join('');
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
