/**
 * Phase 22, visual round, V-8: the wizard's five step markers are pills. On `main` their corner was
 * `--radius-md` (8px, a pill at their height); direction D made that token 4px, so the rule names
 * the pill token. No entry of `component-changes.json` names this rule.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS = readFileSync(
  join(process.cwd(), 'src/components/planner/PlannerEventWizard.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

describe('planner wizard step markers (V-8)', () => {
  it('draws a step marker as a pill', () => {
    const match = /^\.step\s*\{([^}]*)\}/m.exec(CSS);
    expect(match).not.toBeNull();
    expect(match?.[1]).toMatch(/border-radius:\s*var\(--radius-chip\)/);
  });
});
