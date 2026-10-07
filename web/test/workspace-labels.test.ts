/**
 * The Workspace's frozen strings (Phase 21, task 16).
 *
 * Brief 102's Contract freezes the sentences the Workspace page says ("Frozen
 * strings"; the three archive labels; the tier badges) and ruling T2 adds the
 * three skeleton strings. Ruling U1 (2026-10-06) adds the three lines of the
 * empty message column, the placeholder and the "Status" label, and accepts
 * W-66's own ten strings as PM wording. Each is asserted here word for word,
 * against the text of the brief and the rulings, so a reworded sentence fails
 * this file and not a walk.
 *
 * None of them may carry a cost figure: the per-answer cap is a runner setting
 * the page cannot read, and the cost estimate is never shown.
 */

import { describe, expect, it } from 'vitest';
import * as labels from '@/lib/workspace-labels';
import { WORKSPACE_ERROR_CODES, WORKSPACE_PROMPT_MAX } from '@/lib/queries.workspace';

/** Every string the module can say: its constants, its maps' values, its builders' output. */
function everyString(): string[] {
  const out: string[] = [];
  for (const value of Object.values(labels)) {
    if (typeof value === 'string') out.push(value);
    else if (typeof value === 'function') out.push(String(value('the reason')));
    else if (value !== null && typeof value === 'object') {
      for (const inner of Object.values(value)) if (typeof inner === 'string') out.push(inner);
    }
  }
  return out;
}

describe('the states, in words', () => {
  it('says a queued question is waiting for the service', () => {
    expect(labels.QUEUED_LINE).toBe('Waiting for the Workspace service');
  });

  it('says only "Answering…" for a stream joined late', () => {
    expect(labels.LATE_STREAM_LINE).toBe('Answering…');
  });

  it('says the service is offline', () => {
    expect(labels.OFFLINE_LINE).toBe('The Workspace service is offline.');
  });

  it.each([
    ['cancelled', 'You stopped this answer.'],
    ['budget_exceeded', 'Stopped at the per-answer cost limit.'],
    ['timeout', 'This took too long and was stopped.'],
    ['stale_claim', 'The Workspace service stopped part-way. Ask again.'],
    ['provider_not_configured', 'That model is not connected.'],
    ['cli_error', 'The assistant could not finish this answer. Ask again.'],
    ['usage_limit', "Your Claude plan's limit is used up. Try again after it resets."],
    [
      'sign_in_expired',
      "The Workspace's Claude sign-in has expired. Run claude setup-token again and store the new token.",
    ],
  ] as const)('has the one sentence for %s, word for word', (code, sentence) => {
    expect(labels.ERROR_SENTENCES[code]).toBe(sentence);
  });

  it('has one sentence for each of the eight codes, and no two alike', () => {
    expect(Object.keys(labels.ERROR_SENTENCES).sort()).toEqual([...WORKSPACE_ERROR_CODES].sort());
    expect(new Set(Object.values(labels.ERROR_SENTENCES)).size).toBe(8);
  });

  it('stores the sign-in sentence without backticks', () => {
    expect(labels.ERROR_SENTENCES.sign_in_expired).not.toContain('`');
  });

  it('names the stopped sentence: the one for cancelled', () => {
    expect(labels.STOPPED_SENTENCE).toBe('You stopped this answer.');
    expect(labels.STOPPED_SENTENCE).toBe(labels.ERROR_SENTENCES.cancelled);
  });
});

describe('the two refusals', () => {
  it('has one sentence for a second question while one is open (23505)', () => {
    expect(labels.REFUSAL_STILL_ANSWERING).toBe('This conversation is still answering.');
  });

  it('has one sentence for empty or over-long text (22023), and it keeps its "1 to 8000"', () => {
    expect(labels.REFUSAL_QUESTION_LENGTH).toBe('Write a question of 1 to 8000 characters.');
    expect(labels.REFUSAL_QUESTION_LENGTH).toContain(`1 to ${WORKSPACE_PROMPT_MAX}`);
  });
});

describe('the controls and the badges', () => {
  it('reads Ask and Stop', () => {
    expect(labels.ASK_LABEL).toBe('Ask');
    expect(labels.STOP_LABEL).toBe('Stop');
  });

  it('has the three archive labels, word for word', () => {
    expect(labels.ARCHIVE_LABEL).toBe('Archive');
    expect(labels.UNARCHIVE_LABEL).toBe('Unarchive');
    expect(labels.SHOW_ARCHIVED_LABEL).toBe('Show archived');
  });

  it('names each tier on its badge', () => {
    expect(labels.TIER_BADGES).toEqual({
      low: 'Haiku · lookup',
      mid: 'Sonnet · standard',
      high: 'Opus · deep work',
    });
  });

  it('starts the tools line with "Used:"', () => {
    expect(labels.USED_PREFIX).toBe('Used:');
  });
});

describe('the three skeleton strings the PM accepted (ruling T2)', () => {
  it('has the kicker, the fallback and the problem line', () => {
    expect(labels.PAGE_KICKER).toBe('Assistant');
    expect(labels.LOADING_FALLBACK).toBe('Loading the Workspace…');
    expect(labels.conversationProblemLine('no such table')).toBe(
      'Could not load this conversation: no such table',
    );
  });
});

describe('the strings ruling U1 added (PM wording, 2026-10-06)', () => {
  it('has one line for each state of the empty message column', () => {
    expect(labels.COLUMN_START_LINE).toBe('Ask a question to start a conversation.');
    expect(labels.COLUMN_LOADING_LINE).toBe('Loading the conversation…');
    expect(labels.COLUMN_NOT_FOUND_LINE).toBe('This conversation was not found.');
  });

  it('ends the loading line with the one ellipsis character, as "Answering…" does', () => {
    expect(labels.COLUMN_LOADING_LINE.endsWith('…')).toBe(true);
    expect(labels.COLUMN_LOADING_LINE).not.toContain('...');
  });

  it('has the visible placeholder of the text box, with no closing stop', () => {
    expect(labels.QUESTION_PLACEHOLDER).toBe('Ask about your courses or your decisions');
  });

  it('labels a status line with no answer text "Status" for a screen reader', () => {
    expect(labels.STATUS_ROLE_LABEL).toBe('Status');
    expect(labels.STATUS_ROLE_LABEL).not.toBe(labels.ANSWER_ROLE_LABEL);
  });

  it('keeps the "New conversation" link, word for word', () => {
    expect(labels.NEW_CONVERSATION_LABEL).toBe('New conversation');
  });
});

describe('the ten strings of W-66 that ruling U1 accepted as PM wording', () => {
  it('names the list, its two empty lines, the column and the text box', () => {
    expect(labels.CONVERSATIONS_HEADING).toBe('Conversations');
    expect(labels.NO_CONVERSATIONS_LINE).toBe('No conversations yet.');
    expect(labels.NO_ARCHIVED_LINE).toBe('No archived conversations.');
    expect(labels.MESSAGES_REGION_LABEL).toBe('Messages');
    expect(labels.QUESTION_FIELD_LABEL).toBe('Question');
  });

  it('says who wrote a turn, for a screen reader', () => {
    expect(labels.QUESTION_ROLE_LABEL).toBe('You asked');
    expect(labels.ANSWER_ROLE_LABEL).toBe('The assistant answered');
  });

  it('has one problem line for each read or write that can fail', () => {
    expect(labels.conversationsProblemLine('x')).toBe('Could not load the conversations: x');
    expect(labels.statusProblemLine('x')).toBe('Could not load the Workspace service status: x');
    expect(labels.askProblemLine('x')).toBe('Could not send this question: x');
    expect(labels.stopProblemLine('x')).toBe('Could not stop this answer: x');
    expect(labels.archiveProblemLine('x')).toBe('Could not change this conversation: x');
  });
});

describe('none of them holds a cost figure', () => {
  it('has no dollar sign and no amount of money in any string', () => {
    const strings = everyString();
    expect(strings.length).toBeGreaterThan(20);
    for (const text of strings) {
      expect(text, text).not.toContain('$');
      expect(text, text).not.toMatch(/\b\d+(?:\.\d+)?\s*(?:usd|dollars?|cents?)\b/i);
      expect(text, text).not.toMatch(/\b(?:usd|dollars?|cents?)\b/i);
    }
  });

  it('has no number at all outside the question-length sentence', () => {
    const numbered = everyString().filter((text) => /\d/.test(text));
    expect(numbered).toEqual([labels.REFUSAL_QUESTION_LENGTH]);
  });
});
