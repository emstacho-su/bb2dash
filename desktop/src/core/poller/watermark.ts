/**
 * The file-backed `WatermarkStore` (C-7): `userData/notify-watermark.json`,
 * `{ version: 1, lastSeenAt, dueCheckedOn, firedKeys }`, written atomically.
 *
 * This is the only filesystem access anywhere in `core/` (C-13), and it is behind the
 * `WatermarkStore` interface so a container port swaps it for a volume or a row.
 *
 * Two rules the rest of the poller depends on:
 *  - `read()` never throws for a bad file. A missing, truncated or schema-invalid file
 *    reads as `null`, which the scheduler treats as a first launch: `lastSeenAt = now`,
 *    so nothing historical fires. A store that threw would wedge the poller forever.
 *  - `write()` is tmp + rename, so a crash mid-write leaves the previous file intact.
 */

import { constants as fsConstants } from 'node:fs';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { Watermark, WatermarkStore } from '../types';
import { type Logger, describeError, silentLogger } from '../redact';
import { FIRED_KEYS_LIMIT, initialWatermark } from './reducer';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` is a watermark this version understands. Total: never throws. */
export function isWatermark(value: unknown): value is Watermark {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate['version'] !== 1) return false;
  if (typeof candidate['lastSeenAt'] !== 'string') return false;
  if (Number.isNaN(Date.parse(candidate['lastSeenAt']))) return false;
  const due = candidate['dueCheckedOn'];
  if (due !== null && (typeof due !== 'string' || !ISO_DATE.test(due))) return false;
  const keys = candidate['firedKeys'];
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) return false;
  return true;
}

/** A defensive copy, capped at the newest 500 keys even if the file on disk held more. */
function normalise(value: Watermark): Watermark {
  const keys = value.firedKeys;
  return {
    version: 1,
    lastSeenAt: value.lastSeenAt,
    dueCheckedOn: value.dueCheckedOn,
    firedKeys: keys.length > FIRED_KEYS_LIMIT ? keys.slice(keys.length - FIRED_KEYS_LIMIT) : [...keys],
  };
}

export interface FileWatermarkStoreOptions {
  /** Absolute path to `notify-watermark.json`. Main supplies `app.getPath('userData')`. */
  readonly filePath: string;
  readonly log?: Logger;
}

/**
 * A `WatermarkStore` over one JSON file. The parent directory is created on first write.
 */
export function createFileWatermarkStore({
  filePath,
  log = silentLogger,
}: FileWatermarkStoreOptions): WatermarkStore {
  const tmpPath = `${filePath}.tmp`;

  async function read(): Promise<Watermark | null> {
    let text: string;
    try {
      text = await readFile(filePath, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        log.warn(`watermark unreadable at ${filePath}: ${describeError(error)}`);
      }
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      log.warn(`watermark is not JSON; treating as first launch: ${describeError(error)}`);
      return null;
    }

    if (!isWatermark(parsed)) {
      log.warn('watermark failed schema validation; treating as first launch');
      return null;
    }
    return normalise(parsed);
  }

  async function write(next: Watermark): Promise<void> {
    if (!isWatermark(next)) {
      throw new TypeError('createFileWatermarkStore.write: refusing to write an invalid watermark');
    }
    const payload = `${JSON.stringify(normalise(next), null, 2)}\n`;
    await mkdir(dirname(filePath), { recursive: true });

    // Truncating open + write + fsync, then rename over the target. `fs.rename` on Windows
    // is MOVEFILE_REPLACE_EXISTING, so the swap is atomic for a reader.
    const handle = await open(tmpPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC);
    try {
      await handle.writeFile(payload, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      await rename(tmpPath, filePath);
    } catch (error) {
      await unlink(tmpPath).catch(() => undefined);
      throw error;
    }
  }

  return { read, write };
}

/**
 * The watermark a tick starts from: the stored one, or a freshly written first-launch one.
 * `created` tells the scheduler that this tick must not fire anything historical.
 */
export async function loadOrInitialise(
  store: WatermarkStore,
  now: Date,
): Promise<{ readonly watermark: Watermark; readonly created: boolean }> {
  const stored = await store.read();
  if (stored) return { watermark: stored, created: false };
  const fresh = initialWatermark(now);
  await store.write(fresh);
  return { watermark: fresh, created: true };
}
