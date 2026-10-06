import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // One build of dist/ before the run: the gate and the healthcheck are tested as processes.
    globalSetup: ['test/global-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'text-summary'],
      thresholds: {
        lines: 80,
      },
    },
  },
});
