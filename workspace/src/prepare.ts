/**
 * Everything a question needs before the answering model starts (brief 109, The question's path,
 * steps 6 to 10): the planning turn, the retrieval and the feed, the assembled prompt, and the
 * facts and sources stored before the answer begins.
 *
 *   plan      only on `mid` or `high` with a budget of at least 0.10: one `haiku` turn, no tool, no MCP
 *             server, 0.05 and 20 s. Text that is not a plan, a timeout or a budget stop gives the
 *             fallback plan; `sign_in_expired` or `usage_limit` fails the request and starts nothing more;
 *   retrieve  the plan, or the fallback, through the batch child, and the feed, side by side;
 *   assemble  one prompt from stored rows and retrieved data, every block fenced;
 *   store     `workspace_turn_put` with the facts and the sources, before the answer.
 *
 * A planning turn never fails the answer. A stop at any point ends this early with `stopped`.
 */

import {
  PLAN_BUDGET_USD,
  PLAN_MIN_TURN_BUDGET_USD,
  PLAN_MODEL,
  PLAN_TIMEOUT_MS,
  TOOL_QUERY_MAX_CHARS,
} from './config.js';
import { assemblePrompt, type Assembled } from './context/assemble.js';
import { parseFeed, type Feed } from './context/feed.js';
import { newMarker as defaultMarker } from './context/fence.js';
import type { Claim, SourceRow, TurnFacts, WorkspaceRpc } from './db.js';
import { messageOf, type ErrorCode } from './errors.js';
import { LINES } from './lines.js';
import { fallbackPlan, parsePlan, planInput, previousUserMessage, type Plan } from './plan.js';
import { answerSystemPrompt, formatPromptName, type ReadPrompt } from './prompts.js';
import type { Providers } from './providers/index.js';
import type { ResultEvent, StoredToolCall, TurnInput } from './providers/types.js';
import type { Retriever, RetrieveResult } from './retrieve.js';
import { promptSourceRows } from './sources.js';
import type { Tier } from './tiers.js';
import { TIER_ROUTES } from './tiers.js';
import type { TurnContext } from './turn-context.js';
import { turnLimits, type TurnLimits } from './mcp-config.js';

const USD_DECIMALS = 100;

export interface PrepareDeps {
  readonly rpc: WorkspaceRpc;
  readonly providers: Providers;
  readonly retrieve: Retriever;
  readonly readPrompt: ReadPrompt;
  readonly newMarker?: () => string;
  readonly runnerName: string;
  /** The per-answer cost cap before the planning turn's share is taken out. */
  readonly budgetUsd: number;
  readonly now: () => number;
  readonly log: (line: string) => void;
}

export interface PrepareInput {
  readonly claim: Claim;
  readonly context: TurnContext;
  readonly tier: Tier;
  /** The turn's own signal: the owner's Stop, the time limit, a shutdown. */
  readonly signal: AbortSignal;
}

export interface Ready {
  readonly kind: 'ready';
  /** The whole prompt argument of the answering turn. */
  readonly prompt: string;
  readonly systemPrompt: string;
  readonly answerBudgetUsd: number;
  /** The limits the materials server is told: 3 searches after a planning turn, 4 without one. */
  readonly limits: TurnLimits;
  /** The fixed sentences that open the stored and streamed answer on format `plain`; empty otherwise. */
  readonly leadText: string;
  /** The rows already stored; the rows for opened units are added to them. */
  readonly sourceRows: readonly SourceRow[];
  /** The runner's own steps, ahead of the model's calls in `tool_calls`. */
  readonly runnerCalls: readonly StoredToolCall[];
  readonly messagesLeftOut: number;
}

export type Prepared = Ready | { readonly kind: 'stopped' } | { readonly kind: 'failed'; readonly errorCode: ErrorCode };

type PlanStep =
  | { readonly kind: 'done'; readonly state: TurnFacts['planState']; readonly plan: Plan; readonly costUsd: number; readonly ms: number }
  | { readonly kind: 'stopped' }
  | { readonly kind: 'failed'; readonly errorCode: ErrorCode };

/** Codes of a planning turn that end the request: the sign-in or the plan's limit will fail the answer too. */
const PLAN_FATAL_CODES: readonly ErrorCode[] = ['sign_in_expired', 'usage_limit'];

const roundUsd = (usd: number): number => Math.round(usd * USD_DECIMALS) / USD_DECIMALS;

interface PlanRun {
  readonly text: string;
  readonly result: ResultEvent | null;
  readonly timedOut: boolean;
}

/** The planning turn: its own 20 s, and the turn's signal ends it early. */
async function runPlanTurn(deps: PrepareDeps, input: TurnInput, signal: AbortSignal): Promise<PlanRun> {
  const own = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    own.abort();
  }, PLAN_TIMEOUT_MS);
  const relay = (): void => own.abort();
  if (signal.aborted) own.abort();
  else signal.addEventListener('abort', relay, { once: true });
  let text = '';
  let result: ResultEvent | null = null;
  try {
    for await (const event of deps.providers[TIER_ROUTES.low.provider].runTurn(input, own.signal)) {
      if (event.type === 'delta') text += event.text;
      else if (event.type === 'result') result = event;
    }
  } catch (error) {
    deps.log(`plan: the provider failed: ${messageOf(error)}`);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', relay);
  }
  return { text, result, timedOut };
}

async function planStep(deps: PrepareDeps, input: PrepareInput, marker: string): Promise<PlanStep> {
  const { claim, context, tier, signal } = input;
  const fallback = fallbackPlan(claim.prompt, previousUserMessage(context.messages));
  const eligible = (tier === 'mid' || tier === 'high') && deps.budgetUsd >= PLAN_MIN_TURN_BUDGET_USD;
  if (!eligible) return { kind: 'done', state: 'skipped', plan: fallback, costUsd: 0, ms: 0 };

  const started = deps.now();
  const scope = context.options.courseIds;
  const turn: TurnInput = {
    requestId: claim.requestId,
    kind: 'plan',
    model: PLAN_MODEL,
    prompt: planInput({
      marker,
      question: claim.prompt,
      rollingSummary: context.rollingSummary,
      messages: context.messages,
      courses: context.courses,
      scope,
      attachmentTitles: context.attachments.map((attachment) => attachment.title),
      today: context.today,
      deep: context.options.depth === 'deep',
    }),
    systemPrompt: deps.readPrompt('plan'),
    budgetUsd: PLAN_BUDGET_USD,
  };
  const run = await runPlanTurn(deps, turn, signal);
  const ms = Math.round(deps.now() - started);
  if (signal.aborted) return { kind: 'stopped' };
  const costUsd = run.result?.costUsd ?? 0;
  const code = run.result?.errorCode ?? null;
  if (!run.timedOut && code !== null && PLAN_FATAL_CODES.includes(code)) {
    deps.log(`plan: the request fails, the planning turn ended with ${code}`);
    return { kind: 'failed', errorCode: code };
  }
  const fall = (why: string): PlanStep => {
    deps.log(`plan: fallback, ${why} ms=${ms}`);
    return { kind: 'done', state: 'fallback', plan: fallback, costUsd, ms };
  };
  if (run.timedOut) return fall('the planning turn ran out of time');
  if (run.result === null || !run.result.ok) return fall(`the planning turn ended with ${code ?? 'no result'}`);
  const parsed = parsePlan(run.text, {
    scope,
    knownCourses: context.courses.map((course) => course.id),
    deep: context.options.depth === 'deep',
    today: context.today,
  });
  if (!parsed.ok) return fall(`rejected length=${parsed.length} class=${parsed.reason}`);
  deps.log(`plan: planned queries=${parsed.plan.queries.length} ms=${ms} cost=${costUsd}`);
  return { kind: 'done', state: 'planned', plan: parsed.plan, costUsd, ms };
}

async function loadFeed(deps: PrepareDeps, claim: Claim, plan: Plan): Promise<Feed | null> {
  try {
    const feed = parseFeed(await deps.rpc.plannerFeed(claim.requestId, deps.runnerName, plan.feed.from, plan.feed.to));
    if (feed === null) deps.log('feed: the function returned no usable feed');
    return feed;
  } catch (error) {
    deps.log(`feed: failed: ${messageOf(error)}`);
    return null;
  }
}

function retrievalStateOf(retrieved: RetrieveResult, assembled: Assembled): TurnFacts['retrievalState'] {
  if (retrieved.state !== 'ok') return 'failed';
  if (assembled.passages.length + assembled.memory.length > 0) return 'found';
  return assembled.attachments.some((attachment) => attachment.state === 'read' || attachment.state === 'cut') ? 'attached_only' : 'empty';
}

/** The fixed sentences that open an answer on format `plain`: nothing matched, search failed, files not read. */
function leadTextOf(state: TurnFacts['retrievalState'], assembled: Assembled): string {
  const lines = [...(state === 'failed' ? [LINES.search_failed] : state === 'empty' ? [LINES.empty] : []), ...assembled.attachmentLines];
  return lines.length === 0 ? '' : `${lines.join('\n')}\n\n`;
}

function runnerCallsOf(context: TurnContext, plan: Plan, searchOk: boolean, feedOk: boolean): StoredToolCall[] {
  const first = plan.queries[0]?.q ?? '';
  return [
    { tool: 'search', query: [...first].slice(0, TOOL_QUERY_MAX_CHARS).join(''), scope: context.options.courseDisplayId, ok: searchOk },
    { tool: 'planner_feed', query: null, scope: null, ok: feedOk },
  ];
}

export async function prepareTurn(deps: PrepareDeps, input: PrepareInput): Promise<Prepared> {
  const { claim, context, signal } = input;
  const marker = (deps.newMarker ?? defaultMarker)();
  const plan = await planStep(deps, input, marker);
  if (plan.kind !== 'done') return plan;

  const retrieveStarted = deps.now();
  const [retrieved, feed] = await Promise.all([
    deps.retrieve({
      plan: plan.plan,
      scope: context.options.courseIds,
      attachments: context.attachments.map((attachment) => ({ kind: attachment.kind, id: attachment.id })),
      signal,
    }),
    loadFeed(deps, claim, plan.plan),
  ]);
  if (signal.aborted) return { kind: 'stopped' };

  const assembled = assemblePrompt({ marker, question: claim.prompt, context, hits: retrieved.hits, attachmentReads: retrieved.attachments, feed });
  const retrievalState = retrievalStateOf(retrieved, assembled);
  const sourceRows = promptSourceRows({ passages: assembled.passages, memory: assembled.memory, feedIncluded: assembled.feedIncluded, attachments: assembled.attachments });
  const facts: TurnFacts = {
    depth: context.options.depth,
    tier: input.tier,
    planState: plan.state,
    retrievalState,
    foundN: retrieved.found,
    passagesN: assembled.passages.length,
    memoryN: assembled.memory.length,
    feedRows: assembled.feedRows,
    attachments: assembled.attachments.map((attachment) => ({ kind: attachment.kind, id: attachment.id, state: attachment.state })),
    promptBytes: assembled.bytes,
    planMs: plan.ms,
    retrievalMs: Math.round(deps.now() - retrieveStarted),
    planCostUsd: plan.costUsd,
  };
  try {
    await deps.rpc.turnPut(claim.requestId, deps.runnerName, facts, sourceRows);
  } catch (error) {
    deps.log(`turn_put failed, the answer goes on: ${messageOf(error)}`);
  }
  deps.log(
    `prepared plan=${plan.state} retrieval=${retrievalState} found=${retrieved.found} passages=${assembled.passages.length} memory=${assembled.memory.length} ` +
      `feed_rows=${assembled.feedRows} bytes=${assembled.bytes} blocks=${assembled.blocks} messages_left_out=${assembled.messagesLeftOut + context.messagesLeftOut}`,
  );
  const planned = plan.state !== 'skipped';
  return {
    kind: 'ready',
    prompt: assembled.prompt,
    systemPrompt: answerSystemPrompt({
      system: deps.readPrompt('system'),
      format: deps.readPrompt(formatPromptName(context.options.format)),
      routine: context.routine,
      aboutMe: context.aboutMe,
    }),
    answerBudgetUsd: planned ? roundUsd(deps.budgetUsd - PLAN_BUDGET_USD) : deps.budgetUsd,
    limits: turnLimits(planned, context.options.courseIds),
    leadText: context.options.format === 'plain' ? leadTextOf(retrievalState, assembled) : '',
    sourceRows,
    runnerCalls: runnerCallsOf(context, plan.plan, retrieved.state === 'ok', feed !== null),
    messagesLeftOut: assembled.messagesLeftOut + context.messagesLeftOut,
  };
}
