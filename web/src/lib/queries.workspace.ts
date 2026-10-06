/**
 * bb2dash — Workspace query layer (Phase 21, task 15; P-86).
 *
 * The read/write contract for the Workspace's relations:
 *   `workspace_conversations`  the list (archived, never deleted)
 *   `workspace_messages`       the stored questions and answers
 *   `workspace_requests`       one row per question: queued, claimed, done, failed, cancelled
 *   `v_workspace_status`       one row: the runner's heartbeat
 *   `workspace_ask()`          a question (creates the conversation when it has none)
 *   `workspace_cancel()`       Stop
 *
 * Conventions follow queries.sync.ts: a key in `workspaceKeys`, an `xOptions()`
 * returning queryOptions, a `useX()` hook, throw on error, no fabricated
 * fallbacks.
 *
 * ROW TYPES. Migrations 140–142 are this phase's, so the checked-in
 * `database.types.ts` does not describe these objects and this module may not
 * edit it. The interfaces below are transcribed by hand from the frozen
 * Contract in `docs/planning/sprint-2/briefs/102_PHASE21_workspace.md`, and
 * they stay hand-declared after the types are regenerated (the
 * `queries.sync.ts` pattern).
 *
 * BOUNDARY VALIDATION. Nothing reaches Postgres unchecked: a question is
 * trimmed and measured, a conversation id must be a uuid, a request id a
 * positive integer. Nothing that comes back is trusted field by field either:
 * every row goes through a pure normaliser, so a missing or misshapen column
 * reads as null and a row that cannot be identified is dropped.
 *
 * WHAT IS NEVER READ. `claude_session_id` (the runner's), `cost_usd` (an
 * estimate that is never shown) and the tool results (never stored). The
 * select lists below name their columns for that reason.
 */

import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { asRecord } from './json-record';
import { untypedClient } from './queries.sync';
import { REFUSAL_QUESTION_LENGTH, REFUSAL_STILL_ANSWERING } from './workspace-labels';

/* ---------------------------------------------------------------------------
 * Constants
 * ------------------------------------------------------------------------ */

/** The longest question, in characters after trimming; `workspace_prompt_max()` returns it too. */
export const WORKSPACE_PROMPT_MAX = 8000;

/** How often the page re-reads `v_workspace_status`. */
export const WORKSPACE_STATUS_REFETCH_MS = 30_000;

/** How often the stored rows are re-read while a request is open (the polling fallback). */
export const WORKSPACE_MESSAGES_REFETCH_MS = 5_000;

/** A heartbeat older than this reads as offline. The runner beats every 30 s. */
export const WORKSPACE_OFFLINE_AFTER_MS = 120_000;

/** `workspace_messages.tool_calls` holds at most this many elements (140's check). */
export const WORKSPACE_TOOL_CALLS_MAX = 20;

/**
 * The messages, open-request and status queries re-read when the tab regains
 * focus, whatever the client's default is. TanStack does not run a
 * `refetchInterval` in a hidden tab (task 5's spike: a cancel went unseen for
 * 15 s there), so the interval alone can never be how the page learns that a
 * stream has ended: the `done` broadcast and this refetch are.
 */
const REFETCH_ON_FOCUS = 'always';

/** The cache-key slot used when no conversation is selected; that query never runs. */
const NO_CONVERSATION = 'none';

/* ---------------------------------------------------------------------------
 * Row types (hand-declared from the frozen Contract — see header)
 * ------------------------------------------------------------------------ */

/** `workspace_messages.role`. */
export type WorkspaceRole = 'user' | 'assistant';

/** `workspace_messages.tier`: which model level answered. */
export type WorkspaceTier = 'low' | 'mid' | 'high';

/** `workspace_requests.state`. */
export type WorkspaceRequestState = 'queued' | 'claimed' | 'done' | 'failed' | 'cancelled';

/** The eight codes 140 allows on a message and on a request. */
export type WorkspaceErrorCode =
  | 'budget_exceeded'
  | 'timeout'
  | 'stale_claim'
  | 'provider_not_configured'
  | 'cli_error'
  | 'cancelled'
  | 'usage_limit'
  | 'sign_in_expired';

const ROLES: readonly WorkspaceRole[] = ['user', 'assistant'];
const TIERS: readonly WorkspaceTier[] = ['low', 'mid', 'high'];
const REQUEST_STATES: readonly WorkspaceRequestState[] = [
  'queued',
  'claimed',
  'done',
  'failed',
  'cancelled',
];

/** The same eight at runtime, in the Contract's order. */
export const WORKSPACE_ERROR_CODES: readonly WorkspaceErrorCode[] = [
  'budget_exceeded',
  'timeout',
  'stale_claim',
  'provider_not_configured',
  'cli_error',
  'cancelled',
  'usage_limit',
  'sign_in_expired',
];

/** The two states in which a request is still open. */
const OPEN_STATES: readonly WorkspaceRequestState[] = ['queued', 'claimed'];

/** One row of `workspace_conversations`, without the runner's session id. */
export interface WorkspaceConversation {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  title: string;
  archived: boolean;
}

/** One element of `workspace_messages.tool_calls`. The tool's result is never stored. */
export interface WorkspaceToolCall {
  tool: string;
  query: string | null;
  scope: string | null;
  ok: boolean;
}

/** One row of `workspace_messages`, without the cost estimate. */
export interface WorkspaceMessage {
  id: string;
  conversation_id: string | null;
  role: WorkspaceRole;
  /** The request this assistant row answers; null on a user row. */
  request_id: number | null;
  tier: WorkspaceTier | null;
  content: string;
  tool_calls: WorkspaceToolCall[];
  finished: boolean;
  error_code: WorkspaceErrorCode | null;
  created_at: string | null;
}

/** One row of `workspace_requests`. */
export interface WorkspaceRequest {
  id: number;
  created_at: string | null;
  conversation_id: string | null;
  user_message_id: string | null;
  state: WorkspaceRequestState;
  claimed_at: string | null;
  finished_at: string | null;
  error_code: WorkspaceErrorCode | null;
}

/** The one row of `v_workspace_status`. `polled_at` is null before the first heartbeat. */
export interface WorkspaceStatus {
  polled_at: string | null;
  runner: string | null;
  open_requests: number;
  oldest_open_at: string | null;
}

/** What `workspace_ask()` answers with, normalised. */
export interface WorkspaceAskResult {
  conversationId: string;
  messageId: string;
  requestId: number;
}

/* ---------------------------------------------------------------------------
 * Cache keys
 * ------------------------------------------------------------------------ */

export const workspaceKeys = {
  /** Both lists (active and archived) sit under this prefix. */
  conversationsAll: () => ['workspace', 'conversations'] as const,
  conversations: (archived: boolean) =>
    ['workspace', 'conversations', archived ? 'archived' : 'active'] as const,
  messages: (conversationId: string) => ['workspace', 'messages', conversationId] as const,
  requests: (conversationId: string) => ['workspace', 'requests', conversationId] as const,
  status: () => ['workspace', 'status'] as const,
} as const;

/* ---------------------------------------------------------------------------
 * Input validation (pure — every read and write goes through these first)
 * ------------------------------------------------------------------------ */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DIGITS = /^[1-9]\d{0,15}$/;

/** A uuid in the lower case Postgres prints, or null for anything else. */
function toUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const lower = value.toLowerCase();
  return UUID.test(lower) ? lower : null;
}

/**
 * `?c=` must be a uuid. Anything else is no conversation, and the page holds
 * the lobby channel. The id comes back in lower case: the Realtime topic is
 * `workspace:<uuid>` as Postgres prints it, and a topic in another case would
 * join a channel nothing is ever sent to.
 */
export function parseConversationId(value: unknown): string | null {
  return toUuid(value);
}

/** A conversation id for a filter or an argument: a uuid, or an error. */
function assertConversationId(value: unknown): string {
  const id = parseConversationId(value);
  if (id === null) throw new Error(`conversation id must be a uuid, got ${String(value)}`);
  return id;
}

/**
 * A request id read off a row or a broadcast: a positive integer, as a number
 * or as digits, or null. Every comparison of two request ids goes through this
 * on both sides — a string beside a number would make each delta look like
 * another request's, and it would be dropped with no error.
 */
export function toRequestId(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && DIGITS.test(value)
        ? Number(value)
        : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

/** A request id on its way to Postgres: a positive integer, or an error (`assertRowId`'s rule). */
function assertRequestId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`request id must be a positive integer, got ${String(value)}`);
  }
  return value;
}

/** Why a question was refused. Each reason has one frozen sentence. */
export type WorkspaceRefusalReason = 'question_length' | 'still_answering';

const REFUSAL_SENTENCE: Record<WorkspaceRefusalReason, string> = {
  question_length: REFUSAL_QUESTION_LENGTH,
  still_answering: REFUSAL_STILL_ANSWERING,
};

/**
 * A question the page or the database refused. `message` is the sentence to
 * show as it is; any other error from `askWorkspace` is a fault, not a refusal.
 */
export class WorkspaceRefusal extends Error {
  readonly reason: WorkspaceRefusalReason;

  constructor(reason: WorkspaceRefusalReason) {
    super(REFUSAL_SENTENCE[reason]);
    this.name = 'WorkspaceRefusal';
    this.reason = reason;
  }
}

/**
 * The two SQLSTATEs `workspace_ask()` refuses with: 23505 from the unique index
 * `workspace_requests_one_open` (a second open request), 22023 raised by the
 * function itself (empty or over-long text).
 */
const REFUSAL_BY_SQLSTATE: ReadonlyMap<string, WorkspaceRefusalReason> = new Map([
  ['23505', 'still_answering'],
  ['22023', 'question_length'],
]);

/** The refusal a database error stands for, or null when it is some other fault. */
export function refusalFor(error: unknown): WorkspaceRefusal | null {
  const code = asRecord(error)?.code;
  const reason = typeof code === 'string' ? REFUSAL_BY_SQLSTATE.get(code) : undefined;
  return reason === undefined ? null : new WorkspaceRefusal(reason);
}

/**
 * SQLSTATE 23503 from `workspace_ask()`: the foreign key refused a conversation
 * id that does not exist (a `?c=` typed by hand, or a stale link). It is not a
 * refusal of the question, so it has neither frozen sentence; the screen says
 * the conversation could not be loaded.
 */
const SQLSTATE_FOREIGN_KEY = '23503';

export function isMissingConversation(error: unknown): boolean {
  return asRecord(error)?.code === SQLSTATE_FOREIGN_KEY;
}

/** What is said when a failure carries no message of its own. */
const NO_REASON = 'no reason given';

/**
 * Why a read or a write failed, in the words it came with. A PostgREST error
 * can reach here as a plain object with a `message`, not an `Error`, so both
 * are read.
 */
export function workspaceErrorReason(error: unknown): string {
  const message = error instanceof Error ? error.message : asRecord(error)?.message;
  return typeof message === 'string' && message !== '' ? message : NO_REASON;
}

/**
 * Characters as `char_length()` counts them: code points, not UTF-16 units, so
 * the page and the database agree on a question that holds emoji.
 */
function characterCount(text: string): number {
  // A code point is at most two units: past twice the cap there is no need to count.
  if (text.length > 2 * WORKSPACE_PROMPT_MAX) return text.length;
  return Array.from(text).length;
}

/**
 * Trim a question and refuse it, empty or over 8000 characters, before any
 * request is sent. The database makes the same check (22023).
 */
export function parseQuestion(text: unknown): string {
  if (typeof text !== 'string') throw new WorkspaceRefusal('question_length');
  const trimmed = text.trim();
  const length = characterCount(trimmed);
  if (length < 1 || length > WORKSPACE_PROMPT_MAX) throw new WorkspaceRefusal('question_length');
  return trimmed;
}

/* ---------------------------------------------------------------------------
 * Normalisers (pure — trust nothing about a row's inner shape)
 * ------------------------------------------------------------------------ */

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function normalizeRows<T>(data: unknown, normalize: (row: unknown) => T | null): T[] {
  if (!Array.isArray(data)) return [];
  const out: T[] = [];
  for (const row of data) {
    const normalized = normalize(row);
    if (normalized !== null) out.push(normalized);
  }
  return out;
}

/** One `workspace_conversations` row; null when it has no uuid id. */
export function normalizeConversation(row: unknown): WorkspaceConversation | null {
  const raw = asRecord(row);
  const id = parseConversationId(raw?.id);
  if (!raw || id === null) return null;
  return {
    id,
    created_at: textOrNull(raw.created_at),
    updated_at: textOrNull(raw.updated_at),
    title: typeof raw.title === 'string' ? raw.title : '',
    archived: raw.archived === true,
  };
}

/**
 * `tool_calls` as the Contract shapes it: `{tool, query, scope, ok}` in call
 * order, at most 20. The database checks only the array and its length, so each
 * element is read here: one with no tool name is dropped, a key that is not
 * text reads as null, and `ok` is true only when it is exactly `true`. No other
 * key is kept.
 */
export function normalizeToolCalls(value: unknown): WorkspaceToolCall[] {
  if (!Array.isArray(value)) return [];
  const out: WorkspaceToolCall[] = [];
  for (const entry of value) {
    if (out.length >= WORKSPACE_TOOL_CALLS_MAX) break;
    const raw = asRecord(entry);
    const tool = textOrNull(raw?.tool);
    if (!raw || tool === null) continue;
    out.push({
      tool,
      query: typeof raw.query === 'string' ? raw.query : null,
      scope: typeof raw.scope === 'string' ? raw.scope : null,
      ok: raw.ok === true,
    });
  }
  return out;
}

/** One `workspace_messages` row; null when it has no uuid id or no known role. */
export function normalizeMessage(row: unknown): WorkspaceMessage | null {
  const raw = asRecord(row);
  const id = toUuid(raw?.id);
  const role = oneOf(ROLES, raw?.role);
  if (!raw || id === null || role === null) return null;
  return {
    id,
    conversation_id: parseConversationId(raw.conversation_id),
    role,
    request_id: toRequestId(raw.request_id),
    tier: oneOf(TIERS, raw.tier),
    content: typeof raw.content === 'string' ? raw.content : '',
    tool_calls: normalizeToolCalls(raw.tool_calls),
    finished: raw.finished === true,
    error_code: oneOf(WORKSPACE_ERROR_CODES, raw.error_code),
    created_at: textOrNull(raw.created_at),
  };
}

/** One `workspace_requests` row; null when it has no id or no known state. */
export function normalizeRequest(row: unknown): WorkspaceRequest | null {
  const raw = asRecord(row);
  const id = toRequestId(raw?.id);
  const state = oneOf(REQUEST_STATES, raw?.state);
  if (!raw || id === null || state === null) return null;
  return {
    id,
    created_at: textOrNull(raw.created_at),
    conversation_id: parseConversationId(raw.conversation_id),
    user_message_id: toUuid(raw.user_message_id),
    state,
    claimed_at: textOrNull(raw.claimed_at),
    finished_at: textOrNull(raw.finished_at),
    error_code: oneOf(WORKSPACE_ERROR_CODES, raw.error_code),
  };
}

/**
 * The one row of `v_workspace_status`. The view always returns exactly one
 * row; a missing one reads the way the row does before the first heartbeat.
 */
export function normalizeStatus(row: unknown): WorkspaceStatus {
  const raw = asRecord(row) ?? {};
  const counted = raw.open_requests;
  const open = typeof counted === 'string' ? Number(counted) : counted;
  return {
    polled_at: textOrNull(raw.polled_at),
    runner: textOrNull(raw.runner),
    open_requests: typeof open === 'number' && Number.isSafeInteger(open) && open > 0 ? open : 0,
    oldest_open_at: textOrNull(raw.oldest_open_at),
  };
}

/** What `workspace_ask()` returned, or an error when an id is missing. */
function normalizeAskResult(data: unknown): WorkspaceAskResult {
  const raw = asRecord(data);
  const conversationId = parseConversationId(raw?.conversation_id);
  const messageId = toUuid(raw?.message_id);
  const requestId = toRequestId(raw?.request_id);
  if (conversationId === null || messageId === null || requestId === null) {
    throw new Error('workspace_ask did not return the three ids');
  }
  return { conversationId, messageId, requestId };
}

/* ---------------------------------------------------------------------------
 * Reading the rows (pure)
 * ------------------------------------------------------------------------ */

/**
 * The conversation's open request (`queued` or `claimed`), or null. The unique
 * index `workspace_requests_one_open` allows one at most; the newest wins if a
 * cached list ever held two.
 */
export function openRequestOf(
  requests: readonly WorkspaceRequest[] | null | undefined,
): WorkspaceRequest | null {
  if (!requests) return null;
  for (let index = requests.length - 1; index >= 0; index -= 1) {
    if (OPEN_STATES.includes(requests[index].state)) return requests[index];
  }
  return null;
}

/**
 * Offline: the heartbeat is null (never polled) or more than 120 s old. A time
 * that cannot be read is treated as no heartbeat.
 */
export function isWorkspaceOffline(
  status: Pick<WorkspaceStatus, 'polled_at'>,
  nowMs: number,
): boolean {
  if (status.polled_at === null) return true;
  const polledMs = Date.parse(status.polled_at);
  if (!Number.isFinite(polledMs)) return true;
  return nowMs - polledMs > WORKSPACE_OFFLINE_AFTER_MS;
}

/* ---------------------------------------------------------------------------
 * Queries
 * ------------------------------------------------------------------------ */

const CONVERSATION_COLUMNS = 'id, created_at, updated_at, title, archived';

const MESSAGE_COLUMNS =
  'id, conversation_id, role, request_id, tier, content, tool_calls, finished, ' +
  'error_code, created_at';

const REQUEST_COLUMNS =
  'id, created_at, conversation_id, user_message_id, state, claimed_at, finished_at, error_code';

const STATUS_COLUMNS = 'polled_at, runner, open_requests, oldest_open_at';

/**
 * The conversation list, newest activity first. By default only conversations
 * that are not archived; the archived ones only when they are asked for (the
 * "Show archived" toggle), under their own key.
 */
export function conversationsOptions(archived = false) {
  return queryOptions({
    queryKey: workspaceKeys.conversations(archived),
    queryFn: async (): Promise<WorkspaceConversation[]> => {
      const { data, error } = await untypedClient()
        .from('workspace_conversations')
        .select(CONVERSATION_COLUMNS)
        .eq('archived', archived)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return normalizeRows(data, normalizeConversation);
    },
  });
}

/**
 * One conversation's stored messages, oldest first.
 *
 * While a request is open this refetches every 5 s: a missed broadcast costs
 * live text, never the answer, because the stored row is the record. `staleTime`
 * is 0 so a reload refetches on mount instead of trusting the restored cache
 * (the app's default is 60 s). `requestOpen` is not part of the key: it changes
 * how often the one cache entry is re-read, not what it holds.
 */
export function messagesOptions(conversationId: string | null, requestOpen: boolean) {
  return queryOptions({
    queryKey: workspaceKeys.messages(conversationId ?? NO_CONVERSATION),
    enabled: parseConversationId(conversationId) !== null,
    queryFn: async (): Promise<WorkspaceMessage[]> => {
      const id = assertConversationId(conversationId);
      const { data, error } = await untypedClient()
        .from('workspace_messages')
        .select(MESSAGE_COLUMNS)
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return normalizeRows(data, normalizeMessage);
    },
    refetchInterval: requestOpen ? WORKSPACE_MESSAGES_REFETCH_MS : false,
    refetchOnWindowFocus: REFETCH_ON_FOCUS,
    staleTime: 0,
  });
}

/**
 * The open-request query: one conversation's requests in id order, from which
 * `openRequestOf()` picks the one still `queued` or `claimed`. The whole list
 * is read because the state under each question comes from its request row.
 * It polls every 5 s only while one of them is open, like the messages.
 */
export function requestsOptions(conversationId: string | null) {
  return queryOptions({
    queryKey: workspaceKeys.requests(conversationId ?? NO_CONVERSATION),
    enabled: parseConversationId(conversationId) !== null,
    queryFn: async (): Promise<WorkspaceRequest[]> => {
      const id = assertConversationId(conversationId);
      const { data, error } = await untypedClient()
        .from('workspace_requests')
        .select(REQUEST_COLUMNS)
        .eq('conversation_id', id)
        .order('id', { ascending: true });
      if (error) throw error;
      return normalizeRows(data, normalizeRequest);
    },
    refetchInterval: (query) =>
      openRequestOf(query.state.data) === null ? false : WORKSPACE_MESSAGES_REFETCH_MS,
    refetchOnWindowFocus: REFETCH_ON_FOCUS,
    staleTime: 0,
  });
}

/** `v_workspace_status`: the runner's heartbeat, re-read every 30 s. */
export function statusOptions() {
  return queryOptions({
    queryKey: workspaceKeys.status(),
    queryFn: async (): Promise<WorkspaceStatus> => {
      const { data, error } = await untypedClient()
        .from('v_workspace_status')
        .select(STATUS_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      return normalizeStatus(data);
    },
    refetchInterval: WORKSPACE_STATUS_REFETCH_MS,
    refetchOnWindowFocus: REFETCH_ON_FOCUS,
    staleTime: 0,
  });
}

/* ---------------------------------------------------------------------------
 * Writes
 * ------------------------------------------------------------------------ */

export interface AskWorkspaceInput {
  /** Null for a first question: `workspace_ask()` then creates the conversation. */
  conversationId: string | null;
  text: string;
}

/**
 * Ask a question. The text is trimmed and measured here first, so an empty or
 * over-long one never leaves the page; the database refuses the same text
 * (22023) and a second open request in the conversation (23505), and both come
 * back as a `WorkspaceRefusal` carrying their sentence.
 */
export async function askWorkspace(input: AskWorkspaceInput): Promise<WorkspaceAskResult> {
  const text = parseQuestion(input.text);
  const conversationId =
    input.conversationId === null ? null : assertConversationId(input.conversationId);

  const { data, error } = await untypedClient().rpc('workspace_ask', {
    p_conversation_id: conversationId,
    p_text: text,
  });
  if (error) throw refusalFor(error) ?? error;
  return normalizeAskResult(data);
}

/**
 * Stop: `queued` or `claimed` becomes `cancelled`. True when a row changed,
 * false when the request had already finished.
 */
export async function cancelWorkspaceRequest(requestId: number): Promise<boolean> {
  const id = assertRequestId(requestId);
  const { data, error } = await untypedClient().rpc('workspace_cancel', { p_request_id: id });
  if (error) throw error;
  return data === true;
}

export interface SetConversationArchivedInput {
  conversationId: string;
  archived: boolean;
}

/** Archive or unarchive one conversation. v1 has no Delete. */
export async function setConversationArchived(input: SetConversationArchivedInput): Promise<void> {
  const id = assertConversationId(input.conversationId);
  if (typeof input.archived !== 'boolean') throw new Error('archived must be true or false');
  const { error } = await untypedClient()
    .from('workspace_conversations')
    .update({ archived: input.archived })
    .eq('id', id);
  if (error) throw error;
}

/**
 * What a question, a Stop or a finished answer moves: the list (its order and
 * a new title), and that conversation's messages and requests. One body for
 * every caller, the stream's `done` event among them.
 */
export function invalidateWorkspaceConversation(
  queryClient: QueryClient,
  conversationId: string | null,
): void {
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.conversationsAll() });
  if (conversationId === null) return;
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.messages(conversationId) });
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.requests(conversationId) });
}

/* ---------------------------------------------------------------------------
 * Hooks
 * ------------------------------------------------------------------------ */

export function useWorkspaceConversations(archived = false) {
  return useQuery(conversationsOptions(archived));
}

export function useWorkspaceMessages(conversationId: string | null, requestOpen: boolean) {
  return useQuery(messagesOptions(conversationId, requestOpen));
}

export function useWorkspaceRequests(conversationId: string | null) {
  return useQuery(requestsOptions(conversationId));
}

export function useWorkspaceStatus() {
  return useQuery(statusOptions());
}

/**
 * Ask, then refresh the conversation. A refused question refreshes it too: the
 * usual reason is an open request this page had not seen yet.
 */
export function useAskWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: askWorkspace,
    onSettled: (data, _error, variables) => {
      const conversationId =
        data?.conversationId ?? parseConversationId(variables.conversationId);
      invalidateWorkspaceConversation(queryClient, conversationId);
    },
  });
}

/** Stop, then refresh the conversation the request belongs to. */
export function useCancelWorkspaceRequest(conversationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelWorkspaceRequest,
    onSettled: () => invalidateWorkspaceConversation(queryClient, conversationId),
  });
}

/** Archive or unarchive, then refresh both lists. */
export function useSetConversationArchived() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: setConversationArchived,
    onSettled: () => invalidateWorkspaceConversation(queryClient, null),
  });
}
