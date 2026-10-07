import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  FOLLOW_UP_LENGTH_MAX,
  HIGH_LENGTH_OVER,
  HIGH_VERBS,
  LOW_CUES,
  LOW_LENGTH_MAX,
  routeTier,
} from '../src/router.js';
import { TIERS, TIER_ROUTES, type Tier } from '../src/tiers.js';

interface RouterCase {
  prompt: string;
  padTo?: number;
  priorTier: Tier | null;
  expect: Tier;
  step?: number;
  why: string;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'fixtures', 'router-cases.json');
const cases = (JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as { cases: RouterCase[] }).cases;

/** The acceptance script's five questions (brief 102, steps 3 to 7), word for word. */
const ACCEPTANCE: ReadonlyArray<{ step: number; prompt: string; expect: Tier }> = [
  { step: 3, prompt: 'What does the IST.323 syllabus say about late work?', expect: 'low' },
  { step: 4, prompt: 'What did I decide about ECN.304 Quiz 2?', expect: 'low' },
  { step: 5, prompt: 'Open the IST.323 syllabus and list its section headings', expect: 'low' },
  {
    step: 6,
    prompt: "Explain how a systems analyst's role differs from a project manager's, using the IST.352 slides",
    expect: 'mid',
  },
  { step: 7, prompt: 'Draft a two-week study plan for ECN.304 from the lecture slides', expect: 'high' },
];

const FILLER = ' zz';

/** The case's prompt, padded with filler to exactly `padTo` characters when the case asks for it. */
function materialize(c: RouterCase): string {
  if (c.padTo === undefined) return c.prompt;
  const padded = [...(c.prompt + FILLER.repeat(c.padTo))].slice(0, c.padTo);
  if (padded[padded.length - 1] === ' ') padded[padded.length - 1] = 'z';
  return padded.join('');
}

const length = (text: string): number => [...text].length;

describe('the router fixture', () => {
  it('holds at least 30 cases, at least 8 per tier and at least 6 follow-ups', () => {
    expect(cases.length).toBeGreaterThanOrEqual(30);
    for (const tier of TIERS) {
      expect(cases.filter((c) => c.expect === tier).length, tier).toBeGreaterThanOrEqual(8);
    }
    const followUps = cases.filter((c) => c.priorTier !== null && length(materialize(c)) <= FOLLOW_UP_LENGTH_MAX);
    expect(followUps.length).toBeGreaterThanOrEqual(6);
  });

  it('pads a case to exactly the length it names', () => {
    for (const c of cases.filter((x) => x.padTo !== undefined)) {
      const text = materialize(c);
      expect(length(text)).toBe(c.padTo);
      expect(text.trim()).toBe(text);
    }
  });

  it("holds the acceptance script's five questions with their tiers", () => {
    for (const q of ACCEPTANCE) {
      const found = cases.find((c) => c.step === q.step);
      expect(found, `step ${q.step}`).toBeDefined();
      expect(found?.prompt).toBe(q.prompt);
      expect(found?.priorTier).toBeNull();
      expect(found?.expect).toBe(q.expect);
    }
  });
});

describe('routeTier', () => {
  it.each(cases.map((c) => [c.expect, c.why, c] as const))('%s: %s', (_tier, _why, c) => {
    expect(routeTier(materialize(c), c.priorTier)).toBe(c.expect);
  });

  it('routes acceptance steps 3, 4 and 5 low, step 6 mid and step 7 high', () => {
    expect(ACCEPTANCE.map((q) => routeTier(q.prompt, null))).toEqual(['low', 'low', 'low', 'mid', 'high']);
  });

  it('reads the length limits at their edges', () => {
    expect(HIGH_LENGTH_OVER).toBe(600);
    expect(LOW_LENGTH_MAX).toBe(200);
    expect(FOLLOW_UP_LENGTH_MAX).toBe(40);
  });

  it('holds the two word lists the Contract names', () => {
    expect([...HIGH_VERBS]).toEqual([
      'draft',
      'write',
      'plan',
      'build',
      'outline',
      'prepare',
      'revise',
      'critique',
      'solve',
      'create',
      'analyze',
      'compare',
    ]);
    expect([...LOW_CUES]).toEqual([
      'what',
      'when',
      'where',
      'which',
      'who',
      'find',
      'show',
      'list',
      'pull',
      'open',
      'get',
      'is there',
      'does',
    ]);
  });

  it('ignores case and surrounding white space', () => {
    expect(routeTier('  DRAFT a plan  ', null)).toBe('high');
    expect(routeTier('\n what is due friday?\n', null)).toBe('low');
  });

  it('does not read a course code as a sentence break', () => {
    expect(routeTier('Find IST.323 write-up dates', null)).toBe('mid');
    expect(routeTier('Show ECN.304. Draft nothing', null)).toBe('high');
  });

  it('is pure: the same input gives the same tier', () => {
    const prompt = 'Compare the two readings';
    expect(routeTier(prompt, 'low')).toBe(routeTier(prompt, 'low'));
  });
});

describe('TIER_ROUTES', () => {
  it('maps the three tiers to the claude CLI aliases', () => {
    expect(TIERS).toEqual(['low', 'mid', 'high']);
    expect(TIER_ROUTES).toEqual({
      low: { provider: 'claude-cli', model: 'haiku' },
      mid: { provider: 'claude-cli', model: 'sonnet' },
      high: { provider: 'claude-cli', model: 'opus' },
    });
  });

  it('is a frozen code constant', () => {
    expect(Object.isFrozen(TIER_ROUTES)).toBe(true);
    expect(Object.isFrozen(TIER_ROUTES.low)).toBe(true);
  });
});
