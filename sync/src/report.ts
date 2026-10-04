/**
 * The runner's templated report (brief 100, "The report comes from the pure sync/src/report.ts").
 *
 *   { lines: text[], error: text | null, files: { pulled, not_pulled: [{ id, reason }] }, claim_attempts }
 *
 * `lines` carry the failed stages, the errors and the pulled / not-pulled files; `sync_close`
 * appends them to the run's `summary.changes`, the text array Activity already renders. The fold's
 * own change lines stay `sync_change_lines`'s. Pure: no I/O, no clock.
 */

export const LOGIN_REQUIRED = 'login_required';
/** The most not-pulled files named one per line; the rest are counted in one line. */
export const NOT_PULLED_LINES_MAX = 10;
const REASON_MAX = 200;
const ERROR_MAX = 500;
export const LOGIN_PAGE_URL = 'http://127.0.0.1:6080/vnc.html';

export interface NotPulled {
  id: string;
  reason: string;
}

export interface FilesSummary {
  pulled: number;
  not_pulled: NotPulled[];
}

export interface Report {
  lines: string[];
  error: string | null;
  files: FilesSummary;
  claim_attempts: number;
}

export type FoldStatus = 'running' | 'ok' | 'partial' | 'failed';

export interface ReportInput {
  foldStatus: FoldStatus;
  files: FilesSummary;
  claimAttempts: number;
  /** Why the files step stopped early, if it did. */
  filesStopped?: 'session_expired' | null;
  /** The files step's own failure, if it threw. */
  filesError?: string | null;
  /** The embed step's failure, if it ran and failed. */
  embedError?: string | null;
}

const EMPTY_FILES: FilesSummary = Object.freeze({ pulled: 0, not_pulled: [] }) as FilesSummary;

function clip(text: string, max: number): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
}

/** The one line Activity shows for the files step; its exact text is what task 28 quotes. */
export function filesLine(files: FilesSummary): string {
  const notPulled = files.not_pulled.length;
  if (files.pulled === 0 && notPulled === 0) return 'Files: nothing new to pull';
  return notPulled === 0 ? `Files: ${files.pulled} pulled` : `Files: ${files.pulled} pulled, ${notPulled} not pulled`;
}

/** One line per not-pulled file, at most NOT_PULLED_LINES_MAX, then a count of the rest. */
export function notPulledLines(files: FilesSummary): string[] {
  const shown = files.not_pulled.slice(0, NOT_PULLED_LINES_MAX).map((f) => `Not pulled: file ${f.id} (${clip(f.reason, REASON_MAX)})`);
  const rest = files.not_pulled.length - shown.length;
  return rest > 0 ? [...shown, `…and ${rest} more not pulled`] : shown;
}

/** The report for a request closed before its claim because the login is dead. */
export function loginRequiredReport(): Report {
  return {
    lines: [`Blackboard login needed: the sync did not start. Open ${LOGIN_PAGE_URL} and sign in with Duo.`],
    error: LOGIN_REQUIRED,
    files: { ...EMPTY_FILES, not_pulled: [] },
    claim_attempts: 0,
  };
}

/** The report for a stage that failed before the files step. */
export function failureReport(stage: string, error: string, claimAttempts: number): Report {
  const message = clip(error, ERROR_MAX);
  return {
    lines: [`Sync runner: ${stage} failed: ${message}`],
    error: `${stage} failed: ${message}`,
    files: { ...EMPTY_FILES, not_pulled: [] },
    claim_attempts: claimAttempts,
  };
}

/** The report for a pass that reached the files step, and the state to close with. */
export function buildReport(input: ReportInput): { state: 'done' | 'failed'; report: Report } {
  const lines: string[] = [];
  let error: string | null = null;

  if (input.foldStatus === 'failed') {
    lines.push('Sync runner: the fold failed; nothing from this crawl reached the typed tables');
    error = 'fold failed';
  } else if (input.foldStatus === 'partial') {
    lines.push('Sync runner: the fold finished partial; a stage above failed');
  }

  if (input.filesError) {
    const message = clip(input.filesError, ERROR_MAX);
    lines.push(`Sync runner: files failed: ${message}`);
    error = error ?? `files failed: ${message}`;
  }
  if (input.filesStopped === 'session_expired') {
    lines.push('Files stopped: the Blackboard session expired; the rest are tried on the next sync');
    error = LOGIN_REQUIRED;
  }

  lines.push(filesLine(input.files), ...notPulledLines(input.files));

  if (input.embedError) {
    const message = clip(input.embedError, ERROR_MAX);
    lines.push(`Sync runner: embedding failed: ${message}`);
    error = error ?? `embed failed: ${message}`;
  }

  return {
    state: error === null ? 'done' : 'failed',
    report: {
      lines,
      error,
      files: { pulled: input.files.pulled, not_pulled: input.files.not_pulled.map((f) => ({ ...f })) },
      claim_attempts: input.claimAttempts,
    },
  };
}
