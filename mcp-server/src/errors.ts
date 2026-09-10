/**
 * Typed errors for the bb2dash materials MCP server.
 *
 * Every failure an operator can act on carries a `hint` with the fix. Nothing is
 * swallowed: handlers turn these into MCP tool errors whose text contains both
 * the message and the hint.
 */

export class MaterialsError extends Error {
  readonly hint: string | undefined;

  constructor(message: string, hint?: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.hint = hint;
  }
}

/** Missing or malformed environment configuration. */
export class ConfigError extends MaterialsError {}

/** The Edge Function or PostgREST call failed, timed out, or returned junk. */
export class ApiError extends MaterialsError {
  /** HTTP status when the server answered; null for network-level failures. */
  readonly status: number | null;

  constructor(message: string, hint?: string, status: number | null = null, options?: { cause?: unknown }) {
    super(message, hint, options);
    this.status = status;
  }
}

/**
 * Render any thrown value as an actionable, single-string message suitable for
 * returning to an LLM client. Never throws.
 */
export function describeError(error: unknown): string {
  if (error instanceof MaterialsError) {
    const kind = error.name.replace(/Error$/, '');
    const lines = [`${kind} error: ${error.message}`];
    if (error.hint) lines.push(`Fix: ${error.hint}`);
    const cause = (error as { cause?: unknown }).cause;
    if (cause instanceof Error && cause.message !== error.message) {
      lines.push(`Cause: ${cause.message}`);
    }
    return lines.join('\n');
  }

  if (error instanceof Error) return `Unexpected error: ${error.message}`;
  return `Unexpected error: ${String(error)}`;
}
