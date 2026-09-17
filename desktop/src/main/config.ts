/**
 * C-2 — the Electron side of configuration: read
 * `%APPDATA%\bb2dash\config.json`, hand it to the schema in `core/config.ts`,
 * and stop the app with a dialog naming the field when it does not validate.
 *
 * A missing file is not an error by itself: every key except `supabaseAnonKey`
 * has a default, and the anon key may come from `BB2DASH_SUPABASE_ANON_KEY`
 * (which is how the e2e suite runs without a config file at all).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, dialog } from 'electron';

import { CONFIG_DEFAULTS, ConfigError, loadConfigFrom } from '../core/config';
import type { DesktopConfig } from '../core/config';
import { log } from './log';
import { isTestMode, recordEvent } from './test-hook';

export const CONFIG_FILE_NAME = 'config.json';

export function configFilePath(): string {
  return join(app.getPath('userData'), CONFIG_FILE_NAME);
}

/** Raw JSON from the config file. `{}` when there is no file. Throws on bad JSON. */
function readConfigFile(file: string): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new ConfigError('(file)', `${file} could not be read: ${(error as Error).message}`);
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('the file must contain a JSON object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new ConfigError('(file)', `${file} is not valid JSON: ${(error as Error).message}`);
  }
}

/**
 * Load and validate. On failure the dialog names the field, the reason goes to
 * the log, and the caller quits: running on a half-understood config would
 * point the window or the terminal somewhere unintended.
 */
export function loadConfig(): DesktopConfig {
  const file = configFilePath();
  const raw = readConfigFile(file);
  const config = loadConfigFrom(raw, process.env);
  log(`config loaded from ${file} (appUrl ${config.appUrl}, poll ${config.pollIntervalMinutes}m)`);
  return config;
}

/**
 * The dialog C-2 asks for: one field, one file path, then quit.
 *
 * **Never under `BB2DASH_TEST=1`.** `showErrorBox` is modal and blocks the main
 * process until a human clicks it, so a misconfigured e2e launch would put a box on
 * the screen and hang the run until someone noticed. In test mode the same
 * information goes to the log, to stderr and to the recorder, and the caller exits
 * non-zero so the spec fails in seconds with the offending field in the output.
 */
export function reportConfigError(error: unknown, env: NodeJS.ProcessEnv = process.env): void {
  const field = error instanceof ConfigError ? error.field : '(unknown)';
  const detail = error instanceof Error ? error.message : String(error);
  log(`config rejected: ${detail}`);
  recordEvent('config-rejected', { field, detail });

  if (isTestMode(env)) {
    process.stderr.write(`bb2dash: config rejected (${field}): ${detail}\n`);
    return;
  }

  dialog.showErrorBox(
    'bb2dash cannot start',
    [
      `The setting "${field}" in the configuration file is missing or invalid.`,
      '',
      configFilePath(),
      '',
      detail,
      '',
      'desktop/README.md has an example file.',
    ].join('\n'),
  );
}

/** The example `config.json` the README documents, written on demand. */
export function writeExampleConfig(file: string): void {
  const example = {
    appUrl: CONFIG_DEFAULTS.appUrl,
    supabaseUrl: CONFIG_DEFAULTS.supabaseUrl,
    supabaseAnonKey: 'paste the project legacy anon JWT here',
    repoDir: CONFIG_DEFAULTS.repoDir,
    pollIntervalMinutes: CONFIG_DEFAULTS.pollIntervalMinutes,
    dueReminderTime: CONFIG_DEFAULTS.dueReminderTime,
  };
  writeFileSync(file, `${JSON.stringify(example, null, 2)}\n`, 'utf8');
}
