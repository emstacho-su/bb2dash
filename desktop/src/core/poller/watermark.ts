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
import { isIsoDate, normaliseInstant } from '../patterns';
import { FIRED_KEYS_LIMIT, initialWatermark } from './reducer';

/**
 * R2-9 — a watermark whose timestamps are in the shape the rest of the poller demands.
 *
 * `isWatermark` used to accept any `Date.parse`-able `lastSeenAt`, while `gradesQuery`
 * demands a strict `...Z` instant. A hand-edited file holding `2026-09-16T14:04:02+00:00`
 * therefore validated, reached the query builder, threw `QueryValueError` — and threw again
 * on every tick after that, because a read failure changes nothing and the bad value stays
 * on disk. The poller was wedged until someone deleted the file.
 *
 * The fix is to coerce on read rather than to reject: anything `Date.parse` understands is
 * re-emitted through `toISOString()`, and only a value that is not a timestamp at all is
 * treated as a corrupt file (which reads as `null`, i.e. a first launch).
 */
export function normaliseWatermark(value: unknown): Watermark | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate['version'] !== 1) return null;

  const lastSeenAt = normaliseInstant(candidate['lastSeenAt']);
  if (lastSeenAt === null) return null;

  const due = candidate['dueCheckedOn'];
  if (due !== null && due !== undefined && !isIsoDate(due)) return null;

  const keys = candidate['firedKeys'];
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) return null;

  // R2-1: a file written before the floor existed has none. Its `lastSeenAt` is then the
  // floor — an upgrade must not suddenly reach back behind where the old build had got to.
  const floor = normaliseInstant(candidate['notifyFloor']) ?? lastSeenAt;

  return capKeys({
    version: 1,
    lastSeenAt,
    notifyFloor: floor,
    dueCheckedOn: due ?? null,
    firedKeys: keys as readonly string[],
  });
}

/** True when `value` is a watermark this version understands. Total: never throws. */
export function isWatermark(value: unknown): value is Watermark {
  return normaliseWatermark(value) !== null;
}

/** A defensive copy, capped at the newest 500 keys even if the file on disk held more. */
function capKeys(value: Watermark): Watermark {
  const keys = value.firedKeys;
  return {
    version: 1,
    lastSeenAt: value.lastSeenAt,
    notifyFloor: value.notifyFloor,
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

    const normalised = normaliseWatermark(parsed);
    if (normalised === null) {
      log.warn('watermark failed schema validation; treating as first launch');
      return null;
    }
    // R2-9: a file whose `lastSeenAt` was loosely formatted is repaired here rather than
    // rejected, so a hand edit costs nothing instead of wedging every tick.
    if (
      typeof (parsed as Record<string, unknown>)['lastSeenAt'] === 'string' &&
      (parsed as Record<string, unknown>)['lastSeenAt'] !== normalised.lastSeenAt
    ) {
      log.info('watermark lastSeenAt was not a strict ISO instant; normalised on read');
    }
    return normalised;
  }

  async function write(next: Watermark): Promise<void> {
    const normalised = normaliseWatermark(next);
    if (normalised === null) {
      throw new TypeError('createFileWatermarkStore.write: refusing to write an invalid watermark');
    }
    const payload = `${JSON.stringify(normalised, null, 2)}\n`;
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
