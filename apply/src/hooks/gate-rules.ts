/**
 * The tool gate's rules for an /inbox-apply run (Phase 23). Pure.
 *
 * The CLI runs the gate before every tool call, in the session and inside each agent it starts
 * (recorded on the pinned version: the hook input carries `agent_type` for an agent's call and
 * nothing for the session's own). Three callers, three sets:
 *
 *   the session        starts the two agents, reads SQL, searches the materials
 *   inbox-context      reads SQL, searches the materials
 *   inbox-writer       reads SQL and runs the writer's batches
 *
 * So only the writer can reach the tool that writes, whatever a row or a file told the session to
 * do. Every SQL text is also put through the guard here, before the server sees it. The gate only
 * denies or stays silent, and anything it cannot read is a denial: it never fails open. The
 * process around it and the answer's shape are Phase 21's (`workspace/src/hooks`).
 */

import type { GateDecision } from '../../../workspace/src/hooks/gate-rules.js';
import { AGENT_TOOL_NAMES, CONTEXT_AGENT, EXECUTE_TOOL, MATERIALS_TOOLS, QUERY_TOOL, WRITER_AGENT } from '../config.js';
import { checkSql } from '../mcp-sql/guard.js';

const SHOWN_MAX = 80;
const SESSION = '';
const AGENTS: readonly string[] = [CONTEXT_AGENT, WRITER_AGENT];

const deny = (reason: string): GateDecision => ({ allow: false, reason });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sqlDecision(input: unknown, mode: 'query' | 'execute'): GateDecision {
  const verdict = checkSql(isRecord(input) ? input.sql : undefined, mode);
  return verdict.ok ? { allow: true } : deny(`sql refused: ${verdict.reason}`);
}

/** The decision for one PreToolUse payload, as parsed from the hook's stdin. */
export function decide(payload: unknown): GateDecision {
  if (!isRecord(payload)) return deny('tool gate: the hook input is not a JSON object');

  const toolName = payload.tool_name;
  if (typeof toolName !== 'string' || toolName === '') return deny('tool gate: the hook input names no tool');

  const agentRaw = payload.agent_type;
  if (agentRaw !== undefined && agentRaw !== null && typeof agentRaw !== 'string') return deny('tool gate: agent_type is not text');
  const agent = typeof agentRaw === 'string' ? agentRaw : SESSION;
  if (agent !== SESSION && !AGENTS.includes(agent)) return deny(`agent not allowed: ${agent.slice(0, SHOWN_MAX)}`);

  if ((AGENT_TOOL_NAMES as readonly string[]).includes(toolName)) {
    if (agent !== SESSION) return deny('an agent cannot start another agent');
    const input = payload.tool_input;
    const wanted = isRecord(input) ? input.subagent_type : undefined;
    if (typeof wanted !== 'string' || !AGENTS.includes(wanted)) {
      return deny(`only the ${CONTEXT_AGENT} and ${WRITER_AGENT} agents can be started`);
    }
    return { allow: true };
  }

  if (toolName === QUERY_TOOL) return sqlDecision(payload.tool_input, 'query');

  if (toolName === EXECUTE_TOOL) {
    if (agent !== WRITER_AGENT) return deny(`only the ${WRITER_AGENT} agent writes`);
    return sqlDecision(payload.tool_input, 'execute');
  }

  if ((MATERIALS_TOOLS as readonly string[]).includes(toolName)) return { allow: true };

  return deny(`tool not allowed: ${toolName.slice(0, SHOWN_MAX)}`);
}
