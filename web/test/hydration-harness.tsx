/**
 * The hydration test scaffold (P-73), shared by every screen that hydrates
 * inside a Suspense boundary after the persisted query cache is restored.
 *
 * The order it replays is the browser's: the server renders from an empty
 * cache, `PersistQueryClientProvider` restores a warm cache from localStorage,
 * and React hydrates the server HTML with the warm cache in place. If the first
 * client render differs from the server HTML, React throws the server tree away
 * and reports a recoverable error (production error #418).
 *
 * A test builds its tree with a `QueryClient` argument, warms one client with
 * `warmQueryCache`, and calls `hydrateOverServerHtml(serverTree, clientTree)`.
 * `recoverable` is the spy React calls on a mismatch; a clean hydration leaves
 * it uncalled.
 *
 * `vi.mock` calls stay in each test file (vitest hoists them per file); the
 * harness only supplies `readChain`, the read-only builder those mocks return.
 */

import type { ReactElement } from 'react';
import { act } from 'react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { QueryClient } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { vi, type Mock } from 'vitest';

/** A client that fails fast: a test never waits on a retry. */
export function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

export interface ReadChainOptions {
  /** Tables read with `.single()` / `.maybeSingle()`: resolve to the first row or null. */
  readonly singleTables?: readonly string[];
}

/**
 * A read-only Supabase query builder: every filter returns the chain, and the
 * chain resolves to the table's rows. Filters are not applied; a test seeds
 * exactly the rows the screen should see.
 */
export function readChain(
  byTable: Readonly<Record<string, readonly unknown[]>>,
  table: string,
  options: ReadChainOptions = {},
): Record<string, unknown> {
  const single = options.singleTables?.includes(table) ?? false;
  const all = () => byTable[table] ?? [];
  const many = () => ({ data: single ? (all()[0] ?? null) : all(), error: null });
  const one = () => ({ data: all()[0] ?? null, error: null });
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: self,
    neq: self,
    in: self,
    is: self,
    not: self,
    gte: self,
    gt: self,
    lt: self,
    lte: self,
    or: self,
    order: self,
    limit: self,
    range: self,
    maybeSingle: async () => one(),
    single: async () => one(),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(many()).then(onFulfilled, onRejected),
  });
  return chain;
}

/**
 * Render the tree once in the DOM with a fresh client and wait until `ready`
 * passes: the returned client holds what a restored persisted cache would.
 */
export async function warmQueryCache(
  makeTree: (client: QueryClient) => ReactElement,
  ready: (container: HTMLElement) => void,
): Promise<QueryClient> {
  const client = newQueryClient();
  const first = render(makeTree(client));
  try {
    await waitFor(() => ready(first.container));
  } finally {
    first.unmount();
  }
  return client;
}

export interface HydratedTree {
  readonly container: HTMLElement;
  /** React's `onRecoverableError`: called once per hydration mismatch. */
  readonly recoverable: Mock;
  readonly waitForText: (text: string) => Promise<void>;
  readonly unmount: () => void;
}

/**
 * Put `serverTree`'s HTML in the document and hydrate it with `clientTree`,
 * the way the browser does after a cold load.
 */
export async function hydrateOverServerHtml(
  serverTree: ReactElement,
  clientTree: ReactElement,
): Promise<HydratedTree> {
  const container = document.createElement('div');
  container.innerHTML = renderToString(serverTree);
  document.body.appendChild(container);

  const recoverable = vi.fn();
  let root: Root | undefined;
  await act(async () => {
    root = hydrateRoot(container, clientTree, { onRecoverableError: recoverable });
  });

  return {
    container,
    recoverable,
    waitForText: async (text) => {
      await waitFor(() => {
        if (!container.textContent?.includes(text)) {
          throw new Error(`"${text}" not rendered yet`);
        }
      });
    },
    unmount: () => {
      act(() => root?.unmount());
      container.remove();
    },
  };
}
