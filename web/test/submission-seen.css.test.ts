/**
 * The "seen" time of the submission line keeps its neighbours' size (Phase 22, visual round, V-2).
 *
 * Task 28 took the code face off the stamp; the size went with the class (`tokens.mono`), and the
 * stamp grew beside its 11 px neighbours. It now takes the line's own note class, which sets the size
 * as a token in the body face, so it reads as the notes beside it do.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const strip = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '');
const TSX = readFileSync(join(process.cwd(), 'src/components/popout/SubmissionBlock.tsx'), 'utf8');
const CSS = strip(readFileSync(join(process.cwd(), 'src/components/popout/SubmissionBlock.module.css'), 'utf8'));

function rule(selector: string): string {
  for (const match of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if ((match[1] ?? '').split(',').some((part) => part.trim() === selector)) return match[2] ?? '';
  }
  return '';
}

describe('SubmissionBlock — the seen stamp', () => {
  it('is drawn with the same class as the notes beside it', () => {
    expect(TSX).toMatch(/<span className=\{styles\.note\} title="When a Blackboard sync last saw this\.">/);
    expect(TSX).toMatch(/<span className=\{styles\.note\}>\s*submitted /);
  });

  it('sets that class at a size token, in the body face (no code face)', () => {
    const note = rule('.note');
    expect(note).toMatch(/font-size\s*:\s*var\(--text-xs\)/);
    expect(note).not.toMatch(/font-family\s*:\s*var\(--font-mono\)/);
  });
});
