/**
 * Vitest for the web app.
 *
 * jsdom + Testing Library, because what is worth testing here is the retrieval
 * contract layer (`src/lib/queries.search.ts`: request shape, query keys,
 * snippet scrubbing, match labelling) and the palette row that renders it.
 * Nothing in the suite touches the network or Supabase — `fetch` and the
 * browser client are stubbed per test.
 *
 * `@/` must match the `paths` entry in tsconfig.json or the tests resolve
 * different modules from the app.
 */

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      // Scoped to the module this harness actually covers. The palette's
      // ResultRow is tested (test/CommandPalette.test.tsx) but the palette
      // shell — keyboard plumbing, debounce, router navigation — is not, and
      // counting it would report a number that describes nothing. Widen this
      // list as screens get covered, rather than lowering the bar.
      include: ['src/lib/queries.search.ts'],
    },
  },
});
