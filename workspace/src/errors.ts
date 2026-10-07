/**
 * The eight error codes a failed or stopped answer is stored under (brief 102, Contract, Error
 * codes): the list migration 140 checks on `workspace_messages.error_code` and on
 * `workspace_requests.error_code`. No code is retried on another model.
 */

import type { ProviderId } from './providers/types.js';

export const ERROR_CODES = [
  'budget_exceeded',
  'timeout',
  'stale_claim',
  'provider_not_configured',
  'cli_error',
  'cancelled',
  'usage_limit',
  'sign_in_expired',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}

/**
 * What a caught value says, for a log line: an Error's message, anything else as text. An Error
 * with no message says its `code` when that is text (ruling X1): node reports a refused connect to
 * a host with two addresses as an AggregateError with an empty message and `code: 'ECONNREFUSED'`.
 */
export function messageOf(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  if (error.message !== '') return error.message;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

/** Thrown by a provider that exists as a typed stub and is not connected. */
export class ProviderNotConfiguredError extends Error {
  readonly providerId: ProviderId;

  constructor(providerId: ProviderId) {
    super(`provider ${providerId} is not configured`);
    this.name = 'ProviderNotConfiguredError';
    this.providerId = providerId;
  }
}

/** The code for an error a provider threw; anything unrecognised is `cli_error`. */
export function errorCodeFor(error: unknown): ErrorCode {
  return error instanceof ProviderNotConfiguredError ? 'provider_not_configured' : 'cli_error';
}

/** The result subtype the CLI ends a turn with when `--max-budget-usd` is used up. */
const BUDGET_STOP_SUBTYPE = 'error_max_budget_usd';
const FINISHED_SUBTYPE = 'success';
/** The `error` field of the CLI's own assistant message after an authentication failure. */
const AUTHENTICATION_FAILED = 'authentication_failed';
const HTTP_UNAUTHORIZED = 401;
/** `rate_limit_info.status` when the plan's limit refuses the request. */
const RATE_LIMIT_REJECTED = 'rejected';
/** The `error` field of the CLI's own assistant message after a rate-limit failure. */
const RATE_LIMIT_ERROR = 'rate_limit';
const HTTP_TOO_MANY_REQUESTS = 429;

/** The structured facts of a finished stream that decide its code; a `TurnSummary` has them all. */
export interface TurnEndFacts {
  readonly violation: string | null;
  readonly overage: boolean;
  readonly assistantError: string | null;
  readonly rateLimit: { readonly status: string | null } | null;
  readonly result: {
    readonly subtype: string | null;
    readonly isError: boolean;
    readonly apiErrorStatus: number | null;
  } | null;
}

/**
 * The error code a CLI turn ends under, or null for a finished answer. It keys on structured
 * fields of the stream as recorded, never on result text:
 *   the stream's own stop (a gate or init-line failure)      cli_error
 *   a turn reported as paid from usage credits               usage_limit
 *   result subtype `error_max_budget_usd`                    budget_exceeded
 *   `subtype: success` with `is_error: false`                null
 *   an authentication failure (the assistant line's `error`, or API status 401)   sign_in_expired
 *   an error end after a plan rate-limit rejection: the rate-limit event's status, or the terminal
 *   error itself (the assistant line's `error` with API status 429); never an `api_retry` event
 *                                                            usage_limit
 *   anything else, a stream with no result line included     cli_error
 */
export function mapTurnEnd(facts: TurnEndFacts): ErrorCode | null {
  if (facts.violation !== null) return 'cli_error';
  if (facts.overage) return 'usage_limit';
  const result = facts.result;
  if (result === null) return 'cli_error';
  if (result.subtype === BUDGET_STOP_SUBTYPE) return 'budget_exceeded';
  if (result.subtype === FINISHED_SUBTYPE && !result.isError) return null;
  if (facts.assistantError === AUTHENTICATION_FAILED || result.apiErrorStatus === HTTP_UNAUTHORIZED) return 'sign_in_expired';
  if (facts.rateLimit?.status === RATE_LIMIT_REJECTED || endedOnRateLimit(facts.assistantError, result.apiErrorStatus)) return 'usage_limit';
  return 'cli_error';
}

/** The terminal error names a rate limit on both of its fields; one of them alone is not enough. */
function endedOnRateLimit(assistantError: string | null, apiErrorStatus: number | null): boolean {
  return assistantError === RATE_LIMIT_ERROR && apiErrorStatus === HTTP_TOO_MANY_REQUESTS;
}
