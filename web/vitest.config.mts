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
      // Scoped to the modules this harness actually covers. The palette's
      // ResultRow is tested (test/CommandPalette.test.tsx) but the palette
      // shell — keyboard plumbing, debounce, router navigation — is not, and
      // counting it would report a number that describes nothing. Widen this
      // list as screens get covered, rather than lowering the bar.
      //
      // Phase 10a added the gradebook query layer and the staged-upload module;
      // Phase 11 added the planner week grid and the announcements bell/page.
      // Phase 11b added planner events: zone helper, validation, placement,
      // the query layer and the form's state.
      // Every module listed has a suite in test/ that drives it end to end.
      include: [
        'src/lib/queries.search.ts',
        'src/lib/queries.sync.ts',
        'src/lib/queries.grades.ts',
        'src/lib/queries.submissions.ts',
        'src/lib/planner-week.ts',
        // Phase 12b: the variable row geometry (P-planner-2), driven by
        // test/planner-rows.test.ts.
        'src/lib/planner-rows.ts',
        'src/lib/queries.planner.ts',
        'src/lib/queries.announcements.ts',
        'src/lib/planner-zone.ts',
        'src/lib/planner-events.ts',
        'src/lib/planner-events-grid.ts',
        'src/lib/queries.plannerEvents.ts',
        'src/components/planner/planner-event-form-state.ts',
        'src/components/planner/PlannerWeek.tsx',
        'src/components/shell/Bell.tsx',
        'src/components/announcements/AnnouncementsList.tsx',
        // Phase 10b: the grade-model engine (L1-L5 in test/grade-model/).
        'src/lib/grade-model/**/*.ts',
      ],
    },
  },
});
