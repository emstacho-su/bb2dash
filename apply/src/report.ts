/**
 * The request's result (Phase 23). Pure.
 *
 * Everything here is read from the tables (`inbox_apply_run_facts`, migration 181) and from the
 * CLI's exit, never from what Claude wrote: an item is "applied" because its row is archived by
 * this request and the write log holds a write for it, not because a model said so.
 *
 * `lines[0]` is what the Inbox shows beside the Apply answers button.
 */

export type RunError = 'timed_out' | 'sign_in_expired' | 'usage_limit' | 'budget_exceeded' | 'cli_error' | 'daily_cap' | 'not_applied' | 'interrupted';

/** How the CLI run ended; null when no run was started. */
export interface ClaudeOutcome {
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly costUsd: number | null;
  /** Null for a finished run. */
  readonly error: RunError | null;
  /** One sentence for the log and the result, never a prompt, a token or a row. */
  readonly detail: string | null;
}

/** `inbox_apply_run_facts()`, validated. */
export interface RunFacts {
  readonly archivedIds: readonly number[];
  readonly changedIds: readonly number[];
  readonly unarchivedWrites: readonly number[];
  readonly flagged: readonly { readonly item: number; readonly flagged: Record<string, unknown> }[];
  readonly leftIds: readonly number[];
}

export interface ReportInput {
  readonly trigger: string | null;
  /** The items handed to Claude in this run. */
  readonly batchIds: readonly number[];
  /** `params.skip`: items an earlier run of this chain could not apply. */
  readonly priorSkip: readonly number[];
  readonly facts: RunFacts;
  readonly claude: ClaudeOutcome | null;
  /** True when the day's run cap stopped this request before Claude was started. */
  readonly capped: boolean;
}

export interface Report {
  readonly state: 'done' | 'failed';
  readonly result: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ids(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((id): id is number => typeof id === 'number' && Number.isSafeInteger(id) && id > 0) : [];
}

export function parseRunFacts(value: unknown): RunFacts {
  if (!isRecord(value)) throw new Error('inbox_apply_run_facts: the answer is not an object');
  const flagged = Array.isArray(value.flagged)
    ? value.flagged.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.item !== 'number' || !isRecord(entry.flagged)) return [];
        return [{ item: entry.item, flagged: entry.flagged }];
      })
    : [];
  return {
    archivedIds: ids(value.archived_ids),
    changedIds: ids(value.changed_ids),
    unarchivedWrites: ids(value.unarchived_writes),
    flagged,
    leftIds: ids(value.left_ids),
  };
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

const ERROR_SENTENCE: Readonly<Record<RunError, string>> = Object.freeze({
  timed_out: 'The run was stopped at its time limit.',
  sign_in_expired: "The apply worker's Claude sign-in has expired.",
  usage_limit: 'The Claude plan limit was reached.',
  budget_exceeded: "The run reached its cost limit.",
  cli_error: 'The Claude run ended with an error.',
  daily_cap: "Today's limit on apply runs was reached; the rest waits for tomorrow or a press of Apply answers.",
  not_applied: 'Some answers could not be applied.',
  interrupted: 'The run was interrupted.',
});

/** The first line: what happened, in the Inbox's words. */
function headline(changed: number, recordedOnly: number, notApplied: number): string {
  const parts: string[] = [];
  if (changed > 0) parts.push(`${plural(changed, 'answer', 'answers')} applied`);
  if (recordedOnly > 0) parts.push(`${recordedOnly} recorded only`);
  if (notApplied > 0) parts.push(`${notApplied} could not be applied`);
  return parts.length === 0 ? 'Nothing to apply' : parts.join(', ');
}

/** The close's state and result for one request. */
export function buildReport(input: ReportInput): Report {
  const { facts, claude } = input;
  const archived = new Set(facts.archivedIds);
  const left = new Set(facts.leftIds);
  const notApplied = input.batchIds.filter((id) => !archived.has(id) && left.has(id));
  const changed = facts.changedIds.length;
  const recordedOnly = facts.archivedIds.length - changed;
  // What the follow-up must leave alone: this run's failures, and the earlier ones still waiting.
  const skip = [...new Set([...input.priorSkip.filter((id) => left.has(id)), ...notApplied])].sort((a, b) => a - b);

  const error: RunError | null =
    claude?.error ?? (input.capped ? 'daily_cap' : notApplied.length > 0 || facts.unarchivedWrites.length > 0 ? 'not_applied' : null);

  const lines = [headline(changed, recordedOnly, notApplied.length)];
  if (error !== null) lines.push(claude?.detail ?? ERROR_SENTENCE[error]);
  if (notApplied.length > 0) lines.push(`Not applied: ${plural(notApplied.length, 'item', 'items')} ${notApplied.join(', ')}.`);
  if (facts.unarchivedWrites.length > 0) {
    lines.push(`Written but not archived, check these: ${plural(facts.unarchivedWrites.length, 'item', 'items')} ${facts.unarchivedWrites.join(', ')}.`);
  }
  const raised = facts.flagged.flatMap((entry) => (typeof entry.flagged.item === 'number' ? [entry.flagged.item] : []));
  if (raised.length > 0) lines.push(`Raised for you: ${plural(raised.length, 'item', 'items')} ${raised.join(', ')}.`);
  const codeChanges = facts.flagged.filter((entry) => typeof entry.flagged.code_change === 'string');
  if (codeChanges.length > 0) lines.push(`Flagged for a code change: ${plural(codeChanges.length, 'item', 'items')} ${codeChanges.map((e) => e.item).join(', ')}.`);
  const stillWaiting = facts.leftIds.length;
  if (stillWaiting > 0) lines.push(`${plural(stillWaiting, 'answer', 'answers')} still waiting.`);

  return {
    state: error === null ? 'done' : 'failed',
    result: {
      lines,
      archived: facts.archivedIds.length,
      changed,
      recorded_only: recordedOnly,
      raised,
      flagged: facts.flagged,
      left: stillWaiting,
      skip,
      trigger: input.trigger,
      claude: {
        started: claude !== null,
        exit_code: claude?.exitCode ?? null,
        timed_out: claude?.timedOut ?? false,
        cost_usd: claude?.costUsd ?? null,
      },
      error,
    },
  };
}
