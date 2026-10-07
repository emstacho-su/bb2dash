#!/usr/bin/env node
// bb2dash :: scripts/inbox-decisions-pr.mjs
// Runs the inbox-decisions exporter into the log branch and keeps one pull request open for it
// (Phase 23). The day files reach `main` the way everything else does: a branch, a PR, and Stack's
// word to merge. This script never merges and never touches the checkout it is run from.
//
//   node scripts/inbox-decisions-pr.mjs [--worktree <dir>] [exporter options]
//
// It keeps a worktree of its own (default: `bb2dash-wt-inbox-log` beside this checkout) on the
// branch `docs/inbox-decisions`, brings that branch level with `origin/main`, runs
// `inbox-decisions-export.mjs --log-dir <worktree>/docs/inbox-decisions`, and when a day file
// changed commits it, pushes, and opens the PR if none is open. A push that failed last time is
// picked up by the next run: whatever is uncommitted or unpushed in the worktree goes with it.
//
// The scheduled task and /inbox-apply's session mode both call this, so there is one way a
// decision becomes a note and a log entry. SECRETS_DIR and HARNESS_DIR are the exporter's.
//
// Exit codes are the exporter's (0, 1, 2); a git or gh failure is 1.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { LOG_DIR, main as exportMain, runCommand } from './inbox-decisions-export.mjs';

export const LOG_BRANCH = 'docs/inbox-decisions';
export const BASE_BRANCH = 'main';
export const PR_TITLE = 'docs(inbox): Inbox decisions log';
export const PR_BODY = [
  'The day files of `docs/inbox-decisions/`, rendered by `scripts/inbox-decisions-export.mjs` from the',
  'decision each archived Inbox item carries (Phase 23, "database first, files after"). Every entry here',
  'is already recorded on its row and in its vault note; this PR is how the repo log reaches `main`.',
  '',
  'Opened and updated by `scripts/inbox-decisions-pr.mjs`. Merge it whenever you like; the next run',
  'opens a new one when there is something new.',
].join('\n');
const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const LOG_PATH = LOG_DIR.join('/');
const EXIT_FAILED = 1;

/** A git or gh step that did not succeed. */
export class StepError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StepError';
  }
}

/** Split off `--worktree <dir>`; everything else is the exporter's. */
export function parseArgs(argv, repoRoot = REPO_ROOT) {
  const rest = [];
  let worktree = path.resolve(repoRoot, '..', 'bb2dash-wt-inbox-log');
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--worktree') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new StepError('--worktree needs a folder');
      worktree = path.resolve(value);
      i += 1;
    } else if (argv[i] === '--log-dir') {
      throw new StepError('--log-dir is set by this script: the day files go to the log worktree');
    } else rest.push(argv[i]);
  }
  return { worktree, exporterArgs: rest };
}

/** "docs(inbox): decisions of 2026-10-07, 2026-10-08" from the day files that changed. */
export function commitMessage(changedFiles) {
  const dates = [...new Set(changedFiles.map((file) => /(\d{4}-\d{2}-\d{2})\.md$/.exec(file)?.[1]).filter(Boolean))].sort();
  return dates.length === 0 ? 'docs(inbox): decisions log' : `docs(inbox): decisions of ${dates.join(', ')}`;
}

/** The paths of `git status --porcelain` lines. */
export function changedPaths(porcelain) {
  return String(porcelain)
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => line.slice(3).trim().replace(/^"|"$/g, ''));
}

function step(run, command, args, cwd, what) {
  const result = run(command, args, cwd);
  if (result.status !== 0) {
    throw new StepError(`${what} failed (exit ${result.status}): ${String(result.stderr || result.stdout).trim().split(/\r?\n/)[0] ?? ''}`);
  }
  return result.stdout;
}

/** The worktree on the log branch, created on first use and brought level with origin/main. */
export function prepareWorktree({ worktree, repoRoot, run, fsImpl = fs }) {
  step(run, 'git', ['fetch', '--quiet', 'origin'], repoRoot, 'git fetch');
  if (!fsImpl.existsSync(worktree)) {
    const remote = run('git', ['rev-parse', '--verify', '--quiet', `origin/${LOG_BRANCH}`], repoRoot).status === 0;
    const start = remote ? `origin/${LOG_BRANCH}` : `origin/${BASE_BRANCH}`;
    step(run, 'git', ['worktree', 'add', '-B', LOG_BRANCH, worktree, start], repoRoot, 'git worktree add');
  }
  const branch = step(run, 'git', ['rev-parse', '--abbrev-ref', 'HEAD'], worktree, 'git rev-parse').trim();
  if (branch !== LOG_BRANCH) throw new StepError(`${worktree} is on ${branch}, not ${LOG_BRANCH}: leaving it alone`);
  // A merge, never a rebase or a reset: the branch may hold entries a PR has not merged yet.
  step(run, 'git', ['merge', '--no-edit', '--quiet', `origin/${BASE_BRANCH}`], worktree, `git merge origin/${BASE_BRANCH}`);
}

/** Commit what changed under the log folder, push, and make sure a PR is open. Returns a line. */
export function publish({ worktree, run }) {
  const changed = changedPaths(step(run, 'git', ['status', '--porcelain', '--', LOG_PATH], worktree, 'git status'));
  if (changed.length > 0) {
    step(run, 'git', ['add', '--', LOG_PATH], worktree, 'git add');
    step(run, 'git', ['commit', '--quiet', '-m', commitMessage(changed)], worktree, 'git commit');
  }
  const ahead = Number(step(run, 'git', ['rev-list', '--count', `origin/${BASE_BRANCH}..HEAD`], worktree, 'git rev-list').trim());
  if (!(ahead > 0)) return 'log branch: nothing new';
  step(run, 'git', ['push', '--quiet', '-u', 'origin', LOG_BRANCH], worktree, 'git push');
  const open = step(run, 'gh', ['pr', 'list', '--head', LOG_BRANCH, '--base', BASE_BRANCH, '--state', 'open', '--json', 'number', '--jq', '.[0].number // empty'], worktree, 'gh pr list').trim();
  if (open !== '') return `log branch: pushed; PR #${open} is open`;
  const url = step(run, 'gh', ['pr', 'create', '--base', BASE_BRANCH, '--head', LOG_BRANCH, '--title', PR_TITLE, '--body', PR_BODY], worktree, 'gh pr create').trim();
  return `log branch: pushed; opened ${url.split(/\r?\n/).pop()}`;
}

function printLine(line) {
  process.stdout.write(`${line}\n`);
}

export async function main(argv, deps = {}) {
  const { env = process.env, log = printLine, run = runCommand, repoRoot = REPO_ROOT, exporter = exportMain } = deps;
  try {
    const { worktree, exporterArgs } = parseArgs(argv, repoRoot);
    prepareWorktree({ worktree, repoRoot, run });
    const code = await exporter([...exporterArgs, '--log-dir', path.join(worktree, ...LOG_DIR)], { env, log });
    // Publish even when the exporter failed part-way: what it did file is on disk and marked.
    if (!exporterArgs.includes('--dry-run')) log(publish({ worktree, run }));
    return code;
  } catch (error) {
    log(`inbox-decisions-pr: ${String(error?.message ?? error)}`);
    return EXIT_FAILED;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
