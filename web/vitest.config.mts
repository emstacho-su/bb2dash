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
 *
 * `.mts`, not `.ts`: this package is CommonJS, and Vite's native config loader
 * (the coming default) cannot load ESM syntax out of a file it treats as CJS.
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
    // A test gets 20s, not the default 5s, and so does a hook. `test/setup.ts`
    // lets Testing Library wait 15s for an async render; the test that contains
    // that wait has to outlive it, or the raised wait can never be reached.
    // Both numbers exist for the same reason: 90-odd jsdom environments start
    // at once on Windows and a screen's first paint is not bounded by a second.
    // Neither hides a failure — a defect still fails, later.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      // R-51 (T-22): every module under src/ that a suite can load is measured,
      // so the figure describes the app rather than a hand-picked list (which
      // was 17 modules before Phase 17). Left out are only the files no jsdom
      // suite can drive: Next's route entries (page, layout, not-found, the
      // proxy), the server-only Supabase client and the generated types.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/page.tsx',
        'src/**/layout.tsx',
        'src/app/not-found.tsx',
        'src/proxy.ts',
        'src/lib/supabase/server.ts',
        'src/lib/supabase/database.types.ts',
      ],
      // A floor, not a target: the measured line figure on 2026-09-29 (83.11 %,
      // 3,942 of 4,743 lines) rounded down. Raise it as screens gain suites; a run
      // that falls below it fails.
      thresholds: { lines: 83 },
    },
  },
});
