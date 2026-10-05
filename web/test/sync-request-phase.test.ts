/**
 * The Sync button's read of an open request after the Phase 14 cut-over: which
 * phase the row is in, what the button says, and what the toast says. Pure
 * functions, so every branch is pinned here without a DOM.
 */

import { describe, expect, it } from 'vitest';

import {
  PHASE_LABEL,
  QUEUE_GRACE_MS,
  REQUEUE_GRACE_MS,
  RUNNER_CLAIMANT,
  closeAnnouncement,
  closePrompt,
  filesNeedingStack,
  isLivePhase,
  isMovingPhase,
  isOpenState,
  phaseTitle,
  pressAction,
  resultHeadline,
  syncPhase,
  type PhaseRequest,
  type SyncPhase,
} from '@/lib/sync-request-phase';

const NOW = Date.parse('2026-10-05T18:08:00.000Z');

/** Stands in for `relativeTime`; the wording is the caller's, not this module's. */
const ago = (iso: string | null): string => (iso ? `${iso} ago` : '—');

function request(overrides: Partial<PhaseRequest> = {}): PhaseRequest {
  return {
    id: 1856,
    state: 'queued',
    created_at: '2026-10-05T18:07:50.000Z',
    claimed_by: null,
    claim_attempts: 0,
    finished_at: null,
    result: null,
    ...overrides,
  };
}

function minutesAgo(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

const ALL_PHASES: readonly SyncPhase[] = [
  'idle',
  'queued',
  'unclaimed',
  'requeued',
  'starting',
  'crawling',
  'pulling_files',
  'finishing',
  'session',
  'done',
  'failed',
  'cancelled',
];

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

  it('a queued request the runner claimed before is requeued, past the short grace', () => {
    expect(syncPhase(request({ claim_attempts: 1, created_at: minutesAgo(3) }), null, NOW)).toBe('requeued');
    expect(syncPhase(request({ claim_attempts: 2, created_at: minutesAgo(9) }), null, NOW)).toBe('requeued');
  });

  it('a requeued request reads unclaimed once it has waited the long grace', () => {
    const edge = new Date(NOW - REQUEUE_GRACE_MS).toISOString();
    expect(syncPhase(request({ claim_attempts: 1, created_at: edge }), null, NOW)).toBe('requeued');
    expect(syncPhase(request({ claim_attempts: 1, created_at: minutesAgo(11) }), null, NOW)).toBe('unclaimed');
  });

  it("the runner's claim with no run row yet is starting", () => {
    const claimed = request({ state: 'claimed', claimed_by: RUNNER_CLAIMANT, claim_attempts: 1 });
    expect(syncPhase(claimed, null, NOW)).toBe('starting');
    expect(syncPhase(claimed, undefined, NOW)).toBe('starting');
  });

  it("the runner's claim with a running run is crawling", () => {
    const claimed = request({ state: 'claimed', claimed_by: RUNNER_CLAIMANT, claim_attempts: 1 });
    expect(syncPhase(claimed, { status: 'running' }, NOW)).toBe('crawling');
  });

  it('a folded run under an open claim is pulling files', () => {
    const claimed = request({ state: 'claimed', claimed_by: RUNNER_CLAIMANT, claim_attempts: 1 });
    expect(syncPhase(claimed, { status: 'ok' }, NOW)).toBe('pulling_files');
    expect(syncPhase(claimed, { status: 'partial' }, NOW)).toBe('pulling_files');
  });

  it('a failed run under an open claim is finishing: the close is next', () => {
    const claimed = request({ state: 'claimed', claimed_by: RUNNER_CLAIMANT, claim_attempts: 1 });
    expect(syncPhase(claimed, { status: 'failed' }, NOW)).toBe('finishing');
  });

  it('a run status outside the four reads as starting, not as a phase it is not', () => {
    const claimed = request({ state: 'claimed', claimed_by: RUNNER_CLAIMANT, claim_attempts: 1 });
    expect(syncPhase(claimed, { status: 'weird' }, NOW)).toBe('starting');
    expect(syncPhase(claimed, { status: null }, NOW)).toBe('starting');
  });

  it('any other claimant is a Claude Code session, whatever the run says', () => {
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
  it('reads the container phases plainly, and names Claude Code for a session', () => {
    expect(PHASE_LABEL.idle).toBe('Sync');
    expect(PHASE_LABEL.queued).toBe('sync requested');
    expect(PHASE_LABEL.unclaimed).toBe('waiting on the container…');
    expect(PHASE_LABEL.requeued).toBe('sync requeued…');
    expect(PHASE_LABEL.starting).toBe('starting…');
    expect(PHASE_LABEL.crawling).toBe('crawling…');
    expect(PHASE_LABEL.pulling_files).toBe('pulling files…');
    expect(PHASE_LABEL.finishing).toBe('finishing…');
    expect(PHASE_LABEL.session).toBe('Claude Code: syncing…');
    expect(PHASE_LABEL.done).toBe('sync done');
    expect(PHASE_LABEL.failed).toBe('sync failed');
    expect(PHASE_LABEL.cancelled).toBe('sync cancelled');
  });

  it('has a label for every phase', () => {
    for (const phase of ALL_PHASES) expect(PHASE_LABEL[phase]).toBeTruthy();
  });
});

describe('phaseTitle — the tooltip sentence', () => {
  it("dates an unclaimed request's filing through the caller's ago", () => {
    const stale = request({ created_at: minutesAgo(2) });
    expect(phaseTitle('unclaimed', stale, ago)).toBe(
      `Nothing has claimed this sync, requested ${stale.created_at} ago. The sync container may be busy or down; press again for the fallback command.`,
    );
  });

  it('explains a requeued request and keeps the fallback reachable', () => {
    expect(phaseTitle('requeued', request({ claim_attempts: 1 }), ago)).toBe(
      'The sync container claimed this request once and let it go (a restart); its next pass takes it again. Press again for the fallback command.',
    );
  });

  it('names the session that claimed the row', () => {
    const claimed = request({ state: 'claimed', claimed_by: 'bb-sync session' });
    expect(phaseTitle('session', claimed, ago)).toBe('A Claude Code session (bb-sync session) is running this sync');
  });

  it('falls back to a generic sentence for a session with no name', () => {
    const claimed = request({ state: 'claimed', claimed_by: null });
    expect(phaseTitle('session', claimed, ago)).toBe('A Claude Code session is running this sync');
  });

  it('describes the container phases and the idle button', () => {
    expect(phaseTitle('idle', null, ago)).toBe('Ask the sync container to crawl Blackboard');
    expect(phaseTitle('queued', request(), ago)).toBe(
      'Requested; the sync container takes queued requests within about a minute',
    );
    expect(phaseTitle('starting', request(), ago)).toBe(
      'The sync container claimed the request and is opening the run',
    );
    expect(phaseTitle('crawling', request(), ago)).toBe(
      'The sync container is crawling Blackboard and folding the result in',
    );
    expect(phaseTitle('pulling_files', request(), ago)).toBe(
      'The crawl folded in; the sync container is pulling new files',
    );
    expect(phaseTitle('finishing', request(), ago)).toBe(
      'The run failed; the sync container is closing the request',
    );
  });

  it("dates a finished request from finished_at through the caller's ago", () => {
    const done = request({ state: 'done', finished_at: '2026-10-05T18:06:00.000Z' });
    expect(phaseTitle('done', done, ago)).toBe('Sync done 2026-10-05T18:06:00.000Z ago');
    expect(phaseTitle('failed', request({ state: 'failed', finished_at: null }), ago)).toBe('Sync failed');
  });

  it('has a sentence for every phase', () => {
    for (const phase of ALL_PHASES) expect(phaseTitle(phase, request(), ago)).toBeTruthy();
  });
});

describe('pressAction — what a press does in each phase', () => {
  it('files a new request only when nothing is open', () => {
    expect(pressAction('idle')).toBe('file');
    expect(pressAction('done')).toBe('file');
    expect(pressAction('failed')).toBe('file');
    expect(pressAction('cancelled')).toBe('file');
  });

  it('offers the paste command for an unclaimed or requeued request', () => {
    expect(pressAction('unclaimed')).toBe('fallback');
    expect(pressAction('requeued')).toBe('fallback');
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

describe('isLivePhase / isMovingPhase / isOpenState', () => {
  it('marks only the container phases live', () => {
    const live: SyncPhase[] = ['starting', 'crawling', 'pulling_files', 'finishing'];
    for (const phase of ALL_PHASES) expect(isLivePhase(phase)).toBe(live.includes(phase));
  });

  it('counts every open phase as moving and no closed one', () => {
    const closed: SyncPhase[] = ['idle', 'done', 'failed', 'cancelled'];
    for (const phase of ALL_PHASES) expect(isMovingPhase(phase)).toBe(!closed.includes(phase));
  });

  it('calls queued and claimed open, and the three closed states not', () => {
    expect(isOpenState('queued')).toBe(true);
    expect(isOpenState('claimed')).toBe(true);
    expect(isOpenState('done')).toBe(false);
    expect(isOpenState('failed')).toBe(false);
    expect(isOpenState('cancelled')).toBe(false);
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
    expect(closeAnnouncement({ state: 'cancelled', result: null })).toBe('Sync cancelled');
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

describe('filesNeedingStack — the unpulled files that ask for a hand', () => {
  it("counts the runner's not_pulled entries", () => {
    const report = {
      files: {
        pulled: 3,
        not_pulled: [
          { id: '2489', reason: 'storage 400: InvalidKey' },
          { id: '2490', reason: 'refused: 403 at the first hop' },
        ],
      },
    };
    expect(filesNeedingStack(report)).toBe(2);
  });

  it('leaves out a file the session expiry stopped: the next sync tries it', () => {
    const report = {
      files: {
        pulled: 1,
        not_pulled: [
          { id: '1', reason: 'session_expired: login page' },
          { id: '2', reason: 'storage 409: key already occupied; a human decides whether those bytes are this file' },
        ],
      },
    };
    expect(filesNeedingStack(report)).toBe(1);
  });

  it('leaves out a file another writer stored first: it has bytes, and no Inbox item', () => {
    const report = {
      files: { pulled: 1, not_pulled: [{ id: '1', reason: 'already stored by another writer' }] },
    };
    expect(filesNeedingStack(report)).toBe(0);
  });

  it("takes the skill's count when there are no reasons", () => {
    expect(filesNeedingStack({ status: 'ok', files_pulled: 1, files_not_pulled: 2 })).toBe(2);
    expect(filesNeedingStack({ status: 'ok', files_pulled: 1, files_not_pulled: 0 })).toBe(0);
  });

  it('is 0 for a report it cannot read, and ignores a malformed entry', () => {
    expect(filesNeedingStack(null)).toBe(0);
    expect(filesNeedingStack({})).toBe(0);
    expect(filesNeedingStack({ files: { not_pulled: 'nope' } })).toBe(0);
    expect(filesNeedingStack({ files: { not_pulled: [42, null] } })).toBe(0);
  });
});

describe('closePrompt — the line that asks for a hand', () => {
  it('is null when every file landed, will be retried, or was stored by another writer', () => {
    expect(closePrompt({ files: { pulled: 3, not_pulled: [] } })).toBeNull();
    expect(closePrompt({ files: { not_pulled: [{ id: '1', reason: 'session_expired: dead' }] } })).toBeNull();
    expect(closePrompt({ files: { not_pulled: [{ id: '1', reason: 'already stored by another writer' }] } })).toBeNull();
    expect(closePrompt(null)).toBeNull();
  });

  it('speaks of one file, or of several', () => {
    expect(closePrompt({ files: { not_pulled: [{ id: '2489', reason: 'storage 400' }] } })).toBe(
      'One file could not be pulled. Its Inbox item has the Blackboard link; open it and say what should happen.',
    );
    expect(closePrompt({ files_pulled: 0, files_not_pulled: 3 })).toBe(
      '3 files could not be pulled. Their Inbox items have the Blackboard links; open them and say what should happen.',
    );
  });
});
