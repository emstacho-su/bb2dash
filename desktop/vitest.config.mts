/**
 * Vitest for the Electron shell's unit suite (C-10).
 *
 * `.mts`, like `web/vitest.config.mts`: this package is CommonJS (Electron's main
 * process and a sandboxed preload both need CJS) and Vite's native config loader
 * cannot read ESM syntax out of a file it treats as CJS.
 *
 * Node environment, not jsdom: everything under test is main-process or `core/`
 * code. Nothing in the suite touches the network. The PostgREST layer is exercised
 * through an injected `RestGet` stub or a stubbed `fetch`, and the Electron adapters
 * through the `BB2DASH_TEST=1` recorders, so no test can reach `*.supabase.co`.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      // The whole portable core (C-13) plus the four Electron adapters that are
      // driven with `electron` mocked. The rest of `src/main/` opens windows and
      // spawns processes; the Playwright suite proves that half for real.
      include: [
        'src/core/**/*.ts',
        'src/main/notify.ts',
        'src/main/deeplink.ts',
        'src/main/test-hook.ts',
        'src/main/poller-wiring.ts',
      ],
      thresholds: {
        // C-7 freezes >= 90 % on the reducer; the rest of the core is held to the
        // same bar because it is all plain, injectable Node.
        lines: 90,
        functions: 90,
        branches: 85,
        'src/core/poller/reducer.ts': { lines: 90, functions: 90, branches: 90 },
      },
    },
  },
});
