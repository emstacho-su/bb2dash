import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // The two files that only run on load, as processes: their rules are in the modules beside them.
      exclude: ['src/healthcheck.ts', 'src/hooks/tool-gate.ts'],
      reporter: ['text', 'text-summary'],
      thresholds: {
        lines: 80,
      },
    },
  },
});
