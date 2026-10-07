/**
 * The PreToolUse hook the CLI runs before every tool call (`claude/settings.json`):
 *   node /app/apply/dist/hooks/tool-gate.js
 *
 * It reads the hook input from stdin and answers with an exit code: 0 and silence for an allowed
 * call, 2 with the reason on stderr for a denial. It never prints to stdout and never exits 1:
 * a rule that cannot be loaded, stdin that cannot be read and any exception all exit 2.
 *
 * This file runs on load and is never imported; the rules are in `gate-rules.ts`, and the answer's
 * shape is Phase 21's `runGate`.
 */

const DENY_EXIT_CODE = 2;
const INTERNAL_ERROR = 'tool gate: internal error';

function refuse(reason: string): never {
  process.stderr.write(`${reason}\n`);
  process.exit(DENY_EXIT_CODE);
}

process.on('uncaughtException', () => refuse(INTERNAL_ERROR));
process.on('unhandledRejection', () => refuse(INTERNAL_ERROR));

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
}

try {
  const [{ runGate }, { decide }] = await Promise.all([
    import('../../../workspace/src/hooks/gate-rules.js'),
    import('./gate-rules.js'),
  ]);
  const outcome = runGate(await readStdin(), decide);
  if (outcome.stderr !== '') process.stderr.write(`${outcome.stderr}\n`);
  process.exitCode = outcome.exitCode;
} catch {
  refuse(INTERNAL_ERROR);
}
