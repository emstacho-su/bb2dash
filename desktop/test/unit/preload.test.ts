/**
 * C-1 — the preload exposes one frozen object. Amended 2026-09-30 (Stack: an explicit
 * "Update desktop app" item in the account menu): the object is `{ version, requestUpdate }`,
 * and `requestUpdate` is the one IPC call the renderer can make — an argument-less
 * `invoke('bb2dash:request-update')`. Main checks the sender (`update-request.ts`).
 *
 * Checked two ways: as source, for what the file is allowed to contain, and by running it
 * against a mocked `electron`, for exactly what reaches the page.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const PRELOAD = readFileSync(join(process.cwd(), 'src', 'preload', 'index.ts'), 'utf8');
const PACKAGE = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
  version: string;
};

const exposed: Array<{ key: string; api: unknown }> = [];
const invoke = vi.fn(async (..._args: unknown[]) => ({ status: 'up-to-date', build: null }));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => exposed.push({ key, api }),
  },
  ipcRenderer: { invoke: (...args: unknown[]) => invoke(...args) },
}));

describe('the preload, as source', () => {
  it('carries the same version as package.json', () => {
    expect(PRELOAD).toContain(`const VERSION = '${PACKAGE.version}'`);
  });

  it('exposes exactly one frozen object', () => {
    const exposures = [...PRELOAD.matchAll(/exposeInMainWorld\(/g)];
    expect(exposures).toHaveLength(1);
    expect(PRELOAD).toContain("exposeInMainWorld('bb2dashDesktop', Object.freeze(");
  });

  it('makes one IPC call, invoke on the update channel, and nothing else', () => {
    expect([...PRELOAD.matchAll(/ipcRenderer\.\w+/g)].map((m) => m[0])).toEqual(['ipcRenderer.invoke']);
    expect(PRELOAD).toContain("ipcRenderer.invoke('bb2dash:request-update')");
    for (const forbidden of ['ipcMain', 'sendSync', '.send(', '.on(', 'exposeInIsolatedWorld', 'postMessage']) {
      expect(PRELOAD).not.toContain(forbidden);
    }
  });
});

describe('the preload, run', () => {
  beforeEach(async () => {
    exposed.length = 0;
    invoke.mockClear();
    vi.resetModules();
    await import('../../src/preload/index');
  });

  it('exposes exactly { version, requestUpdate }, frozen', () => {
    expect(exposed).toHaveLength(1);
    const { key, api } = exposed[0] as { key: string; api: Record<string, unknown> };
    expect(key).toBe('bb2dashDesktop');
    expect(Object.keys(api).sort()).toEqual(['requestUpdate', 'version']);
    expect(Object.isFrozen(api)).toBe(true);
    expect(api['version']).toBe(PACKAGE.version);
    expect(typeof api['requestUpdate']).toBe('function');
  });

  it('requestUpdate invokes the one channel and passes nothing from the page', async () => {
    const api = (exposed[0] as { api: { requestUpdate: (...args: unknown[]) => Promise<unknown> } }).api;
    await api.requestUpdate('C:\\evil', { tree: 'x' });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('bb2dash:request-update');
  });
});
