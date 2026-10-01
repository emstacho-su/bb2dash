/**
 * The desktop shell's bridge (`window.bb2dashDesktop`), seen from the web app (2026-09-30).
 * Whatever the bridge hands back crosses a boundary, so its shape is checked before use.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_REASON_LENGTH,
  getDesktopUpdater,
  parseUpdateResult,
  requestDesktopUpdate,
} from '@/lib/desktop-bridge';

type BridgeWindow = Window & { bb2dashDesktop?: unknown };

function setBridge(value: unknown): void {
  (window as BridgeWindow).bb2dashDesktop = value;
}

afterEach(() => {
  delete (window as BridgeWindow).bb2dashDesktop;
});

describe('getDesktopUpdater', () => {
  it('is null in a normal browser', () => {
    expect(getDesktopUpdater()).toBeNull();
  });

  it('is null for a bridge without requestUpdate (an older shell)', () => {
    setBridge({ version: '0.1.0' });
    expect(getDesktopUpdater()).toBeNull();
    setBridge({ version: '0.1.0', requestUpdate: 'not a function' });
    expect(getDesktopUpdater()).toBeNull();
  });

  it('is the function when the shell provides it', () => {
    setBridge({ version: '0.1.0', requestUpdate: async () => ({ status: 'up-to-date', build: null }) });
    expect(typeof getDesktopUpdater()).toBe('function');
  });
});

describe('parseUpdateResult', () => {
  it('accepts the three result shapes', () => {
    expect(parseUpdateResult({ status: 'up-to-date', build: 'abc1234' })).toEqual({ status: 'up-to-date', build: 'abc1234' });
    expect(parseUpdateResult({ status: 'up-to-date', build: null })).toEqual({ status: 'up-to-date', build: null });
    expect(parseUpdateResult({ status: 'restarting', build: '31215cf' })).toEqual({ status: 'restarting', build: '31215cf' });
    expect(parseUpdateResult({ status: 'failed', reason: 'the build failed' })).toEqual({
      status: 'failed',
      reason: 'the build failed',
    });
  });

  it('drops extra fields', () => {
    expect(parseUpdateResult({ status: 'failed', reason: 'x', stack: 'C:\\secret' })).toEqual({ status: 'failed', reason: 'x' });
  });

  it('rejects anything else', () => {
    for (const bad of [
      null,
      undefined,
      'up-to-date',
      42,
      [],
      {},
      { status: 'exploded' },
      { status: 'failed' },
      { status: 'failed', reason: 3 },
      { status: 'failed', reason: '' },
      { status: 'up-to-date', build: 7 },
      { status: 'restarting', build: '<img src=x onerror=alert(1)>' },
    ]) {
      expect(parseUpdateResult(bad)).toBeNull();
    }
  });

  it('caps a long reason', () => {
    const parsed = parseUpdateResult({ status: 'failed', reason: 'x'.repeat(500) });
    expect(parsed?.status).toBe('failed');
    expect(parsed && 'reason' in parsed ? parsed.reason.length : 0).toBeLessThanOrEqual(MAX_REASON_LENGTH);
  });
});

describe('requestDesktopUpdate', () => {
  it('passes a valid result through', async () => {
    const result = await requestDesktopUpdate(async () => ({ status: 'restarting', build: '31215cf' }));
    expect(result).toEqual({ status: 'restarting', build: '31215cf' });
  });

  it('turns a malformed result into a failure', async () => {
    expect(await requestDesktopUpdate(async () => ({ nope: true }))).toEqual({
      status: 'failed',
      reason: 'unexpected answer from the desktop app',
    });
  });

  it('turns a rejection (a refused sender) into a failure without its message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await requestDesktopUpdate(async () => {
      throw new Error("Error invoking remote method 'bb2dash:request-update': UpdateRequestRejected");
    });
    expect(result).toEqual({ status: 'failed', reason: 'the desktop app refused the request' });
    spy.mockRestore();
  });
});
