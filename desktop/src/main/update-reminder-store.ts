/**
 * The *Update later* choice, persisted (2026-09-30).
 *
 * `%APPDATA%\bb2dash\update-reminder.json`, next to `config.json`:
 * `{ "remindAfter": "<ISO instant>" }`. Written atomically (temp file, then rename). A file
 * that does not parse reads as "no reminder", so the worst a torn write costs is one prompt
 * too early, never a crash.
 *
 * In `main/`, not `core/`: C-13 keeps filesystem access in core to the watermark store.
 */

import { readFileSync, renameSync, writeFileSync } from 'node:fs';

import type { Logger } from '../core/redact';
import type { ReminderStore } from '../core/update/update-flow';
import { describeError } from '../core/redact';

export const REMINDER_FILENAME = 'update-reminder.json';

export type { ReminderStore };

export interface ReminderStoreOptions {
  readonly filePath: string;
  readonly log: Logger;
}

function isMissingFile(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'ENOENT';
}

export function createReminderStore(options: ReminderStoreOptions): ReminderStore {
  return {
    read(): Date | null {
      let text: string;
      try {
        text = readFileSync(options.filePath, 'utf8');
      } catch (error) {
        if (!isMissingFile(error)) options.log.warn(`update reminder unreadable: ${describeError(error)}`);
        return null;
      }
      try {
        const parsed: unknown = JSON.parse(text);
        const value = (parsed as { remindAfter?: unknown } | null)?.remindAfter;
        const at = typeof value === 'string' ? new Date(value) : null;
        if (at !== null && Number.isFinite(at.getTime())) return at;
      } catch {
        // falls through to the warning
      }
      options.log.warn('update reminder file is malformed; treating it as no reminder');
      return null;
    },

    write(at: Date): void {
      const temp = `${options.filePath}.tmp`;
      writeFileSync(temp, `${JSON.stringify({ remindAfter: at.toISOString() })}\n`, 'utf8');
      renameSync(temp, options.filePath);
    },
  };
}
