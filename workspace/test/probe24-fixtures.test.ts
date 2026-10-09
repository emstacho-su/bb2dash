/**
 * Phase 24a: the probes before the freeze, as recorded (brief 109, tasks 1 to 6), and the frozen
 * contract fixtures (task 12). The PM's file: it reads the fixture folder as plain JSON and
 * imports nothing from `src/`, so a change to the runner cannot move what a probe showed.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONTRACT = path.join(HERE, 'fixtures', 'contract24');
const PROBES = path.join(CONTRACT, 'probes');

const PINNED_CLI = '2.1.289';
const OAUTH_SOURCE = 'none';
const MCP_PREFIX = 'mcp__';
const ANSWER_CAP_USD = 0.95;
const PROBE_SERVER = 'bb2dash';
const PROBE_TOOL = 'mcp__bb2dash__search_materials';
const PROBE_CALLS = 4;

type Line = Record<string, unknown>;

interface Block {
  type?: string;
  name?: string;
  is_error?: boolean;
}

function readJsonl(name: string): Line[] {
  return fs
    .readFileSync(path.join(PROBES, name), 'utf8')
    .split('\n')
    .filter((text) => text.trim() !== '')
    .map((text) => JSON.parse(text) as Line);
}

function initOf(lines: Line[]): Line {
  const init = lines.find((line) => line.type === 'system' && line.subtype === 'init');
  if (init === undefined) throw new Error('the recording has no init line');
  return init;
}

function resultOf(lines: Line[]): Line {
  const results = lines.filter((line) => line.type === 'result');
  expect(results).toHaveLength(1);
  return results[0] as Line;
}

function blocksOf(lines: Line[], lineType: string, blockType: string): Block[] {
  return lines
    .filter((line) => line.type === lineType)
    .flatMap((line) => {
      const content = (line.message as { content?: unknown } | undefined)?.content;
      return Array.isArray(content) ? (content as Block[]) : [];
    })
    .filter((block) => block.type === blockType);
}

const RECORDINGS = [
  'p1-no-mcp-server.jsonl',
  'p2-no-session-persistence.jsonl',
  'p3-turn-10-of-10.jsonl',
  'p5-prompt-128000-bytes.jsonl',
  'p6-mcp-env-and-error-result.jsonl',
] as const;

describe('the probe recordings as files', () => {
  it('are the five recordings the manifest names', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(PROBES, 'recordings.json'), 'utf8')) as {
      claude_code_version: string;
      fixtures: Record<string, unknown>;
    };
    expect(manifest.claude_code_version).toBe(PINNED_CLI);
    expect(Object.keys(manifest.fixtures).sort()).toEqual([...RECORDINGS].sort());
    expect(fs.readdirSync(PROBES).filter((name) => name.endsWith('.jsonl')).sort()).toEqual([...RECORDINGS].sort());
  });

  it.each(RECORDINGS)('%s was made by the pinned CLI on the subscription token and ended success', (name) => {
    const lines = readJsonl(name);
    const init = initOf(lines);
    expect(init.claude_code_version).toBe(PINNED_CLI);
    expect(init.apiKeySource).toBe(OAUTH_SOURCE);
    expect(init.permissionMode).toBe('dontAsk');
    const result = resultOf(lines);
    expect(result.subtype).toBe('success');
    expect(result.is_error).toBe(false);
  });

  it.each(RECORDINGS)('%s holds no plan usage line and no filler', (name) => {
    const text = fs.readFileSync(path.join(PROBES, name), 'utf8');
    expect(text).not.toContain('rate_limit_event');
    expect(text).not.toContain('synthetic lorem');
  });
});

const CONTRACT_JSON = [
  'ask-options.json',
  'attachment-read.json',
  'batch-answer.json',
  'batch-request.json',
  'claim-v2.json',
  'embed.json',
  'ingest-claim.json',
  'ingest-finish.json',
  'ingest-heartbeat.json',
  'ingest-put-text.json',
  'job-claim.json',
  'job-finish.json',
  'plan.json',
  'planner-feed.json',
  'search-function.json',
  'search-row.json',
  'sources-event.json',
  'turn-context.json',
  'turn-put.json',
] as const;
const CONTRACT_TEXT = ['feed-block.txt', 'fence.txt', 'lines.txt'] as const;
const ROUTINE_IDS = ['quiz', 'study-guide', 'explain-file', 'summarise-reading', 'plan-week', 'draft-help'];
const ROUTINE_INSTRUCTIONS_MAX = 4000;
const SEARCH_ROW_KEYS = [
  'kind', 'unit_id', 'file_id', 'document_id', 'course_id', 'title', 'unit_kind', 'unit_no', 'part_no',
  'similarity', 'score', 'passage', 'has_notes',
];

function readContract<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(CONTRACT, name), 'utf8')) as T;
}

/** A text fixture with a Windows checkout's line endings, if any, taken back to LF. */
function readText(name: string): string {
  return fs.readFileSync(path.join(CONTRACT, name), 'utf8').replaceAll('\r\n', '\n');
}

describe('the frozen contract fixtures (task 12)', () => {
  it('are the nineteen JSON files, each of which parses', () => {
    expect(fs.readdirSync(CONTRACT).filter((name) => name.endsWith('.json')).sort()).toEqual([...CONTRACT_JSON].sort());
    for (const name of CONTRACT_JSON) expect(() => readContract<unknown>(name)).not.toThrow();
  });

  it('are the three text files, each ending in one newline and holding no carriage return', () => {
    expect(fs.readdirSync(CONTRACT).filter((name) => name.endsWith('.txt')).sort()).toEqual([...CONTRACT_TEXT].sort());
    for (const name of CONTRACT_TEXT) {
      const text = readText(name);
      expect(text.endsWith('\n')).toBe(true);
      expect(text.endsWith('\n\n')).toBe(false);
    }
  });

  it('give a search row the same keys wherever one is shown', () => {
    const row = readContract<Record<string, unknown>>('search-row.json');
    expect(Object.keys(row)).toEqual(SEARCH_ROW_KEYS);
    const answer = readContract<{ queries: { hits: Record<string, unknown>[] }[] }>('batch-answer.json');
    const fromFunction = readContract<{ answer: { results: Record<string, unknown>[] } }>('search-function.json');
    const shown = [...answer.queries.flatMap((query) => query.hits), ...fromFunction.answer.results];
    expect(shown.length).toBeGreaterThan(0);
    for (const hit of shown) expect(Object.keys(hit)).toEqual(SEARCH_ROW_KEYS);
    expect(new Set(shown.map((hit) => hit.kind))).toEqual(new Set(['material', 'upload', 'memory']));
  });

  it('give an attachment the same keys in the batch answer as the read function returns', () => {
    const read = readContract<Record<string, unknown>>('attachment-read.json');
    const answer = readContract<{ attachments: Record<string, unknown>[] }>('batch-answer.json');
    for (const attachment of answer.attachments) expect(Object.keys(attachment)).toEqual(Object.keys(read));
  });

  it('hold the fence as two block lines', () => {
    expect(readText('fence.txt')).toBe('<<<block {marker} {kind} {label}>>>\n<<<block {marker} end>>>\n');
  });

  it('seed the six routines, each with its wording inside the limit', () => {
    const routines = readContract<{ id: string; needs: string; instructions: string }[]>(path.join('seed', 'routines.json'));
    expect(routines.map((routine) => routine.id)).toEqual(ROUTINE_IDS);
    for (const routine of routines) {
      expect(['nothing', 'file', 'course_or_file']).toContain(routine.needs);
      expect(routine.instructions.length).toBeGreaterThan(0);
      expect(routine.instructions.length).toBeLessThanOrEqual(ROUTINE_INSTRUCTIONS_MAX);
    }
  });
});

describe('P-1: a turn with no MCP server', () => {
  const lines = readJsonl('p1-no-mcp-server.jsonl');

  it('lists no server and no MCP tool on its init line', () => {
    const init = initOf(lines);
    expect(init.mcp_servers).toEqual([]);
    expect((init.tools as string[]).filter((tool) => tool.startsWith(MCP_PREFIX))).toEqual([]);
  });

  it('calls no tool', () => {
    expect(blocksOf(lines, 'assistant', 'tool_use')).toEqual([]);
  });
});

describe('P-3: the tenth of ten fresh turns', () => {
  it('costs its own turn, under the answering cap', () => {
    const result = resultOf(readJsonl('p3-turn-10-of-10.jsonl'));
    expect(result.num_turns).toBe(1);
    expect(result.total_cost_usd as number).toBeGreaterThan(0);
    expect(result.total_cost_usd as number).toBeLessThan(ANSWER_CAP_USD);
  });

  it('states the code word that only the first turn gave', () => {
    expect(resultOf(readJsonl('p3-turn-10-of-10.jsonl')).result).toMatch(/^saffron-\d{4}$/);
  });
});

describe('P-6: a per-request MCP config and a tool that answers with an error', () => {
  const lines = readJsonl('p6-mcp-env-and-error-result.jsonl');

  it('starts exactly the one server the config names, connected, with its one tool', () => {
    const init = initOf(lines);
    const servers = init.mcp_servers as { name: string; status: string }[];
    expect(servers.map((server) => `${server.name}:${server.status}`)).toEqual([`${PROBE_SERVER}:connected`]);
    expect(init.tools).toEqual([PROBE_TOOL]);
  });

  it('makes four calls, the gate allowing each', () => {
    const calls = blocksOf(lines, 'assistant', 'tool_use');
    expect(calls.map((call) => call.name)).toEqual(Array.from({ length: PROBE_CALLS }, () => PROBE_TOOL));
    const gateAnswers = lines.filter((line) => line.type === 'system' && line.subtype === 'hook_response');
    expect(gateAnswers).toHaveLength(PROBE_CALLS);
    for (const answer of gateAnswers) expect(answer.exit_code).toBe(0);
  });

  it('gets an error result on the fourth call only, and the turn still ends success', () => {
    const results = blocksOf(lines, 'user', 'tool_result');
    expect(results.map((block) => block.is_error === true)).toEqual([false, false, false, true]);
    expect(resultOf(lines).subtype).toBe('success');
  });

  it("repeats the value the server read from the config's env", () => {
    expect(resultOf(lines).result).toContain('BB2DASH_MAX_SEARCHES=3');
  });
});
