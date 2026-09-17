/**
 * The file-backed watermark store (C-7): round-trip, schema validation, atomicity.
 *
 * Every case runs against a real temporary directory rather than a mocked `fs`, because the
 * property under test is the tmp + rename behaviour of the actual filesystem.
 */

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createFileWatermarkStore,
  isWatermark,
  loadOrInitialise,
} from '../../src/core/poller/watermark';
import { FIRED_KEYS_LIMIT } from '../../src/core/poller/reducer';
import type { Logger } from '../../src/core/redact';
import type { Watermark } from '../../src/core/types';
import { watermark } from '../fixtures/rows';

let dir: string;
let filePath: string;
let lines: string[];
const log: Logger = {
  info: (m) => lines.push(`info ${m}`),
  warn: (m) => lines.push(`warn ${m}`),
  error: (m) => lines.push(`error ${m}`),
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bb2dash-wm-'));
  filePath = join(dir, 'notify-watermark.json');
  lines = [];
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function store() {
  return createFileWatermarkStore({ filePath, log });
}

describe('round trip', () => {
  it('reads back exactly what it wrote', async () => {
    const value = watermark({ dueCheckedOn: '2026-09-16', firedKeys: ['sync:41', 'due:2026-09-16'] });
    await store().write(value);
    expect(await store().read()).toEqual(value);
  });

  it('reads null when the file does not exist, and logs nothing about it', async () => {
    expect(await store().read()).toBeNull();
    expect(lines).toEqual([]);
  });

  it('creates the directory on first write', async () => {
    const nested = join(dir, 'a', 'b', 'notify-watermark.json');
    const nestedStore = createFileWatermarkStore({ filePath: nested, log });
    await nestedStore.write(watermark());
    expect(await nestedStore.read()).toEqual(watermark());
  });

  it('writes pretty JSON with a trailing newline', async () => {
    await store().write(watermark());
    const text = await readFile(filePath, 'utf8');
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "version": 1');
  });

  it('caps firedKeys at the newest 500 on both write and read', async () => {
    const keys = Array.from({ length: 640 }, (_, i) => `k:${i}`);
    await store().write({ ...watermark(), firedKeys: keys });
    const back = await store().read();
    expect(back?.firedKeys).toHaveLength(FIRED_KEYS_LIMIT);
    expect(back?.firedKeys[0]).toBe(`k:${640 - FIRED_KEYS_LIMIT}`);
    expect(back?.firedKeys.at(-1)).toBe('k:639');
  });

  it('returns a copy, so a caller cannot mutate the store', async () => {
    const value = watermark({ firedKeys: ['a'] });
    await store().write(value);
    const first = await store().read();
    expect(first?.firedKeys).not.toBe(value.firedKeys);
  });
});

describe('schema validation', () => {
  it.each<[string, string]>([
    ['not JSON at all', '{'],
    ['a JSON array', '[]'],
    ['a JSON scalar', '42'],
    ['a future version', '{"version":2,"lastSeenAt":"2026-09-16T12:00:00.000Z","dueCheckedOn":null,"firedKeys":[]}'],
    ['a missing lastSeenAt', '{"version":1,"dueCheckedOn":null,"firedKeys":[]}'],
    ['an unparseable lastSeenAt', '{"version":1,"lastSeenAt":"soon","dueCheckedOn":null,"firedKeys":[]}'],
    ['a malformed dueCheckedOn', '{"version":1,"lastSeenAt":"2026-09-16T12:00:00.000Z","dueCheckedOn":"16/09/2026","firedKeys":[]}'],
    ['firedKeys that is not an array', '{"version":1,"lastSeenAt":"2026-09-16T12:00:00.000Z","dueCheckedOn":null,"firedKeys":"a"}'],
    ['firedKeys holding a non-string', '{"version":1,"lastSeenAt":"2026-09-16T12:00:00.000Z","dueCheckedOn":null,"firedKeys":[1]}'],
  ])('reads null and warns for %s', async (_name, text) => {
    await writeFile(filePath, text, 'utf8');
    expect(await store().read()).toBeNull();
    expect(lines.some((line) => line.startsWith('warn'))).toBe(true);
  });

  it('accepts a well-formed file', () => {
    expect(isWatermark(watermark())).toBe(true);
    expect(isWatermark(watermark({ dueCheckedOn: '2026-09-16' }))).toBe(true);
  });

  it('refuses to write an invalid watermark rather than corrupting the file', async () => {
    await store().write(watermark());
    const bad = { version: 1, lastSeenAt: 'nope', dueCheckedOn: null, firedKeys: [] } as unknown as Watermark;
    await expect(store().write(bad)).rejects.toThrow(TypeError);
    // The good file is still there, untouched.
    expect(await store().read()).toEqual(watermark());
  });
});

describe('atomicity', () => {
  it('leaves no .tmp file behind after a successful write', async () => {
    await store().write(watermark());
    expect(await readdir(dir)).toEqual(['notify-watermark.json']);
  });

  it('replaces an existing file in place, without a window where it is empty', async () => {
    const first = watermark({ firedKeys: ['one'] });
    const second = watermark({ firedKeys: ['two'], lastSeenAt: '2026-09-16T13:00:00.000Z' });
    const s = store();
    await s.write(first);
    await s.write(second);
    expect(await s.read()).toEqual(second);
    expect(await readdir(dir)).toEqual(['notify-watermark.json']);
  });

  it('a stale .tmp from an interrupted write does not affect the next read', async () => {
    await store().write(watermark());
    await writeFile(`${filePath}.tmp`, '{ truncated', 'utf8');
    expect(await store().read()).toEqual(watermark());
  });

  it('survives many sequential writes without losing the file', async () => {
    const s = store();
    for (let i = 0; i < 25; i += 1) {
      await s.write(watermark({ firedKeys: [`k:${i}`] }));
    }
    expect((await s.read())?.firedKeys).toEqual(['k:24']);
  });
});

describe('loadOrInitialise', () => {
  const now = new Date('2026-09-16T22:30:00.000Z');

  it('writes a first-launch watermark when there is no file', async () => {
    const { watermark: value, created } = await loadOrInitialise(store(), now);
    expect(created).toBe(true);
    expect(value).toEqual({
      version: 1,
      lastSeenAt: now.toISOString(),
      dueCheckedOn: null,
      firedKeys: [],
    });
    // And it persisted, so a relaunch does not re-initialise.
    expect(await store().read()).toEqual(value);
  });

  it('returns the stored watermark when there is one', async () => {
    const stored = watermark({ firedKeys: ['sync:41'] });
    await store().write(stored);
    const { watermark: value, created } = await loadOrInitialise(store(), now);
    expect(created).toBe(false);
    expect(value).toEqual(stored);
  });
});
