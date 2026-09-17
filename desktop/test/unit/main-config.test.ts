/**
 * `main/config.ts`'s failure path, with `electron` mocked.
 *
 * The rule under test is the one that cost a real interruption during the Phase 12
 * integration: `dialog.showErrorBox` is **modal**, so a misconfigured e2e launch put
 * a box on the screen and hung the Playwright run until a human clicked it. Under
 * `BB2DASH_TEST=1` the same information must go to the log, stderr and the recorder
 * instead, and the caller exits non-zero.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  errorBoxes: [] as { title: string; content: string }[],
  userData: 'C:\\fake\\userData',
}));

vi.mock('electron', () => ({
  app: { getPath: (_name: string) => fake.userData },
  dialog: {
    showErrorBox(title: string, content: string) {
      fake.errorBoxes.push({ title, content });
    },
  },
}));

// The rolling log writes to `app.getPath('userData')`; keep the suite off the disk.
vi.mock('../../src/main/log', () => ({
  log: () => undefined,
  logError: () => undefined,
  logFilePath: () => null,
  createNamedLogger: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }),
}));

import { ConfigError } from '../../src/core/config';
import { reportConfigError } from '../../src/main/config';

const TEST_ENV = { BB2DASH_TEST: '1' } as NodeJS.ProcessEnv;
const REAL_ENV = {} as NodeJS.ProcessEnv;
const ERROR = new ConfigError('supabaseAnonKey', 'supabaseAnonKey is required');

describe('reportConfigError', () => {
  beforeEach(() => {
    fake.errorBoxes = [];
  });

  it('opens no modal under BB2DASH_TEST=1', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    reportConfigError(ERROR, TEST_ENV);
    expect(fake.errorBoxes).toEqual([]);
    expect(stderr).toHaveBeenCalledTimes(1);
    // The field has to be in the output, or the spec that fails says nothing useful.
    expect(String(stderr.mock.calls[0]?.[0])).toContain('supabaseAnonKey');
    stderr.mockRestore();
  });

  it('opens the dialog, naming the field, outside test mode', () => {
    reportConfigError(ERROR, REAL_ENV);
    expect(fake.errorBoxes).toHaveLength(1);
    expect(fake.errorBoxes[0]?.title).toBe('bb2dash cannot start');
    expect(fake.errorBoxes[0]?.content).toContain('supabaseAnonKey');
    expect(fake.errorBoxes[0]?.content).toContain(fake.userData);
  });

  it('names "(unknown)" for a throwable that is not a ConfigError', () => {
    reportConfigError(new Error('something else'), REAL_ENV);
    expect(fake.errorBoxes[0]?.content).toContain('(unknown)');
  });
});
