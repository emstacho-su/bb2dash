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
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      // Scoped to the modules this harness actually covers. The palette's
      // ResultRow is tested (test/CommandPalette.test.tsx) but the palette
      // shell — keyboard plumbing, debounce, router navigation — is not, and
      // counting it would report a number that describes nothing. Widen this
      // list as screens get covered, rather than lowering the bar.
      //
      // Phase 11 added the planner week grid and the announcements bell/page;
      // all six modules have suites in test/ that drive them end to end.
      include: [
        'src/lib/queries.search.ts',
        'src/lib/queries.sync.ts',
        'src/lib/planner-week.ts',
        'src/lib/queries.planner.ts',
        'src/lib/queries.announcements.ts',
        'src/components/planner/PlannerWeek.tsx',
        'src/components/shell/Bell.tsx',
        'src/components/announcements/AnnouncementsList.tsx',
      ],
    },
  },
});
