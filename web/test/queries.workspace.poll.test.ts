/**
 * The Workspace's open states, and the poll they decide (Phase 21, the review
 * round of 2026-10-06; rulings V4, findings CR-12 and CR-9).
 *
 * CR-12. A request is open while it is `queued` or `claimed`. That pair was
 * written out twice under `src/` (the query layer and the thread), so the two
 * could drift apart. It has one definition, exported from the query layer, and
 * the audit below reads the Workspace's source files so a second copy cannot
 * come back unnoticed.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => {
    throw new Error('this file reads no row');
  },
}));

const workspace = await import('@/lib/queries.workspace');
const { normalizeRequest, openRequestOf } = workspace;

const CONVERSATION = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';
const QUESTION = '0b0fe08b-1d79-41a7-9674-2a3de0b4986e';

function request(id: number, state: string) {
  const row = normalizeRequest({
    id,
    conversation_id: CONVERSATION,
    user_message_id: QUESTION,
    state,
  });
  if (row === null) throw new Error(`not a request: ${id} ${state}`);
  return row;
}

/* ---------------------------------------------------------------------------
 * CR-12: one definition of the open states
 * ------------------------------------------------------------------------ */

// `process.cwd()` rather than `import.meta.url`, as `audits.test.ts` explains:
// under jsdom the module URL is an http one. Vitest runs from `web/`.
const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** A source path the way the repo writes it: forward slashes, from `src/`. */
function fromSrc(file: string): string {
  return relative(SRC, file).split(sep).join('/');
}

/**
 * The Workspace's own source: its route, its components and its `lib` modules.
 * `queries.sync.ts` is left out on purpose. It names the same two words for
 * another table (`agent_requests`, the sync queue), which is not this rule.
 */
const WORKSPACE_SOURCE = walk(SRC)
  .map(fromSrc)
  .filter((file) => /(^|\/)workspace\/|(^|\/)lib\/[^/]*workspace[^/]*$/.test(file))
  .filter((file) => /\.tsx?$/.test(file));

/** The pair written out as an array literal, in either quote style. */
const OPEN_STATES_LITERAL = /\[\s*['"]queued['"]\s*,\s*['"]claimed['"]\s*,?\s*\]/;

describe('the open states have one definition (CR-12)', () => {
  it('is exported from the query layer: queued and claimed, nothing else', () => {
    expect(workspace.WORKSPACE_OPEN_STATES).toEqual(['queued', 'claimed']);
  });

  it('is what the open request is picked by', () => {
    const states = ['queued', 'claimed', 'done', 'failed', 'cancelled'];
    const open = states.filter((state) => openRequestOf([request(1, state)]) !== null);
    expect(open).toEqual(workspace.WORKSPACE_OPEN_STATES);
  });

  it('finds the Workspace`s source files to read', () => {
    expect(WORKSPACE_SOURCE).toContain('lib/queries.workspace.ts');
    expect(WORKSPACE_SOURCE).toContain('components/workspace/thread.ts');
    expect(WORKSPACE_SOURCE).toContain('app/(app)/workspace/Workspace.tsx');
  });

  it('is written out once under src/: every other file imports it', () => {
    const writtenIn = WORKSPACE_SOURCE.filter((file) =>
      OPEN_STATES_LITERAL.test(readFileSync(join(SRC, file), 'utf8')),
    );
    expect(writtenIn).toEqual(['lib/queries.workspace.ts']);
  });
});
