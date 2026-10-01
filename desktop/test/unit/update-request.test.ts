/**
 * The one IPC channel (2026-09-30, amends C-1): `bb2dash:request-update`. Main answers it
 * only for the main window's top frame on the app's origin; every other sender is refused
 * with a typed error and a log line, and the update never runs.
 */

import { describe, expect, it } from 'vitest';

import {
  UPDATE_REQUEST_CHANNEL,
  UpdateRequestRejected,
  createUpdateRequestHandler,
  registerUpdateRequest,
  validateUpdateSender,
} from '../../src/main/update-request';
import type { UpdateRequestEvent } from '../../src/main/update-request';
import type { UpdateResult } from '../../src/core/update/force-update';

const APP_ORIGIN = 'https://bb2dash.example.app';
const MAIN_ID = 7;
const PROMPT_ID = 9;
const OK: UpdateResult = { status: 'up-to-date', build: 'abc1234' };

function topFrame(url: string): UpdateRequestEvent['senderFrame'] {
  return { url, parent: null };
}

function event(senderId: number, frame: UpdateRequestEvent['senderFrame']): UpdateRequestEvent {
  return { sender: { id: senderId }, senderFrame: frame };
}

function setup(mainId: number | null = MAIN_ID) {
  const lines: string[] = [];
  let runs = 0;
  const handler = createUpdateRequestHandler({
    appOrigin: APP_ORIGIN,
    mainWebContentsId: () => mainId,
    run: async () => {
      runs += 1;
      return OK;
    },
    log: {
      info: (m) => lines.push(`info ${m}`),
      warn: (m) => lines.push(`warn ${m}`),
      error: (m) => lines.push(`error ${m}`),
    },
  });
  return { handler, lines, runs: () => runs };
}

describe('validateUpdateSender', () => {
  const policy = { mainWebContentsId: MAIN_ID, appOrigin: APP_ORIGIN };

  it('accepts the main window top frame on the app origin', () => {
    expect(validateUpdateSender(event(MAIN_ID, topFrame(`${APP_ORIGIN}/planner?x=1`)), policy)).toBeNull();
  });

  it('refuses another window, such as the update prompt or the hidden refresh page', () => {
    expect(validateUpdateSender(event(PROMPT_ID, topFrame(`${APP_ORIGIN}/`)), policy)).toMatch(/window/);
  });

  it('refuses a subframe of the main window, even on the app origin', () => {
    const sub = { url: `${APP_ORIGIN}/frame`, parent: { url: `${APP_ORIGIN}/` } };
    expect(validateUpdateSender(event(MAIN_ID, sub), policy)).toMatch(/frame/);
  });

  it('refuses a foreign origin, a look-alike host, and an opaque origin', () => {
    for (const url of [
      'https://evil.example/',
      'https://bb2dash.example.app.evil.example/',
      'http://bb2dash.example.app/',
      'https://bb2dash.example.app:8443/',
      'data:text/html,hi',
      'about:blank',
      'not a url',
    ]) {
      expect(validateUpdateSender(event(MAIN_ID, topFrame(url)), policy)).toMatch(/origin/);
    }
  });

  it('refuses when there is no frame or no main window', () => {
    expect(validateUpdateSender(event(MAIN_ID, null), policy)).toMatch(/frame/);
    expect(validateUpdateSender(event(MAIN_ID, topFrame(`${APP_ORIGIN}/`)), { ...policy, mainWebContentsId: null })).toMatch(/window/);
  });
});

describe('createUpdateRequestHandler', () => {
  it('runs the update for the main window', async () => {
    const { handler, runs } = setup();
    await expect(handler(event(MAIN_ID, topFrame(`${APP_ORIGIN}/`)))).resolves.toEqual(OK);
    expect(runs()).toBe(1);
  });

  it.each([
    ['the update prompt window', event(PROMPT_ID, topFrame(`${APP_ORIGIN}/`))],
    ['a subframe', event(MAIN_ID, { url: `${APP_ORIGIN}/frame`, parent: { url: `${APP_ORIGIN}/` } })],
    ['a foreign origin', event(MAIN_ID, topFrame('https://evil.example/'))],
  ])('rejects %s with a typed error, logs it, and runs nothing', async (_label, request) => {
    const { handler, lines, runs } = setup();
    await expect(handler(request)).rejects.toBeInstanceOf(UpdateRequestRejected);
    expect(runs()).toBe(0);
    expect(lines.some((line) => line.startsWith('warn') && line.includes('refused'))).toBe(true);
  });

  it('never logs the full URL of a refused sender (no query strings in the log)', async () => {
    const { handler, lines } = setup();
    await expect(handler(event(MAIN_ID, topFrame('https://evil.example/p?token=abc')))).rejects.toThrow();
    expect(lines.join('\n')).not.toContain('token=abc');
  });

  it('registers exactly the one channel', () => {
    const channels: string[] = [];
    registerUpdateRequest({ handle: (channel: string) => void channels.push(channel) }, setup().handler);
    expect(channels).toEqual([UPDATE_REQUEST_CHANNEL]);
    expect(UPDATE_REQUEST_CHANNEL).toBe('bb2dash:request-update');
  });
});
