/**
 * The Sync button's read of an open request after the Phase 14 cut-over: which
 * phase the row is in, what the button says, and what the toast says. Pure
 * functions, so every branch is pinned here without a DOM.
 */

import { describe, expect, it } from 'vitest';

import {
  PHASE_LABEL,
  QUEUE_GRACE_MS,
  RUNNER_CLAIMANT,
  closeAnnouncement,
  isLivePhase,
  isMovingPhase,
  phaseTitle,
  pressAction,
  resultHeadline,
  syncPhase,
  type PhaseRequest,
} from '@/lib/sync-request-phase';

const NOW = Date.parse('2026-10-05T18:08:00.000Z');

function request(overrides: Partial<PhaseRequest> = {}): PhaseRequest {
  return {
    id: 1856,
    state: 'queued',
    created_at: '2026-10-05T18:07:50.000Z',
    claimed_by: null,
    finished_at: null,
    result: null,
    ...overrides,
  };
}

describe('syncPhase — the request row and the run it opened', () => {
  it('is idle with no request', () => {
    expect(syncPhase(null, null, NOW)).toBe('idle');
  });

  it('a young queued request is waiting for the runner', () => {
    expect(syncPhase(request(), null, NOW)).toBe('queued');
  });

  it('a queued request past the grace is unclaimed: nothing took it', () => {
    const old = new Date(NOW - QUEUE_GRACE_MS - 1).toISOString();
    expect(syncPhase(request({ created_at: old }), null, NOW)).toBe('unclaimed');
  });

  it('exactly at the grace it is still queued; one millisecond later it is not', () => {
    const edge = new Date(NOW - QUEUE_GRACE_MS).toISOString();
    expect(syncPhase(request({ created_at: edge }), null, NOW)).toBe('queued');
  });

  it('an unreadable created_at reads as queued, never as unclaimed', () => {
    expect(syncPhase(request({ created_at: 'not a date' }), null, NOW)).toBe('queued');
  });

  it("the runner's claim with no run row yet is starting", () => {
    const claimed = request({ state: 'claimed', claimed_by: RUNNER_CLAIMANT });
    expect(syncPhase(claimed, null, NOW)).toBe('starting');
    expect(syncPhase(claimed, undefined, NOW)).toBe('starting');
  });

  it("the runner's claim with a running run is crawling", () => {
    const claimed = request({ state: 'claimed', claimed_by: RUNNER_CLAIMANT });
    expect(syncPhase(claimed, { status: 'running' }, NOW)).toBe('crawling');
  });

  it('a folded run under an open claim is pulling files', () => {
    const claimed = request({ state: 'claimed', claimed_by: RUNNER_CLAIMANT });
    expect(syncPhase(claimed, { status: 'ok' }, NOW)).toBe('pulling_files');
    expect(syncPhase(claimed, { status: 'partial' }, NOW)).toBe('pulling_files');
  });

  it('a failed run under an open claim is finishing: the close is next', () => {
    const claimed = request({ state: 'claimed', claimed_by: RUNNER_CLAIMANT });
    expect(syncPhase(claimed, { status: 'failed' }, NOW)).toBe('finishing');
  });

  it('a run status outside the four reads as starting, not as a phase it is not', () => {
    const claimed = request({ state: 'claimed', claimed_by: RUNNER_CLAIMANT });
    expect(syncPhase(claimed, { status: 'weird' }, NOW)).toBe('starting');
    expect(syncPhase(claimed, { status: null }, NOW)).toBe('starting');
  });

  it("any other claimant is a Claude Code session, whatever the run says", () => {
    const claimed = request({ state: 'claimed', claimed_by: 'bb-sync session' });
    expect(syncPhase(claimed, { status: 'running' }, NOW)).toBe('session');
    expect(syncPhase(request({ state: 'claimed', claimed_by: null }), null, NOW)).toBe('session');
  });

  it('done, failed and cancelled pass through', () => {
    expect(syncPhase(request({ state: 'done' }), null, NOW)).toBe('done');
    expect(syncPhase(request({ state: 'failed' }), null, NOW)).toBe('failed');
    expect(syncPhase(request({ state: 'cancelled' }), null, NOW)).toBe('cancelled');
  });
});

describe('PHASE_LABEL — what the button says', () => {
  it('names the container while the runner works, and Claude Code for a session', () => {
    expect(PHASE_LABEL.idle).toBe('Sync');
    expect(PHASE_LABEL.queued).toBe('sync requested');
    expect(PHASE_LABEL.unclaimed).toBe('waiting on the container…');
    expect(PHASE_LABEL.starting).toBe('container: starting…');
    expect(PHASE_LABEL.crawling).toBe('container: crawling…');
    expect(PHASE_LABEL.pulling_files).toBe('container: pulling files…');
    expect(PHASE_LABEL.finishing).toBe('container: finishing…');
    expect(PHASE_LABEL.session).toBe('Claude Code: syncing…');
    expect(PHASE_LABEL.done).toBe('sync done');
    expect(PHASE_LABEL.failed).toBe('sync failed');
    expect(PHASE_LABEL.cancelled).toBe('sync cancelled');
  });
});

describe('phaseTitle — the tooltip sentence', () => {
  it('says how long an unclaimed request has waited, in seconds then minutes', () => {
    const at90s = request({ created_at: new Date(NOW - 90_000).toISOString() });
    expect(phaseTitle('unclaimed', at90s, NOW)).toBe(
      'Nothing has claimed this sync in 90 s. Is the sync container up? Press again for the fallback command.',
    );
    const at3m = request({ created_at: new Date(NOW - 3 * 60_000 - 5_000).toISOString() });
    expect(phaseTitle('unclaimed', at3m, NOW)).toBe(
      'Nothing has claimed this sync in 3 min. Is the sync container up? Press again for the fallback command.',
    );
  });

  it('names the session that claimed the row', () => {
    const claimed = request({ state: 'claimed', claimed_by: 'bb-sync session' });
    expect(phaseTitle('session', claimed, NOW)).toBe(
      'A Claude Code session (bb-sync session) is running this sync',
    );
  });

  it('falls back to a generic sentence for a session with no name', () => {
    const claimed = request({ state: 'claimed', claimed_by: null });
    expect(phaseTitle('session', claimed, NOW)).toBe('A Claude Code session is running this sync');
  });

  it('describes the container phases and the idle button', () => {
    expect(phaseTitle('idle', null, NOW)).toBe('Ask the sync container to crawl Blackboard');
    expect(phaseTitle('queued', request(), NOW)).toBe(
      'Requested; the sync container takes queued requests within about a minute',
    );
    expect(phaseTitle('starting', request(), NOW)).toBe(
      'The sync container claimed the request and is opening the run',
    );
    expect(phaseTitle('crawling', request(), NOW)).toBe(
      'The sync container is crawling Blackboard and folding the result in',
    );
    expect(phaseTitle('pulling_files', request(), NOW)).toBe(
      'The crawl folded in; the sync container is pulling new files',
    );
    expect(phaseTitle('finishing', request(), NOW)).toBe(
      'The run failed; the sync container is closing the request',
    );
  });

  it('dates a finished request from finished_at', () => {
    const done = request({ state: 'done', finished_at: new Date(NOW - 2 * 60_000).toISOString() });
    expect(phaseTitle('done', done, NOW)).toBe('Sync done 2 min ago');
    expect(phaseTitle('failed', request({ state: 'failed', finished_at: null }), NOW)).toBe('Sync failed');
  });
});

describe('pressAction — what a press does in each phase', () => {
  it('files a new request only when nothing is open', () => {
    expect(pressAction('idle')).toBe('file');
    expect(pressAction('done')).toBe('file');
    expect(pressAction('failed')).toBe('file');
    expect(pressAction('cancelled')).toBe('file');
  });

  it('offers the paste command only for an unclaimed request', () => {
    expect(pressAction('unclaimed')).toBe('fallback');
  });

  it('re-shows the status for a request someone is moving', () => {
    expect(pressAction('queued')).toBe('status');
    expect(pressAction('starting')).toBe('status');
    expect(pressAction('crawling')).toBe('status');
    expect(pressAction('pulling_files')).toBe('status');
    expect(pressAction('finishing')).toBe('status');
    expect(pressAction('session')).toBe('status');
  });
});

describe('isLivePhase / isMovingPhase — the live mark and the open request', () => {
  it('marks only the container phases live', () => {
    expect(['starting', 'crawling', 'pulling_files', 'finishing'].every((p) => isLivePhase(p as never))).toBe(true);
    expect(['idle', 'queued', 'unclaimed', 'session', 'done', 'failed', 'cancelled'].some((p) => isLivePhase(p as never))).toBe(false);
  });

  it('counts every open phase as moving and no closed one', () => {
    expect(['queued', 'unclaimed', 'starting', 'crawling', 'pulling_files', 'finishing', 'session'].every((p) => isMovingPhase(p as never))).toBe(true);
    expect(['idle', 'done', 'failed', 'cancelled'].some((p) => isMovingPhase(p as never))).toBe(false);
  });
});

describe('closeAnnouncement — the toast when a watched request closes', () => {
  it('joins the state and the headline', () => {
    expect(closeAnnouncement({ state: 'done', result: { lines: ['Files: 3 pulled, 1 not pulled'] } })).toBe(
      'Sync done · Files: 3 pulled, 1 not pulled',
    );
  });

  it('is the state alone when the report has no line', () => {
    expect(closeAnnouncement({ state: 'failed', result: null })).toBe('Sync failed');
  });
});

describe("resultHeadline — the one line of a closed request's report", () => {
  it("takes the runner's first line", () => {
    expect(resultHeadline({ lines: ['Files: 3 pulled, 1 not pulled', 'Not pulled: …'], error: null })).toBe(
      'Files: 3 pulled, 1 not pulled',
    );
  });

  it("builds the skill's figures into the same sentence", () => {
    expect(resultHeadline({ status: 'ok', files_pulled: 2, files_not_pulled: 0 })).toBe('Files: 2 pulled');
    expect(resultHeadline({ status: 'ok', files_pulled: 0, files_not_pulled: 1 })).toBe(
      'Files: 0 pulled, 1 not pulled',
    );
  });

  it('falls back to the error word when there is no line', () => {
    expect(resultHeadline({ error: 'login_required', lines: [] })).toBe('login_required');
  });

  it('is null for nothing it can read', () => {
    expect(resultHeadline(null)).toBeNull();
    expect(resultHeadline('text')).toBeNull();
    expect(resultHeadline({ lines: [42] })).toBeNull();
    expect(resultHeadline({})).toBeNull();
  });
});
