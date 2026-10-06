/**
 * The router (brief 102, Contract, Router): a hand-written heuristic, pure, with no model call.
 *
 * Rules, read in this order:
 *   1. high  a clause opens with an execution verb (HIGH_VERBS), or the prompt is over 600 characters;
 *   2. low   the prompt opens with a lookup cue (LOW_CUES), is at most 200 characters and holds no
 *            execution verb anywhere;
 *   3. a follow-up of at most 40 characters keeps the conversation's prior tier;
 *   4. mid   otherwise.
 *
 * A clause starts at the start of the prompt, after sentence punctuation that is followed by white
 * space (so `IST.323` is one word), after a line break, and after `and` or `then`. A polite lead-in
 * (`please`, `can you`, ...) is skipped before a clause's opening word is read. Characters are
 * counted as code points, the way the database counts the 8000-character limit.
 * `test/fixtures/router-cases.json` is the executable form of all of this.
 */

import type { Tier } from './tiers.js';

export const HIGH_VERBS = [
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
] as const;

export const LOW_CUES = [
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
] as const;

/** A prompt longer than this is high. */
export const HIGH_LENGTH_OVER = 600;
/** A lookup is at most this long. */
export const LOW_LENGTH_MAX = 200;
/** A follow-up that keeps the prior tier is at most this long. */
export const FOLLOW_UP_LENGTH_MAX = 40;

/** Words a clause may start with before its opening word; skipped, in any order, any number of times. */
const LEAD_INS = [
  'please',
  'can you',
  'could you',
  'would you',
  'will you',
  'help me',
  'i need you to',
  'i want you to',
  "i'd like you to",
  "let's",
  'lets',
  'now',
  'ok',
  'okay',
  'also',
  'just',
  'and',
  'then',
] as const;

const CLAUSE_BREAK = /[.?!;:,]+(?=\s|$)|[\r\n]+|\s+(?:and|then)\s+/;
const LEADING_NON_LETTERS = /^[^a-z]+/;
const HIGH_VERB_WORD = new RegExp(`\\b(?:${HIGH_VERBS.join('|')})\\b`);

function startsWithPhrase(text: string, phrase: string): boolean {
  if (!text.startsWith(phrase)) return false;
  const next = text.charAt(phrase.length);
  return next === '' || !/[a-z]/.test(next);
}

/** The clause in lower case, without leading punctuation, digits or polite lead-ins. */
function clauseBody(clause: string): string {
  let body = clause.replace(LEADING_NON_LETTERS, '');
  for (let skipped = true; skipped; ) {
    skipped = false;
    for (const leadIn of LEAD_INS) {
      if (startsWithPhrase(body, leadIn)) {
        body = body.slice(leadIn.length).replace(LEADING_NON_LETTERS, '');
        skipped = true;
      }
    }
  }
  return body;
}

function clauses(lowered: string): string[] {
  return lowered
    .split(CLAUSE_BREAK)
    .map(clauseBody)
    .filter((body) => body !== '');
}

function opensWithAny(body: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => startsWithPhrase(body, phrase));
}

export function routeTier(prompt: string, priorTier: Tier | null): Tier {
  const text = prompt.trim();
  const length = [...text].length;
  const lowered = text.toLowerCase();
  const bodies = clauses(lowered);

  if (length > HIGH_LENGTH_OVER || bodies.some((body) => opensWithAny(body, HIGH_VERBS))) return 'high';

  const opening = bodies[0] ?? '';
  if (opensWithAny(opening, LOW_CUES) && length <= LOW_LENGTH_MAX && !HIGH_VERB_WORD.test(lowered)) return 'low';

  if (priorTier !== null && length <= FOLLOW_UP_LENGTH_MAX) return priorTier;

  return 'mid';
}
