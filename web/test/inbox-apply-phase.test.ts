/**
 * The Apply answers button's read of an `inbox_feedback` request (Phase 23): which
 * phase a row is in, what a press does in it, and the one line the section shows.
 * Pure: no React, no query client, no network.
 */

import { describe, expect, it } from 'vitest';
import {
  APPLY_COPY,
  APPLY_PHASE_LABEL,
  APPLY_QUEUE_GRACE_MS,
  APPLY_RUNNER_CLAIMANT,
  applyPhase,
  applyPhaseTitle,
  applyPressAction,
  applyStatusLine,
  isUniqueViolation,
  type ApplyRequest,
} from '@/lib/inbox-apply-phase';

const NOW = Date.parse('2026-10-07T18:00:00Z');
const ago = (iso: string | null) => (iso ? '2 min ago' : 'never');

function request(over: Partial<ApplyRequest> = {}): ApplyRequest {
  return {
    id: 1860,
    state: 'queued',
    created_at: new Date(NOW - 10_000).toISOString(),
    claimed_by: null,
    finished_at: null,
    params: {},
    result: null,
    ...over,
  };
}

describe('the constants', () => {
  it('names the worker the way migration 181 writes claimed_by, and waits three polls', () => {
    expect(APPLY_RUNNER_CLAIMANT).toBe('inbox-apply-runner');
    expect(APPLY_QUEUE_GRACE_MS).toBe(75_000);
  });
});

describe('applyPhase', () => {
  it('is idle with no request', () => {
    expect(applyPhase(null, NOW)).toBe('idle');
    expect(applyPhase(undefined, NOW)).toBe('idle');
  });

  it('a young queued request is queued; one past the grace is unclaimed', () => {
    expect(applyPhase(request(), NOW)).toBe('queued');
    const old = request({ created_at: new Date(NOW - APPLY_QUEUE_GRACE_MS - 1).toISOString() });
    expect(applyPhase(old, NOW)).toBe('unclaimed');
  });

  it('a queued request with an unreadable created_at stays queued', () => {
    expect(applyPhase(request({ created_at: 'not a date' }), NOW)).toBe('queued');
  });

  it("the worker's claim is running; anyone else's is a Claude Code session", () => {
    expect(applyPhase(request({ state: 'claimed', claimed_by: APPLY_RUNNER_CLAIMANT }), NOW)).toBe('running');
    expect(applyPhase(request({ state: 'claimed', claimed_by: 'inbox-apply session' }), NOW)).toBe('session');
    expect(applyPhase(request({ state: 'claimed', claimed_by: null }), NOW)).toBe('session');
  });

  it('a closed request reads its own state', () => {
    for (const state of ['done', 'failed', 'cancelled'] as const) {
      expect(applyPhase(request({ state }), NOW)).toBe(state);
    }
  });
});

describe('the label', () => {
  it('keeps the plain words of R3-2 and names the worker only when nothing took the request', () => {
    expect(APPLY_PHASE_LABEL).toEqual({
      idle: 'Apply answers',
      queued: 'queued',
      unclaimed: 'waiting on the worker…',
      running: 'running',
      session: 'running',
      done: 'done',
      failed: 'failed',
      cancelled: 'cancelled',
    });
  });
});

describe('applyPressAction', () => {
  it('files when nothing is open, offers the fallback when nothing claimed it, and re-shows the status otherwise', () => {
    expect(applyPressAction('idle')).toBe('file');
    expect(applyPressAction('done')).toBe('file');
    expect(applyPressAction('failed')).toBe('file');
    expect(applyPressAction('cancelled')).toBe('file');
    expect(applyPressAction('unclaimed')).toBe('fallback');
    expect(applyPressAction('queued')).toBe('status');
    expect(applyPressAction('running')).toBe('status');
    expect(applyPressAction('session')).toBe('status');
  });
});

describe('applyPhaseTitle', () => {
  it('says one sentence per phase', () => {
    expect(applyPhaseTitle('idle', null, ago)).toBe('Ask the apply worker to apply your Inbox answers');
    expect(applyPhaseTitle('queued', request(), ago)).toBe(
      'Requested; the apply worker takes queued requests within about a minute',
    );
    expect(applyPhaseTitle('unclaimed', request(), ago)).toBe(
      'Nothing has claimed this request, filed 2 min ago. The apply worker may be down; press again for the fallback command.',
    );
    expect(applyPhaseTitle('running', request(), ago)).toBe('The apply worker is applying your answers');
    expect(applyPhaseTitle('session', request({ claimed_by: 'inbox-apply session' }), ago)).toBe(
      'A Claude Code session (inbox-apply session) is applying your answers',
    );
    expect(applyPhaseTitle('session', request({ claimed_by: null }), ago)).toBe(
      'A Claude Code session is applying your answers',
    );
    expect(applyPhaseTitle('done', request({ finished_at: '2026-10-07T17:58:00Z' }), ago)).toBe('Apply done 2 min ago');
    expect(applyPhaseTitle('failed', request({ finished_at: null }), ago)).toBe('Apply failed');
  });
});

describe('applyStatusLine', () => {
  it('says nothing at rest', () => {
    expect(applyStatusLine('idle', null)).toBeNull();
  });

  it('names who queued the request, from params.trigger', () => {
    expect(applyStatusLine('queued', request({ params: { trigger: 'sync', after: 1900 } }))).toBe(
      'Queued after the last sync',
    );
    expect(applyStatusLine('queued', request({ params: { trigger: 'followup', after: 1860 } }))).toBe(
      'Queued for the answers still waiting',
    );
    expect(applyStatusLine('queued', request({ params: {} }))).toBe('Queued from Apply answers');
    expect(applyStatusLine('queued', request({ params: { trigger: 7 } }))).toBe('Queued from Apply answers');
  });

  it('says when nothing has taken it, and who is applying', () => {
    expect(applyStatusLine('unclaimed', request())).toBe('Nothing has taken the request yet');
    expect(applyStatusLine('running', request())).toBe('Applying your answers now');
    expect(applyStatusLine('session', request())).toBe('A Claude Code session is applying your answers');
  });

  it("a closed request shows the worker's first report line, or the skill's count, and invents nothing", () => {
    expect(
      applyStatusLine('done', request({ state: 'done', result: { lines: ['3 answers applied, 1 recorded only'] } })),
    ).toBe('3 answers applied, 1 recorded only');
    expect(applyStatusLine('done', request({ state: 'done', result: { archived: 2 } }))).toBe('2 answers archived');
    expect(applyStatusLine('done', request({ state: 'done', result: { archived: 1 } }))).toBe('1 answer archived');
    expect(applyStatusLine('done', request({ state: 'done', result: { archived: 0 } }))).toBe('Nothing to apply');
    expect(applyStatusLine('failed', request({ state: 'failed', result: { error: 'sign_in_expired' } }))).toBe(
      'sign_in_expired',
    );
    expect(applyStatusLine('done', request({ state: 'done', result: null }))).toBeNull();
    expect(applyStatusLine('done', request({ state: 'done', result: { archived: 'many' } }))).toBeNull();
    expect(applyStatusLine('cancelled', request({ state: 'cancelled', result: { lines: ['x'] } }))).toBeNull();
  });
});

describe('the copy', () => {
  it('is the four lines the button can show', () => {
    expect(APPLY_COPY).toEqual({
      requested: 'Requested. The apply worker takes it within about a minute.',
      alreadyOpen: 'A request is already open. Following that one.',
      fallbackCopied:
        'Nothing has claimed this request. If the apply worker is down, the command is copied; run it in Claude Code.',
      fallbackCopy:
        'Nothing has claimed this request. If the apply worker is down, copy this and run it in Claude Code.',
    });
  });
});

describe('isUniqueViolation', () => {
  it("is true only for Postgres's 23505", () => {
    expect(isUniqueViolation({ code: '23505', message: 'duplicate key' })).toBe(true);
    expect(isUniqueViolation(Object.assign(new Error('duplicate'), { code: '23505' }))).toBe(true);
    expect(isUniqueViolation({ code: '42501' })).toBe(false);
    expect(isUniqueViolation(new Error('row-level security'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});
