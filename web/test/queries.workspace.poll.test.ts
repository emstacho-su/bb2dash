/**
 * The Workspace's open states, and the poll they decide (Phase 21, the review
 * round of 2026-10-06; ruling V4, findings CR-12 and CR-9).
 *
 * CR-12. A request is open while it is `queued` or `claimed`. That pair was
 * written out twice under `src/` (the query layer and the thread), so the two
 * could drift apart. It has one definition (`lib/workspace-poll.ts`, exported
 * through the query layer), and the audit below reads the Workspace's source
 * files so a second copy cannot come back unnoticed.
 *
 * CR-9. After Stop the stored partial answer was fetched by two fixed timers,
 * armed only when the row the page held already read `claimed`. They are gone.
 * The messages query polls every 5 s while a request is open, and also while
 * the newest request has closed with its assistant row still unfinished, for
 * 60 s from the moment the page first saw it so. The 60 s is counted on the
 * page's own monotonic clock: the database's `finished_at` is never set beside
 * the browser's wall clock (that was CR-8's fault).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => {
    throw new Error('this file reads no row');
  },
}));

const workspace = await import('@/lib/queries.workspace');
const { messagesOptions, normalizeMessage, normalizeRequest, openRequestOf } = workspace;

const CONVERSATION = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const QUESTION = '0b0fe08b-1d79-41a7-9674-2a3de0b4986e';
const START = Date.parse('2026-10-06T15:00:00Z');
const ONE_HOUR_MS = 60 * 60_000;

type Request = NonNullable<ReturnType<typeof normalizeRequest>>;
type Message = NonNullable<ReturnType<typeof normalizeMessage>>;

function request(id: number, state: string): Request {
  const row = normalizeRequest({
    id,
    conversation_id: CONVERSATION,
    user_message_id: QUESTION,
    state,
  });
  if (row === null) throw new Error(`not a request: ${id} ${state}`);
  return row;
}

function message(fields: Record<string, unknown>): Message {
  const row = normalizeMessage({ conversation_id: CONVERSATION, ...fields });
  if (row === null) throw new Error(`not a message: ${JSON.stringify(fields)}`);
  return row;
}

/** The assistant row of request `requestId`: a uuid per request, finished or not. */
function answer(requestId: number, finished: boolean): Message {
  return message({
    id: `a7c1d2e3-55aa-4f10-b1d2-${String(requestId).padStart(12, '0')}`,
    role: 'assistant',
    request_id: requestId,
    content: finished ? 'Week one: Monday' : '',
    finished,
  });
}

const QUESTION_ROW = message({
  id: QUESTION,
  role: 'user',
  content: 'Draft a two-week study plan.',
  finished: true,
});

/* ---------------------------------------------------------------------------
 * CR-12: one definition of the open states
 * ------------------------------------------------------------------------ */

// `process.cwd()` rather than `import.meta.url`, as `audits.test.ts` explains:
// under jsdom the module URL is an http one. Vitest runs from `web/`.
const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** A source path the way the repo writes it: forward slashes, from `src/`. */
function fromSrc(file: string): string {
  return relative(SRC, file).split(sep).join('/');
}

/**
 * The Workspace's own source: its route, its components and its `lib` modules.
 * `queries.sync.ts` is left out on purpose. It names the same two words for
 * another table (`agent_requests`, the sync queue), which is not this rule.
 */
const WORKSPACE_SOURCE = walk(SRC)
  .map(fromSrc)
  .filter((file) => /(^|\/)workspace\/|(^|\/)lib\/[^/]*workspace[^/]*$/.test(file))
  .filter((file) => /\.tsx?$/.test(file));

/** The pair written out as an array literal, in either quote style. */
const OPEN_STATES_LITERAL = /\[\s*['"]queued['"]\s*,\s*['"]claimed['"]\s*,?\s*\]/;

describe('the open states have one definition (CR-12)', () => {
  it('is exported from the query layer: queued and claimed, nothing else', () => {
    expect(workspace.WORKSPACE_OPEN_STATES).toEqual(['queued', 'claimed']);
  });

  it('is what the open request is picked by', () => {
    const states = ['queued', 'claimed', 'done', 'failed', 'cancelled'];
    const open = states.filter((state) => openRequestOf([request(1, state)]) !== null);
    expect(open).toEqual(workspace.WORKSPACE_OPEN_STATES);
  });

  it('finds the Workspace`s source files to read', () => {
    expect(WORKSPACE_SOURCE).toContain('lib/queries.workspace.ts');
    expect(WORKSPACE_SOURCE).toContain('components/workspace/thread.ts');
    expect(WORKSPACE_SOURCE).toContain('app/(app)/workspace/Workspace.tsx');
  });

  it('is written out once under src/: every other file imports it', () => {
    const writtenIn = WORKSPACE_SOURCE.filter((file) =>
      OPEN_STATES_LITERAL.test(readFileSync(join(SRC, file), 'utf8')),
    );
    expect(writtenIn).toEqual(['lib/workspace-poll.ts']);
  });
});

/* ---------------------------------------------------------------------------
 * CR-9: which closed request is still owed its stored answer
 * ------------------------------------------------------------------------ */

describe('unstoredClosedRequestOf: the newest request, closed, its assistant row unfinished (CR-9)', () => {
  const owed = (requests: Request[] | undefined, messages: Message[] | undefined) =>
    workspace.unstoredClosedRequestOf(requests, messages);

  it.each(['cancelled', 'failed', 'done'])(
    'is the newest request when it is %s and its assistant row is unfinished',
    (state) => {
      const newest = request(42, state);
      expect(owed([request(41, 'done'), newest], [QUESTION_ROW, answer(42, false)])).toBe(newest);
    },
  );

  it('is nothing once the stored row has landed', () => {
    expect(owed([request(42, 'cancelled')], [QUESTION_ROW, answer(42, true)])).toBeNull();
  });

  it('is nothing for a closed request with no assistant row: the runner never began it', () => {
    expect(owed([request(42, 'cancelled')], [QUESTION_ROW])).toBeNull();
    expect(owed([request(42, 'cancelled')], [])).toBeNull();
    expect(owed([request(42, 'cancelled')], undefined)).toBeNull();
  });

  it.each(['queued', 'claimed'])('is nothing while the newest request is %s: that poll is the open one', (state) => {
    expect(owed([request(42, state)], [QUESTION_ROW, answer(42, false)])).toBeNull();
  });

  it('looks at the newest request only: an older unfinished row is not waited for', () => {
    const rows = [answer(41, false), answer(42, true)];
    expect(owed([request(41, 'cancelled'), request(42, 'done')], rows)).toBeNull();
  });

  it('is nothing with no requests', () => {
    expect(owed([], [answer(42, false)])).toBeNull();
    expect(owed(undefined, [answer(42, false)])).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * CR-9: the interval of the messages query
 * ------------------------------------------------------------------------ */

/** What TanStack hands a `refetchInterval` function: the messages query. One object per query. */
function queryHolding(messages: Message[] | undefined) {
  return { state: { data: messages } };
}

/** The interval `messagesOptions` gives for these requests, asked of `query`. */
function intervalOf(requests: Request[] | undefined, query: object): unknown {
  const interval: unknown = messagesOptions(CONVERSATION, requests).refetchInterval;
  if (typeof interval !== 'function') throw new Error('refetchInterval is not a function of the query');
  return interval(query);
}

describe('messagesOptions: polled every 5 s while a request is open (CR-9)', () => {
  it.each(['queued', 'claimed'])('polls while the newest request is %s, whatever rows it holds', (state) => {
    const requests = [request(41, 'done'), request(42, state)];
    expect(intervalOf(requests, queryHolding(undefined))).toBe(5_000);
    expect(intervalOf(requests, queryHolding([QUESTION_ROW]))).toBe(5_000);
    expect(intervalOf(requests, queryHolding([QUESTION_ROW, answer(42, false)]))).toBe(5_000);
  });

  it('does not poll with nothing open and nothing owed', () => {
    expect(intervalOf([], queryHolding([]))).toBe(false);
    expect(intervalOf(undefined, queryHolding(undefined))).toBe(false);
    expect(intervalOf([request(42, 'done')], queryHolding([QUESTION_ROW, answer(42, true)]))).toBe(false);
    expect(intervalOf([request(42, 'cancelled')], queryHolding([QUESTION_ROW]))).toBe(false);
  });
});

describe('messagesOptions: and for 60 s after a request closes with its answer unstored (CR-9)', () => {
  const STOPPED = [request(42, 'cancelled')];
  const PARTIAL = [QUESTION_ROW, answer(42, false)];

  beforeEach(() => {
    vi.useFakeTimers({ now: START });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses 60 s', () => {
    expect(workspace.WORKSPACE_CLOSED_POLL_MS).toBe(60_000);
  });

  it('polls from the moment the query first sees it, and stops by itself 60 s later', () => {
    const query = queryHolding(PARTIAL);

    expect(intervalOf(STOPPED, query)).toBe(5_000);
    vi.advanceTimersByTime(59_999);
    expect(intervalOf(STOPPED, query)).toBe(5_000);
    vi.advanceTimersByTime(1);
    expect(intervalOf(STOPPED, query)).toBe(false);

    // And it does not start again for the same request, however long the page stays.
    vi.advanceTimersByTime(ONE_HOUR_MS);
    expect(intervalOf(STOPPED, query)).toBe(false);
  });

  it('stops at once when the stored row lands', () => {
    const query = queryHolding(PARTIAL);
    expect(intervalOf(STOPPED, query)).toBe(5_000);

    vi.advanceTimersByTime(5_000);
    query.state.data = [QUESTION_ROW, answer(42, true)];

    expect(intervalOf(STOPPED, query)).toBe(false);
  });

  it('counts the 60 s on the page`s own clock: the system clock jumping does not end it or extend it', () => {
    const query = queryHolding(PARTIAL);
    expect(intervalOf(STOPPED, query)).toBe(5_000);

    vi.advanceTimersByTime(10_000);
    vi.setSystemTime(START + ONE_HOUR_MS);
    expect(intervalOf(STOPPED, query)).toBe(5_000);

    vi.advanceTimersByTime(49_999);
    vi.setSystemTime(START - ONE_HOUR_MS);
    expect(intervalOf(STOPPED, query)).toBe(5_000);
    vi.advanceTimersByTime(1);
    expect(intervalOf(STOPPED, query)).toBe(false);
  });

  it('does not read the request`s finished_at: a close stamped far from the browser`s clock polls the same', () => {
    const at = (finishedAt: string) => {
      const row = normalizeRequest({
        id: 42,
        conversation_id: CONVERSATION,
        user_message_id: QUESTION,
        state: 'cancelled',
        finished_at: finishedAt,
      });
      if (row === null) throw new Error('not a request');
      return [row];
    };

    // The database's clock ten minutes behind the browser's, and ten minutes ahead.
    expect(intervalOf(at('2026-10-06T14:50:00+00:00'), queryHolding(PARTIAL))).toBe(5_000);
    expect(intervalOf(at('2026-10-06T15:10:00+00:00'), queryHolding(PARTIAL))).toBe(5_000);
  });

  it('gives each conversation`s query its own 60 s', () => {
    const first = queryHolding(PARTIAL);
    expect(intervalOf(STOPPED, first)).toBe(5_000);
    vi.advanceTimersByTime(60_000);

    const second = queryHolding(PARTIAL);
    expect(intervalOf(STOPPED, first)).toBe(false);
    expect(intervalOf(STOPPED, second)).toBe(5_000);
  });

  it('starts again for a later request stopped in the same conversation', () => {
    const query = queryHolding(PARTIAL);
    expect(intervalOf(STOPPED, query)).toBe(5_000);
    vi.advanceTimersByTime(60_000);
    expect(intervalOf(STOPPED, query)).toBe(false);

    // A new question is asked and stopped mid-answer.
    const later = [request(42, 'cancelled'), request(43, 'cancelled')];
    query.state.data = [...PARTIAL, answer(43, false)];

    expect(intervalOf(later, query)).toBe(5_000);
    vi.advanceTimersByTime(59_999);
    expect(intervalOf(later, query)).toBe(5_000);
    vi.advanceTimersByTime(1);
    expect(intervalOf(later, query)).toBe(false);
  });
});
