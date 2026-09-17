/**
 * Log redaction (C-10: "a redaction test proves no bearer token or cookie value is ever
 * written"). Pure, so it lives in `core/` (C-13) and the container port keeps it.
 *
 * The rule is deliberately blunt: main never has a reason to log a long opaque string,
 * so every candidate is replaced rather than sampled. A truncated token is still a
 * token, so nothing is ever partially printed.
 */

const REDACTED = '[redacted]';

/** `xxx.yyy.zzz` with base64url segments — an access token, wherever it is embedded. */
const JWT = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g;

/** `sb-<ref>-auth-token[.<n>]=<value>` — the web session cookie, chunked or not. */
const AUTH_COOKIE = /\b(sb-[a-z0-9]+-auth-token(?:\.\d+)?)=[^;\s]+/gi;

/** `Authorization: Bearer <anything>` / `apikey: <anything>`, header- or object-shaped. */
const BEARER = /\b(bearer)\s+[^\s"',;}]+/gi;
const APIKEY = /\b(apikey|authorization|access_token|refresh_token|accessToken|refreshToken)(\s*[:=]\s*"?)[^\s"',;}]+/gi;

/** Any remaining base64-ish run long enough to be a credential. */
const LONG_OPAQUE = /\b[A-Za-z0-9_-]{60,}\b/g;

/** Replace every credential-shaped run in `text`. Never truncates: it substitutes. */
export function redact(text: string): string {
  return text
    .replace(AUTH_COOKIE, `$1=${REDACTED}`)
    .replace(BEARER, `$1 ${REDACTED}`)
    .replace(APIKEY, `$1$2${REDACTED}`)
    .replace(JWT, REDACTED)
    .replace(LONG_OPAQUE, REDACTED);
}

/** What every module in this worker's scope logs through. */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Wrap a sink so every line is redacted before it leaves. `sink` receives a level and an
 * already-redacted line; main gives it the rolling file, tests give it an array.
 */
export function createRedactingLogger(
  sink: (level: 'info' | 'warn' | 'error', line: string) => void,
  prefix = 'poller',
): Logger {
  const emit = (level: 'info' | 'warn' | 'error') => (message: string) => {
    try {
      sink(level, redact(`[${prefix}] ${message}`));
    } catch {
      // A logger that throws must never take the poller down with it.
    }
  };
  return { info: emit('info'), warn: emit('warn'), error: emit('error') };
}

/** A logger that discards everything — the default for pure units under test. */
export const silentLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Turn an unknown throwable into a short, safe, redacted one-liner. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return redact(`${error.name}: ${error.message}`.slice(0, 300));
  if (typeof error === 'string') return redact(error.slice(0, 300));
  return 'non-error thrown';
}
