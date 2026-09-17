/**
 * C-6 — the one PostgREST GET helper. Plain Node, no `electron` import (C-13).
 *
 * `GET <supabaseUrl>/rest/v1/<relation>?<query>` with the anon key and the web
 * session's bearer token; 10 s timeout; every row set schema-validated by the
 * caller's `validate` before it is returned. A non-2xx is a typed `RestError`,
 * logged at most once per relation per hour and never turned into a toast.
 */

import type { RestGet } from './types';

export const REST_TIMEOUT_MS = 10_000;
const LOG_WINDOW_MS = 60 * 60 * 1000;

/** A failed read: HTTP status, or `null` when the request never completed. */
export class RestError extends Error {
  readonly relation: string;
  readonly status: number | null;

  constructor(relation: string, status: number | null, message: string) {
    super(message);
    this.name = 'RestError';
    this.relation = relation;
    this.status = status;
  }
}

/** Rows came back but did not match the caller's schema. Never used blindly. */
export class RestShapeError extends Error {
  readonly relation: string;

  constructor(relation: string, message: string) {
    super(message);
    this.name = 'RestShapeError';
    this.relation = relation;
  }
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface RestOptions {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  /** `null` when there is no readable session; the read then fails fast. */
  readonly getAccessToken: () => Promise<string | null>;
  readonly fetchImpl?: FetchLike;
  readonly now?: () => number;
  readonly log?: (message: string) => void;
  readonly timeoutMs?: number;
}

/**
 * "Logged once per relation per hour" (C-6). Returns a predicate that is true
 * the first time a relation fails and again only after the window has passed.
 */
export function createErrorThrottle(
  windowMs: number = LOG_WINDOW_MS,
): (relation: string, nowMs: number) => boolean {
  const lastLoggedAt = new Map<string, number>();
  return (relation, nowMs) => {
    const previous = lastLoggedAt.get(relation);
    if (previous !== undefined && nowMs - previous < windowMs) return false;
    lastLoggedAt.set(relation, nowMs);
    return true;
  };
}

export function restUrl(supabaseUrl: string, relation: string, query: string): string {
  const base = supabaseUrl.replace(/\/+$/, '');
  return query.length > 0
    ? `${base}/rest/v1/${relation}?${query}`
    : `${base}/rest/v1/${relation}`;
}

export function createRestGet(options: RestOptions): RestGet {
  const doFetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const log = options.log ?? (() => undefined);
  const timeoutMs = options.timeoutMs ?? REST_TIMEOUT_MS;
  const shouldLog = createErrorThrottle();

  function fail(error: Error, relation: string): never {
    if (shouldLog(relation, now())) log(`rest ${relation}: ${error.message}`);
    throw error;
  }

  return async function restGet<T>(
    relation: string,
    query: string,
    validate: (rows: unknown) => T,
  ): Promise<T> {
    const accessToken = await options.getAccessToken();
    if (accessToken === null) {
      fail(new RestError(relation, null, 'no readable web session'), relation);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(restUrl(options.supabaseUrl, relation, query), {
        method: 'GET',
        headers: {
          apikey: options.anonKey,
          authorization: `Bearer ${accessToken}`,
          accept: 'application/json',
        },
        signal: controller.signal,
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      fail(new RestError(relation, null, `request failed: ${reason}`), relation);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      fail(new RestError(relation, response.status, `HTTP ${response.status}`), relation);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      fail(new RestShapeError(relation, `response was not JSON: ${reason}`), relation);
    }

    try {
      return validate(body);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      fail(new RestShapeError(relation, `rows did not validate: ${reason}`), relation);
    }
  };
}
