/**
 * The tool gate's rules (brief 102, Contract, Tool gate). Read-only v1: four read tools, and the
 * notes store only through two collections.
 *
 * The gate only denies or stays silent. A denial is exit code 2 with the reason for stderr; an
 * allowed call is exit code 0 with nothing printed, so the CLI's own permission rules still decide.
 * Anything the gate cannot read (text that is not JSON, a missing tool name, a collection that is
 * not a string, an exception) is a denial: it never fails open.
 *
 * Pure and dependency-free: `tool-gate.ts` is the process around it.
 */

export const ALLOWED_TOOLS = [
  'mcp__bb2dash__search_materials',
  'mcp__bb2dash__get_material_text',
  'mcp__bb2dash__list_courses',
  'mcp__rag__search_context',
] as const;

/** The notes store's search tool: the one allowed tool with a rule on its input. */
export const RAG_SEARCH_TOOL = 'mcp__rag__search_context';

/** The collections the assistant may search (B-5 (g); O-1, answered 2026-10-05). */
export const RAG_COLLECTIONS = ['bb2dash', 'bb2dash-inbox-decisions'] as const;

export const COLLECTION_DENY_REASON = `collection must be one of: ${RAG_COLLECTIONS.join(', ')}`;

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

  if (toolName === RAG_SEARCH_TOOL) {
    const input = payload.tool_input;
    const collection = isRecord(input) ? input.collection : undefined;
    if (typeof collection !== 'string' || !(RAG_COLLECTIONS as readonly string[]).includes(collection)) {
      return deny(COLLECTION_DENY_REASON);
    }
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
