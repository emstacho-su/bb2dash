import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  QUERIES_MAX,
  QUERIES_MAX_DEEP,
  fallbackPlan,
  parsePlan,
  planInput,
  previousUserMessage,
  type PlanLimits,
  type PlanParse,
} from '../src/plan.js';
import type { StoredMessage } from '../src/turn-context.js';
import { CONTRACT, MARKER, contextFixture, emptyContext, readContractJson } from './helpers/context24.js';

const KNOWN = ['BIO.110', 'BIO.110.lab', 'HST.205', 'MAT.221'];
const limits = (overrides: Partial<PlanLimits> = {}): PlanLimits => ({ scope: null, knownCourses: KNOWN, deep: false, today: '2026-10-08', ...overrides });
const FENCE = '```';
const query = (q: string, kinds: string[] = ['material'], course: string | null = null): Record<string, unknown> => ({ q, kinds, course });
const planJson = (queries: unknown[], feed: Record<string, unknown> = { from: null, to: null }): string => JSON.stringify({ queries, feed });

const REASON_CLASSES = ['empty', 'not_json', 'not_object', 'no_queries'];

interface Case {
  name: string;
  output: string;
  limits?: Partial<PlanLimits>;
  expectPlan?: (plan: Extract<PlanParse, { ok: true }>['plan']) => void;
  reason?: string;
}

const CASES: Case[] = [
  {
    name: 'the frozen plan.json, as the bare object',
    output: JSON.stringify(readContractJson('plan.json')),
    expectPlan: (plan) => {
      expect(plan.queries).toHaveLength(2);
      expect(plan.queries[0]).toEqual({ q: 'membrane transport', kinds: ['material', 'upload', 'memory'], course: 'BIO.110' });
      expect(plan.queries[1]?.course).toBeNull();
    },
  },
  {
    name: 'the object inside one code fence (every recorded answer came so)',
    output: `${FENCE}json\n${planJson([query('midterm', ['material'], 'BIO.110')])}\n${FENCE}`,
    expectPlan: (plan) => expect(plan.queries[0]).toEqual({ q: 'midterm', kinds: ['material'], course: 'BIO.110' }),
  },
  {
    name: 'a fence with no language word, and white space around it',
    output: `\n  ${FENCE}\n${planJson([query('syllabus')])}\n${FENCE}  \n`,
    expectPlan: (plan) => expect(plan.queries[0]?.q).toBe('syllabus'),
  },
  { name: 'a sentence before the object', output: `Here is the plan: ${planJson([query('x')])}`, reason: 'not_json' },
  { name: 'a sentence after the fence', output: `${FENCE}json\n${planJson([query('x')])}\n${FENCE}\nHope that helps.`, reason: 'not_json' },
  { name: 'two fences', output: `${FENCE}json\n${planJson([query('x')])}\n${FENCE}\n${FENCE}json\n${planJson([query('y')])}\n${FENCE}`, reason: 'not_json' },
  { name: 'an empty output', output: '  \n', reason: 'empty' },
  { name: 'a JSON array', output: '[{"q":"x"}]', reason: 'not_object' },
  { name: 'an object with no queries list', output: '{"query":"x"}', reason: 'not_object' },
  { name: 'queries that all fail the check', output: planJson([query('', ['material']), query('x', ['everything']), 7, null]), reason: 'no_queries' },
  {
    name: 'a seventh query is dropped (Deep keeps six)',
    output: planJson(Array.from({ length: 7 }, (_, i) => query(`topic ${i + 1}`))),
    limits: { deep: true },
    expectPlan: (plan) => {
      expect(plan.queries).toHaveLength(QUERIES_MAX_DEEP);
      expect(plan.queries.at(-1)?.q).toBe('topic 6');
    },
  },
  {
    name: 'a fifth query is dropped when not Deep',
    output: planJson(Array.from({ length: 5 }, (_, i) => query(`topic ${i + 1}`))),
    expectPlan: (plan) => expect(plan.queries).toHaveLength(QUERIES_MAX),
  },
  {
    name: 'a course outside the scope, or not his, is not searched',
    output: planJson([query('a', ['material'], 'HST.205'), query('b', ['material'], 'BIO.110'), query('c', ['material'], 'NOPE.999')]),
    limits: { scope: ['BIO.110', 'BIO.110.lab'] },
    expectPlan: (plan) => expect(plan.queries.map((q) => q.course)).toEqual([null, 'BIO.110', null]),
  },
  {
    name: 'a query cut to 2,000 characters, kinds kept in the known order and cut to the known three',
    output: planJson([query('x'.repeat(3000), ['memory', 'bogus', 'material'])]),
    expectPlan: (plan) => {
      expect([...(plan.queries[0]?.q ?? '')]).toHaveLength(2000);
      expect(plan.queries[0]?.kinds).toEqual(['material', 'memory']);
    },
  },
  {
    name: 'a window outside 180 days is clamped, a bad date is the default',
    output: planJson([query('x')], { from: '2025-01-01', to: 'next friday' }),
    expectPlan: (plan) => expect(plan.feed).toEqual({ from: '2026-04-11', to: null }),
  },
  ...['2026-11-31', '2027-02-29', '2026-13-01', '2026-00-10', '2026-04-31'].map((date) => ({
    name: 'an impossible date (' + date + ') is the default end of the window, never an error',
    output: planJson([query('x')], { from: date, to: '2026-10-20' }),
    expectPlan: (plan: Extract<PlanParse, { ok: true }>['plan']) => expect(plan.feed).toEqual({ from: null, to: '2026-10-20' }),
  })),
  {
    name: 'a real leap day stands',
    output: planJson([query('x')], { from: '2028-02-29', to: null }),
    limits: { today: '2028-03-01' },
    expectPlan: (plan) => expect(plan.feed).toEqual({ from: '2028-02-29', to: null }),
  },
  {
    name: 'a window inside 180 days stands',
    output: planJson([query('x')], { from: '2026-09-01', to: '2026-12-31' }),
    expectPlan: (plan) => expect(plan.feed).toEqual({ from: '2026-09-01', to: '2026-12-31' }),
  },
];

describe('the planning turn output', () => {
  it.each(CASES)('$name', ({ output, limits: over, expectPlan, reason }) => {
    const parsed = parsePlan(output, limits(over));
    if (reason !== undefined) {
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.reason).toBe(reason);
        expect(parsed.length).toBe([...output].length);
      }
      return;
    }
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expectPlan?.(parsed.plan);
  });

  it('holds at least 12 recorded cases', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(12);
  });

  it('reads the answer recorded on the pinned CLI (probe P-1) as a plan', () => {
    const lines = fs
      .readFileSync(path.join(CONTRACT, 'probes', 'p1-no-mcp-server.jsonl'), 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as { type?: string; message?: { content?: Array<{ type: string; text?: string }> } });
    const text = lines.flatMap((line) => (line.type === 'assistant' ? (line.message?.content ?? []) : [])).find((block) => block.type === 'text')?.text ?? '';
    const parsed = parsePlan(text, limits());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.plan.queries[0]?.q).toBe('midterm');
  });

  it('gives a reason from the short fixed list and never the output itself', () => {
    const secret = 'THE-TEXT-OF-A-PASSAGE';
    for (const output of [`${secret} not json`, `[${secret}]`, `{"queries":["${secret}"]}`, '']) {
      const parsed = parsePlan(output, limits());
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(REASON_CLASSES).toContain(parsed.reason);
        expect(JSON.stringify(parsed)).not.toContain(secret);
      }
    }
  });
});

describe('the fallback plan', () => {
  it('is one query, the question as written, all three kinds, no course', () => {
    const plan = fallbackPlan('What does the lab handout say about osmosis in the second experiment, and how does it compare with the first?', 'earlier question');
    expect(plan.queries).toEqual([{ q: 'What does the lab handout say about osmosis in the second experiment, and how does it compare with the first?', kinds: ['material', 'upload', 'memory'], course: null }]);
    expect(plan.feed).toEqual({ from: null, to: null });
  });

  it('puts the previous user message after a question of 80 characters or fewer', () => {
    const plan = fallbackPlan('and the second one?', 'Explain facilitated diffusion.');
    expect(plan.queries[0]?.q).toBe('and the second one?\nExplain facilitated diffusion.');
    expect(fallbackPlan('and the second one?', null).queries[0]?.q).toBe('and the second one?');
    expect(fallbackPlan('x'.repeat(81), 'previous').queries[0]?.q).toBe('x'.repeat(81));
  });

  it('cuts to 2,000 characters as much of the previous message as fits', () => {
    const plan = fallbackPlan('short', 'p'.repeat(5000));
    expect([...(plan.queries[0]?.q ?? '')]).toHaveLength(2000);
  });

  it('finds the previous user message among the stored ones', () => {
    const messages: StoredMessage[] = [
      { id: '1', role: 'user', content: 'first', createdAt: '', errorCode: null },
      { id: '2', role: 'assistant', content: 'answer', createdAt: '', errorCode: null },
      { id: '3', role: 'user', content: 'second', createdAt: '', errorCode: null },
      { id: '4', role: 'assistant', content: 'answer two', createdAt: '', errorCode: 'cancelled' },
    ];
    expect(previousUserMessage(messages)).toBe('second');
    expect(previousUserMessage([])).toBeNull();
  });
});

describe('the planning input', () => {
  const facts = (overrides: Record<string, unknown> = {}) => {
    const context = contextFixture();
    return {
      marker: MARKER,
      question: 'What does the lab handout say about osmosis?',
      rollingSummary: context.rollingSummary,
      messages: context.messages,
      courses: context.courses,
      scope: null,
      attachmentTitles: context.attachments.map((attachment) => attachment.title),
      today: '2026-10-08',
      deep: false,
      ...overrides,
    };
  };

  it('holds the question, the summary, the last turns, the courses, the scope, the titles and the date', () => {
    const input = planInput(facts({ scope: ['BIO.110', 'BIO.110.lab'] }));
    expect(input).toContain('What does the lab handout say about osmosis?');
    expect(input).toContain('earlier in this conversation we compared diffusion');
    expect(input).toContain('Explain facilitated diffusion.');
    expect(input).toContain('BIO.110: Intro Biology');
    expect(input).toContain('Scope: BIO.110, BIO.110.lab');
    expect(input).toContain('Attached files (titles only): Week 5 slides.pptx; lab-notes.pdf');
    expect(input).toContain('Today: 2026-10-08');
    expect(input).toContain('Query limit: 4');
    expect(planInput(facts({ deep: true }))).toContain('Query limit: 6');
    expect(input.startsWith('/')).toBe(false);
  });

  it('holds no passage and no attachment text', () => {
    const passage = 'Synthetic passage: passive transport moves a solute down its gradient and needs no energy.';
    const attachmentText = 'Synthetic slide one: the fluid mosaic model.';
    const input = planInput(facts());
    expect(input).not.toContain(passage);
    expect(input).not.toContain(attachmentText);
    const answer = readContractJson('batch-answer.json') as { attachments: Array<{ units: Array<{ text: string }> }> };
    for (const attachment of answer.attachments) for (const unit of attachment.units) expect(input).not.toContain(unit.text);
  });

  it('cuts the last turns to 6,000 bytes and fences them as data', () => {
    const messages: StoredMessage[] = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `${i}:${'t'.repeat(2000)}`,
      createdAt: '',
      errorCode: null,
    }));
    const input = planInput(facts({ messages, rollingSummary: null }));
    const turnBytes = input
      .split('\n')
      .filter((line) => line.startsWith('<<<block') && line.includes(' turn '));
    expect(turnBytes.length).toBeGreaterThan(0);
    expect(turnBytes.length).toBeLessThanOrEqual(3);
    expect(input).toContain('19:ttt');
    expect(input).not.toContain('\n0:ttt');
    expect(emptyContext().messages).toEqual([]);
  });
});
