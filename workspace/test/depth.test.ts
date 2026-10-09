import { describe, expect, it } from 'vitest';

import { DEPTHS, isDepth, tierForDepth } from '../src/depth.js';
import { routeTier } from '../src/router.js';

describe('depth to tier', () => {
  it('maps the three chosen depths to a fixed tier whatever the question says', () => {
    expect(tierForDepth('quick', 'Draft a study plan for the whole term', 'high')).toBe('low');
    expect(tierForDepth('standard', 'What is due today?', 'low')).toBe('mid');
    expect(tierForDepth('deep', 'ok', null)).toBe('high');
  });

  it('routes auto on the question and the last auto tier', () => {
    expect(tierForDepth('auto', 'What does the syllabus say about late work?', null)).toBe(routeTier('What does the syllabus say about late work?', null));
    expect(tierForDepth('auto', 'Draft a two-week study plan from the slides', null)).toBe('high');
  });

  it('keeps a short auto follow-up on the last AUTO tier, so a Deep answer before it does not stick', () => {
    // The conversation's last answer was Deep (high), but its last auto answer was mid: the context hands over mid.
    expect(tierForDepth('auto', 'and the second one?', 'mid')).toBe('mid');
    // With no auto answer before, a short follow-up has nothing to keep.
    expect(tierForDepth('auto', 'and the second one?', null)).toBe('mid');
    expect(tierForDepth('auto', 'and the second one?', 'low')).toBe('low');
  });

  it('knows its four names', () => {
    expect(DEPTHS).toEqual(['auto', 'quick', 'standard', 'deep']);
    expect(isDepth('deep')).toBe(true);
    expect(isDepth('deeper')).toBe(false);
    expect(isDepth(null)).toBe(false);
  });
});
