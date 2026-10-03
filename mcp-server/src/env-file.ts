/**
 * The service key arrives as a file; the registration names only its path.
 *
 * `claude mcp get` prints a server's env block in clear text, and `docker
 * inspect` prints a container's environment the same way, so a key placed in
 * either is a key on every screen that shows it. The registration therefore
 * carries `SUPABASE_SERVICE_ROLE_FILE` (a path: `/run/secrets/...` inside the
 * image, the compose secret `bb2dash_mcp_service_key`) and the server reads the
 * file itself at start. Ported from agentic-harness `mcp-server/src/env-file.ts`
 * (the secret-by-path rule; there the path names a `.env`, here the file holds
 * the one key).
 *
 * Unlike the harness's optional `.env`, a named key file is required: missing,
 * unreadable, empty or multi-line each stop the server with a message that names
 * the variable and the path. No message ever carries the file's content.
 */

import { readFileSync } from 'node:fs';
import { ConfigError } from './errors.js';

export const SERVICE_ROLE_FILE_VAR = 'SUPABASE_SERVICE_ROLE_FILE';

const UTF8_BOM = '﻿';
const LINE_BREAK = /[\r\n]/;

/** A leading UTF-8 byte-order mark and surrounding CR, LF and spaces removed. */
export function cleanSecretText(text: string): string {
  const withoutBom = text.startsWith(UTF8_BOM) ? text.slice(UTF8_BOM.length) : text;
  return withoutBom.trim();
}

function errorCode(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code ?? 'unknown error';
}

/**
 * The secret held in `filePath`, which `variable` named. Throws ConfigError on a
 * missing, unreadable, empty or multi-line file.
 */
export function readSecretFile(filePath: string, variable: string): string {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ENOENT') {
      throw new ConfigError(
        `${variable} names ${filePath}, which does not exist.`,
        `Write the key into that file (UTF-8, the key alone), or point ${variable} at the file that holds it. In the image the file is the bb2dash_mcp_service_key secret, mounted read-only (mcp-server/README.md).`,
      );
    }
    throw new ConfigError(
      `${variable} names ${filePath}, which cannot be read (${code}).`,
      `${variable} must name a readable file, not a folder. Docker Desktop turns a missing bind source into an empty folder: delete that folder on the host, write the key file, then start the server again.`,
    );
  }

  const secret = cleanSecretText(text);
  if (secret.length === 0) {
    throw new ConfigError(
      `${variable} names ${filePath}, which is empty.`,
      'Write the key into that file (UTF-8, the key alone, no quotes).',
    );
  }
  if (LINE_BREAK.test(secret)) {
    throw new ConfigError(
      `${variable} names ${filePath}, which holds more than one line.`,
      'The file holds the key alone, on one line: no KEY= prefix and nothing after it.',
    );
  }
  return secret;
}
