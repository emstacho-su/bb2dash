/**
 * The tool gate's rules (brief 102, Contract, Tool gate; brief 109, "Gate"). Read-only: two tools,
 * the materials search and the materials reader. The notes store, its collection rule and the
 * course lister are gone from the Workspace (ruling W-2: one store, in the bb2dash project).
 *
 * The gate only denies or stays silent. A denial is exit code 2 with the reason for stderr; an
 * allowed call is exit code 0 with nothing printed, so the CLI's own permission rules still decide.
 * Anything the gate cannot read (text that is not JSON, a missing tool name, an exception) is a
 * denial: it never fails open.
 *
 * Pure and dependency-free: `tool-gate.ts` is the process around it.
 */

export const ALLOWED_TOOLS = ['mcp__bb2dash__search_materials', 'mcp__bb2dash__get_material_text'] as const;

/** Exit code 2 is the CLI's blocking code: the tool call is refused and stderr goes to the model. */
export const DENY_EXIT_CODE = 2;
export const SILENT_EXIT_CODE = 0;

const TOOL_NAME_SHOWN_MAX = 80;

export type GateDecision = { allow: true } | { allow: false; reason: string };

export interface GateOutcome {
  exitCode: typeof SILENT_EXIT_CODE | typeof DENY_EXIT_CODE;
  stderr: string;
}

const deny = (reason: string): GateDecision => ({ allow: false, reason });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The decision for one PreToolUse payload, as parsed from the hook's stdin. */
export function decide(payload: unknown): GateDecision {
  if (!isRecord(payload)) return deny('tool gate: the hook input is not a JSON object');

  const toolName = payload.tool_name;
  if (typeof toolName !== 'string' || toolName === '') return deny('tool gate: the hook input names no tool');

  if (!(ALLOWED_TOOLS as readonly string[]).includes(toolName)) {
    return deny(`tool not allowed: ${toolName.slice(0, TOOL_NAME_SHOWN_MAX)}`);
  }

  return { allow: true };
}

/** The gate's whole answer for the text on stdin: an exit code and what to write to stderr. */
export function runGate(stdinText: string, rule: (payload: unknown) => GateDecision = decide): GateOutcome {
  try {
    let payload: unknown;
    try {
      payload = JSON.parse(stdinText);
    } catch {
      return { exitCode: DENY_EXIT_CODE, stderr: 'tool gate: the hook input is not JSON' };
    }
    const decision = rule(payload);
    return decision.allow
      ? { exitCode: SILENT_EXIT_CODE, stderr: '' }
      : { exitCode: DENY_EXIT_CODE, stderr: decision.reason };
  } catch {
    return { exitCode: DENY_EXIT_CODE, stderr: 'tool gate: internal error' };
  }
}
