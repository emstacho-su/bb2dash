/**
 * The login prompt's memory between runs (brief 100 round 2, item 2): the New York date each
 * open container login item last opened the page on.
 *
 * `%APPDATA%\bb2dash\login-prompt.json`, beside the watermark and `update-reminder.json`:
 * `{ "promptedOn": { "<item id>": "YYYY-MM-DD" } }`. Written atomically (temp file, then rename).
 * A missing file is the first run; one that does not parse reads as `{}`, so the worst a torn
 * write costs is one prompt too many, never a crash and never a missed morning.
 *
 * In `main/`, not `core/`: C-13 keeps filesystem access in core to the watermark store.
 */

import { readFileSync, renameSync, writeFileSync } from 'node:fs';

import type { LoginPromptStore, PromptedOn } from '../core/login-prompt';
import { ISO_DATE } from '../core/patterns';
import type { Logger } from '../core/redact';
import { describeError } from '../core/redact';

export const LOGIN_PROMPT_FILENAME = 'login-prompt.json';

/** An Inbox item id as PostgREST hands it back: digits only. */
const ITEM_ID = /^\d{1,19}$/;

export interface LoginPromptStoreOptions {
  readonly filePath: string;
  readonly log: Logger;
}

function isMissingFile(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'ENOENT';
}

/** The valid `id → date` pairs of a parsed file, or `null` when its shape is wrong. */
function parsePromptedOn(parsed: unknown): PromptedOn | null {
  const value = (parsed as { promptedOn?: unknown } | null)?.promptedOn;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>).filter(
    (entry): entry is [string, string] =>
      ITEM_ID.test(entry[0]) && typeof entry[1] === 'string' && ISO_DATE.test(entry[1]),
  );
  return Object.freeze(Object.fromEntries(entries));
}

export function createLoginPromptStore(options: LoginPromptStoreOptions): LoginPromptStore {
  return {
    read(): PromptedOn {
      let text: string;
      try {
        text = readFileSync(options.filePath, 'utf8');
      } catch (error) {
        if (!isMissingFile(error)) options.log.warn(`login prompt record unreadable: ${describeError(error)}`);
        return {};
      }
      try {
        const promptedOn = parsePromptedOn(JSON.parse(text));
        if (promptedOn !== null) return promptedOn;
      } catch {
        // falls through to the warning
      }
      options.log.warn('login prompt record is malformed; treating it as empty');
      return {};
    },

    write(promptedOn: PromptedOn): void {
      const temp = `${options.filePath}.tmp`;
      writeFileSync(temp, `${JSON.stringify({ promptedOn })}\n`, 'utf8');
      renameSync(temp, options.filePath);
    },
  };
}
