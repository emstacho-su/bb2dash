// Task 11 (R-83): the runner's templated report. Its lines are what Activity shows for the run.

import { describe, expect, it } from 'vitest';

import {
  LOGIN_REQUIRED,
  NOT_PULLED_LINES_MAX,
  buildReport,
  failureReport,
  filesLine,
  loginRequiredReport,
  notPulledLines,
} from '../src/report.js';

describe('the files line (task 28 quotes it beside walk-14/03)', () => {
  it('pins its exact text', () => {
    expect(filesLine({ pulled: 0, not_pulled: [] })).toBe('Files: nothing new to pull');
    expect(filesLine({ pulled: 3, not_pulled: [] })).toBe('Files: 3 pulled');
    expect(filesLine({ pulled: 2, not_pulled: [{ id: '9', reason: 'gone: status 404' }] })).toBe(
      'Files: 2 pulled, 1 not pulled',
    );
  });

  it('names each not-pulled file, up to the cap, then counts the rest', () => {
    const many = Array.from({ length: NOT_PULLED_LINES_MAX + 2 }, (_, i) => ({ id: String(i + 1), reason: 'refused: x' }));
    const lines = notPulledLines({ pulled: 0, not_pulled: many });
    expect(lines).toHaveLength(NOT_PULLED_LINES_MAX + 1);
    expect(lines[0]).toBe('Not pulled: file 1 (refused: x)');
    expect(lines.at(-1)).toBe('…and 2 more not pulled');
  });
});

describe('the report shape', () => {
  it('a login death before the claim is login_required, with one plain line and no files', () => {
    const r = loginRequiredReport();
    expect(r.error).toBe(LOGIN_REQUIRED);
    expect(r.lines).toEqual([
      'Blackboard login needed: the sync did not start. Open http://127.0.0.1:6080/vnc.html and sign in with Duo.',
    ]);
    expect(r.files).toEqual({ pulled: 0, not_pulled: [] });
    expect(r.claim_attempts).toBe(0);
  });

  it('a failed stage names the stage and the error, on one line, clipped', () => {
    const r = failureReport('crawl', 'TypeError: x is undefined\n    at frame', 1);
    expect(r.lines).toEqual(['Sync runner: crawl failed: TypeError: x is undefined at frame']);
    expect(r.error).toBe('crawl failed: TypeError: x is undefined at frame');
    expect(r.claim_attempts).toBe(1);
    expect(failureReport('crawl', 'y'.repeat(900), 1).error!.length).toBeLessThan(530);
  });

  it('a clean pass closes done with the files line', () => {
    const { state, report } = buildReport({
      foldStatus: 'ok',
      files: { pulled: 2, not_pulled: [] },
      claimAttempts: 1,
    });
    expect(state).toBe('done');
    expect(report).toEqual({ lines: ['Files: 2 pulled'], error: null, files: { pulled: 2, not_pulled: [] }, claim_attempts: 1 });
  });

  it('a partial fold still closes done, and says so', () => {
    const { state, report } = buildReport({ foldStatus: 'partial', files: { pulled: 0, not_pulled: [] }, claimAttempts: 1 });
    expect(state).toBe('done');
    expect(report.lines[0]).toBe('Sync runner: the fold finished partial; a stage above failed');
  });

  it('a failed fold closes failed', () => {
    const { state, report } = buildReport({ foldStatus: 'failed', files: { pulled: 0, not_pulled: [] }, claimAttempts: 2 });
    expect(state).toBe('failed');
    expect(report.error).toBe('fold failed');
  });

  it('a session that expired mid-files closes failed as login_required, so the Inbox asks for a login', () => {
    const { state, report } = buildReport({
      foldStatus: 'ok',
      files: { pulled: 1, not_pulled: [{ id: '5', reason: 'session_expired: status 401' }] },
      claimAttempts: 1,
      filesStopped: 'session_expired',
    });
    expect(state).toBe('failed');
    expect(report.error).toBe(LOGIN_REQUIRED);
    expect(report.lines).toEqual([
      'Files stopped: the Blackboard session expired; the rest are tried on the next sync',
      'Files: 1 pulled, 1 not pulled',
      'Not pulled: file 5 (session_expired: status 401)',
    ]);
  });

  it('a files step that threw, or an embed that failed, closes failed and keeps the first error', () => {
    const a = buildReport({ foldStatus: 'ok', files: { pulled: 0, not_pulled: [] }, claimAttempts: 1, filesError: 'worklist read failed' });
    expect(a.state).toBe('failed');
    expect(a.report.error).toBe('files failed: worklist read failed');

    const b = buildReport({ foldStatus: 'ok', files: { pulled: 1, not_pulled: [] }, claimAttempts: 1, embedError: 'exit 1' });
    expect(b.state).toBe('failed');
    expect(b.report.lines).toEqual(['Files: 1 pulled', 'Sync runner: embedding failed: exit 1']);
    expect(b.report.error).toBe('embed failed: exit 1');
  });

  it('every line is text, as sync_close requires', () => {
    const { report } = buildReport({
      foldStatus: 'partial',
      files: { pulled: 1, not_pulled: [{ id: '3', reason: 'storage 409: key already occupied' }] },
      claimAttempts: 3,
      embedError: 'x',
    });
    expect(report.lines.every((l) => typeof l === 'string' && l.length > 0)).toBe(true);
  });
});
