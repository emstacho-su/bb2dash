'use client';

/**
 * bb2dash — the honest rendering of a query that has not answered yet.
 *
 * The project's rule is that nothing on screen may be a claim the data does not
 * support. A query that is still in flight, or that failed outright, supports
 * no claim at all — so neither "not recorded", nor "no policy is recorded", nor
 * an empty list, nor a zero may stand in for it. Those are statements about the
 * course; a dropped connection is a statement about the network.
 *
 * There is no error boundary in this app (a screen-level boundary would hide
 * the working half of a page), so every pane guards its own queries with these
 * two helpers:
 *
 *   queryStateText(q, 'the grade component')   -> 'loading…' | 'Could not load …' | null
 *   <QueryState query={q} of="the policies" />  -> the same, as an element
 *
 * `null` means the query has answered and the caller may render the real thing.
 */

export interface QueryLike {
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
}

/**
 * True while a query is genuinely in flight for the first time.
 *
 * Not `isPending` alone: TanStack reports a *disabled* query as pending for
 * ever (status 'pending', fetchStatus 'idle'), and several queries here are
 * disabled until the id they need arrives. `isPending && isFetching` is
 * TanStack's own `isLoading`, spelled out so it is obvious why.
 */
export function isQueryLoading(query: QueryLike): boolean {
  return query.isPending && query.isFetching;
}

/** True when a query cannot yet be spoken for — still loading, or failed. */
export function isQueryUnresolved(query: QueryLike): boolean {
  return isQueryLoading(query) || query.isError;
}

/** An error's message, without leaking the shape of whatever was thrown. */
export function queryErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error !== '') return error;
  return 'no reason given';
}

/**
 * The line to show instead of the real content, or `null` when there is real
 * content to show. `of` names the thing in words: "the staff", "your plan".
 */
export function queryStateText(
  query: QueryLike,
  of: string,
  loadingText = 'loading…',
): string | null {
  if (isQueryLoading(query)) return loadingText;
  if (query.isError) return `Could not load ${of}: ${queryErrorMessage(query.error)}`;
  return null;
}

/**
 * The same line as an element, so a pane can drop it straight into a section.
 * Renders nothing once the query has answered. An error carries `role="alert"`;
 * a loading line does not, because it is not news.
 */
export function QueryState({
  query,
  of,
  className,
  loadingText,
  as: Tag = 'p',
}: {
  query: QueryLike;
  of: string;
  className?: string;
  loadingText?: string;
  as?: 'p' | 'span' | 'div';
}) {
  const text = queryStateText(query, of, loadingText);
  if (text === null) return null;
  return (
    <Tag className={className} role={query.isError ? 'alert' : undefined}>
      {text}
    </Tag>
  );
}
