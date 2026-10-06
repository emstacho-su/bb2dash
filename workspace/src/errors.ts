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
