/** The replay a fresh start carries: order, limits and the size of the prompt element. Part of runner.test.ts. */

import { describe, expect, it } from 'vitest';

import { ARG_MAX_BYTES, HISTORY_REPLAY, REPLAY_MAX_BYTES } from '../../src/config.js';
import type { HistoryMessage } from '../../src/providers/types.js';
import { QUESTION_HEADER, REPLAY_HEADER, asQuestion, buildPrompt, utf8Bytes } from '../../src/replay.js';
import { QUESTION } from '../helpers/fakes.js';

const QUESTION_MAX_CHARS = 8000;
const FOUR_BYTE_CHAR = '\u{1F4D8}';

const message = (role: HistoryMessage['role'], content: string): HistoryMessage => ({ role, content });

function conversation(pairs: number): HistoryMessage[] {
  return Array.from({ length: pairs * 2 }, (_, i) =>
    i % 2 === 0 ? message('user', `question number ${i / 2 + 1}`) : message('assistant', `answer number ${(i - 1) / 2 + 1}`),
  );
}

const replayBytes = (prompt: string, question: string): number => utf8Bytes(prompt) - utf8Bytes(question);

describe('the replay', () => {
  it('is the question alone when nothing is stored', () => {
    expect(buildPrompt([], QUESTION)).toBe(QUESTION);
  });

  it('emits the stored messages oldest first, each under its role, and the question last', () => {
    const prompt = buildPrompt(conversation(2), QUESTION);
    const order = ['question number 1', 'answer number 1', 'question number 2', 'answer number 2', QUESTION].map((text) => prompt.indexOf(text));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(prompt.startsWith(REPLAY_HEADER)).toBe(true);
    expect(prompt.endsWith(`${QUESTION_HEADER}\n\n${QUESTION}`)).toBe(true);
    expect(prompt).toContain('[user]\nquestion number 1');
    expect(prompt).toContain('[assistant]\nanswer number 1');
  });

  it("does not repeat the request's own user message: it is the prompt, never part of the history", () => {
    const prompt = buildPrompt(conversation(3), QUESTION);
    expect(prompt.split(QUESTION)).toHaveLength(2);
  });

  it('replays at most 20 messages, the newest ones', () => {
    const prompt = buildPrompt(conversation(13), QUESTION);
    const shown = conversation(13).filter((m) => prompt.includes(`]\n${m.content}\n`));
    expect(shown).toHaveLength(HISTORY_REPLAY);
    expect(prompt).not.toContain('question number 3\n');
    expect(prompt).toContain('question number 4\n');
    expect(prompt).toContain('answer number 13\n');
  });

  it('skips a stored message with no text', () => {
    const prompt = buildPrompt([message('user', 'asked'), message('assistant', ''), message('user', 'asked again')], QUESTION);
    expect(prompt).not.toContain('[assistant]');
    expect(prompt).toContain('[user]\nasked\n');
  });

  it('stays within 96 KiB, framing included, for 20 messages of 100000 characters', () => {
    const history = Array.from({ length: HISTORY_REPLAY }, (_, i) => message(i % 2 === 0 ? 'user' : 'assistant', String(i % 10).repeat(100_000)));
    const prompt = buildPrompt(history, QUESTION);
    expect(replayBytes(prompt, QUESTION)).toBeLessThanOrEqual(REPLAY_MAX_BYTES);
    expect(utf8Bytes(prompt)).toBeLessThan(ARG_MAX_BYTES);
    expect(prompt.endsWith(QUESTION)).toBe(true);
  });

  it('builds newest first: when only one message fits, it is the newest, cut and marked', () => {
    const history = [message('user', 'a'.repeat(100_000)), message('assistant', 'b'.repeat(100_000)), message('user', 'c'.repeat(100_000))];
    const prompt = buildPrompt(history, QUESTION);
    expect(prompt).toContain('ccccc');
    expect(prompt).not.toContain('bbbbb');
    expect(prompt).not.toContain('aaaaa');
    expect(prompt).toContain('[cut]');
    expect(replayBytes(prompt, QUESTION)).toBeLessThanOrEqual(REPLAY_MAX_BYTES);
    expect(replayBytes(prompt, QUESTION)).toBeGreaterThan(REPLAY_MAX_BYTES - 1024);
  });

  it('keeps every newer message whole and stops at the first older one that has to be cut', () => {
    const history = [message('user', 'old '.repeat(30_000)), message('assistant', 'middle answer'), message('user', 'newest question')];
    const prompt = buildPrompt(history, QUESTION);
    expect(prompt).toContain('[assistant]\nmiddle answer\n');
    expect(prompt).toContain('[user]\nnewest question\n');
    expect(prompt).toContain('old old old');
    expect(prompt.indexOf('old old')).toBeLessThan(prompt.indexOf('middle answer'));
    expect(replayBytes(prompt, QUESTION)).toBeLessThanOrEqual(REPLAY_MAX_BYTES);
  });

  it('keeps the prompt element under 131072 bytes for a full replay and an 8000-character question of 4-byte characters', () => {
    const history = Array.from({ length: HISTORY_REPLAY }, (_, i) => message(i % 2 === 0 ? 'user' : 'assistant', FOUR_BYTE_CHAR.repeat(100_000)));
    const question = FOUR_BYTE_CHAR.repeat(QUESTION_MAX_CHARS);
    expect(utf8Bytes(question)).toBe(32_000);
    const prompt = buildPrompt(history, question);
    expect(replayBytes(prompt, question)).toBeLessThanOrEqual(REPLAY_MAX_BYTES);
    expect(utf8Bytes(prompt)).toBeLessThan(ARG_MAX_BYTES);
    expect(REPLAY_MAX_BYTES + 32_000).toBeLessThan(ARG_MAX_BYTES);
  });

  it('never cuts a character in half', () => {
    const history = [message('assistant', `é${FOUR_BYTE_CHAR}`.repeat(60_000))];
    const prompt = buildPrompt(history, QUESTION);
    expect(Buffer.from(prompt, 'utf8').toString('utf8')).toBe(prompt);
    expect(prompt).not.toContain('�');
    expect(replayBytes(prompt, QUESTION)).toBeLessThanOrEqual(REPLAY_MAX_BYTES);
  });

  it('puts a question that opens with a slash under the question header, so the CLI does not read it as one of its commands', () => {
    expect(buildPrompt([], '/model opus')).toBe(`${QUESTION_HEADER}\n\n/model opus`);
    expect(buildPrompt([], '  /clear')).toBe(`${QUESTION_HEADER}\n\n  /clear`);
    expect(asQuestion('/usage')).toBe(`${QUESTION_HEADER}\n\n/usage`);
    expect(asQuestion('What is 1/2 of the grade?')).toBe('What is 1/2 of the grade?');
    expect(asQuestion(QUESTION)).toBe(QUESTION);
    const replayed = buildPrompt(conversation(1), '/model opus');
    expect(replayed.startsWith(REPLAY_HEADER)).toBe(true);
    expect(replayed.endsWith(`${QUESTION_HEADER}\n\n/model opus`)).toBe(true);
    expect(replayed.split(QUESTION_HEADER)).toHaveLength(2);
  });

  it('counts bytes of UTF-8', () => {
    expect(utf8Bytes('abc')).toBe(3);
    expect(utf8Bytes('é')).toBe(2);
    expect(utf8Bytes(FOUR_BYTE_CHAR)).toBe(4);
  });
});
