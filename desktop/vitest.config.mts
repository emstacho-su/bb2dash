/**
 * Vitest for the Electron shell's unit suite (C-10).
 *
 * `.mts`, like `web/vitest.config.mts`: this package is CommonJS and Vite's native
 * config loader cannot read ESM syntax out of a file it treats as CJS.
 *
 * Nothing in the suite touches the network. The PostgREST layer is exercised through
 * an injected `RestGet` stub, and the Electron adapters are exercised through the
 * `BB2DASH_TEST=1` recorders, so no test can reach `*.supabase.co`.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      // The portable core and the three Electron adapters this worker owns. The adapters
      // are driven with `electron` mocked; the Playwright suite proves them for real.
      include: [
        'src/core/poller/reducer.ts',
        'src/core/poller/watermark.ts',
        'src/core/poller/sources.ts',
        'src/core/poller/scheduler.ts',
        'src/core/poller/ny-time.ts',
        'src/core/route.ts',
        'src/core/redact.ts',
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
