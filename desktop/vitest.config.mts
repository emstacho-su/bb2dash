/**
 * Vitest for the desktop shell.
 *
 * Node environment, not jsdom: everything under test is main-process or
 * `core/` code. Nothing in the suite touches the network or Electron — the
 * `core/` modules import neither (C-13), and `fetch` is stubbed per test.
 *
 * `.mts`, not `.ts`: this package is CommonJS (Electron's main process and a
 * sandboxed preload both need CJS), and Vite's config loader cannot read ESM
 * syntax out of a file it treats as CJS. Same reason as `web/`.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/core/**/*.ts'],
    },
  },
});
