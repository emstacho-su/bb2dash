/**
 * Stack, 2026-09-30: GPU acceleration off. With the window closed the GPU process was the
 * largest part of what stayed (~130 MB). Electron only honours
 * `app.disableHardwareAcceleration()` before `ready`, so this pins the call order at import.
 */

import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as string[]);

vi.mock('electron', () => {
  const app = {
    disableHardwareAcceleration: () => calls.push('disableHardwareAcceleration'),
    requestSingleInstanceLock: () => {
      calls.push('requestSingleInstanceLock');
      return true;
    },
    setAppUserModelId: () => calls.push('setAppUserModelId'),
    on: () => app,
    whenReady: () => {
      calls.push('whenReady');
      return new Promise<void>(() => undefined);
    },
    getPath: () => 'C:\fake',
    quit: () => undefined,
  };
  return { app, BrowserWindow: class {}, session: {}, Menu: {}, Tray: class {}, nativeImage: {}, shell: {}, screen: {}, powerMonitor: { on: () => undefined }, Notification: class {}, dialog: {} };
});

vi.mock('../../src/main/log', () => ({
  log: () => undefined,
  logError: () => undefined,
  logFilePath: () => null,
  createNamedLogger: () => ({ info: () => undefined, warn: () => undefined, error: () => undefined }),
}));

describe('GPU acceleration', () => {
  it('is disabled at import, before whenReady', async () => {
    await import('../../src/main/index');
    const off = calls.indexOf('disableHardwareAcceleration');
    expect(off).toBeGreaterThanOrEqual(0);
    expect(off).toBeLessThan(calls.indexOf('whenReady'));
  });
});
