// The log-branch publisher on a recorded command runner (Phase 23). No git, no gh, no network.

import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import {
  BASE_BRANCH,
  LOG_BRANCH,
  PR_TITLE,
  StepError,
  changedPaths,
  commitMessage,
  main,
  parseArgs,
  prepareWorktree,
  publish,
} from './inbox-decisions-pr.mjs';

const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' });
const fail = (stderr = 'boom') => ({ status: 1, stdout: '', stderr });

/** A runner that answers from `answers` (keyed by the first words of the command) and records calls. */
function recorder(answers = {}) {
  const calls = [];
  const run = (command, args, cwd) => {
    const line = `${command} ${args.join(' ')}`;
    calls.push({ line, cwd });
    const key = Object.keys(answers).find((prefix) => line.startsWith(prefix));
    return key ? answers[key] : ok();
  };
  return { run, calls, lines: () => calls.map((c) => c.line) };
}

test('arguments: --worktree is this script\'s, the rest is the exporter\'s, and --log-dir is refused', () => {
  const repo = path.resolve('repo');
  assert.deepEqual(parseArgs([], repo), { worktree: path.resolve(repo, '..', 'bb2dash-wt-inbox-log'), exporterArgs: [] });
  assert.deepEqual(parseArgs(['--dry-run', '--worktree', 'w', '--limit', '5'], repo), {
    worktree: path.resolve('w'),
    exporterArgs: ['--dry-run', '--limit', '5'],
  });
  assert.throws(() => parseArgs(['--worktree'], repo), StepError);
  assert.throws(() => parseArgs(['--log-dir', 'x'], repo), /set by this script/);
  // The manual step writes the day files; --notes-only is the schedule's mode and writes none.
  assert.throws(() => parseArgs(['--notes-only'], repo), /writes the day files/);
});

test('the commit message names the days that changed, once each, in order', () => {
  assert.equal(commitMessage(['docs/inbox-decisions/2026-10-08.md', 'docs/inbox-decisions/2026-10-07.md', 'docs/inbox-decisions/2026-10-08.md']),
    'docs(inbox): decisions of 2026-10-07, 2026-10-08');
  assert.equal(commitMessage(['docs/inbox-decisions/README.md']), 'docs(inbox): decisions log');
  assert.deepEqual(changedPaths(' M docs/inbox-decisions/2026-10-07.md\n?? docs/inbox-decisions/2026-10-08.md\n\n'), [
    'docs/inbox-decisions/2026-10-07.md',
    'docs/inbox-decisions/2026-10-08.md',
  ]);
});

test('the worktree is created on first use, from the remote log branch when there is one', () => {
  const missing = { existsSync: () => false };
  const fresh = recorder({ 'git rev-parse --verify': fail(), 'git rev-parse --abbrev-ref': ok(`${LOG_BRANCH}\n`) });
  prepareWorktree({ worktree: 'w', repoRoot: 'repo', run: fresh.run, fsImpl: missing });
  assert.deepEqual(fresh.lines(), [
    'git fetch --quiet origin',
    `git rev-parse --verify --quiet origin/${LOG_BRANCH}`,
    `git worktree add -B ${LOG_BRANCH} w origin/${BASE_BRANCH}`,
    'git rev-parse --abbrev-ref HEAD',
    `git merge --no-edit --quiet origin/${BASE_BRANCH}`,
  ]);
  assert.equal(fresh.calls[2].cwd, 'repo');
  assert.equal(fresh.calls[4].cwd, 'w');

  const resumed = recorder({ 'git rev-parse --abbrev-ref': ok(`${LOG_BRANCH}\n`) });
  prepareWorktree({ worktree: 'w', repoRoot: 'repo', run: resumed.run, fsImpl: missing });
  assert.ok(resumed.lines().includes(`git worktree add -B ${LOG_BRANCH} w origin/${LOG_BRANCH}`));

  const existing = recorder({ 'git rev-parse --abbrev-ref': ok(`${LOG_BRANCH}\n`) });
  prepareWorktree({ worktree: 'w', repoRoot: 'repo', run: existing.run, fsImpl: { existsSync: () => true } });
  assert.equal(existing.lines().some((l) => l.startsWith('git worktree add')), false);
});

test('a worktree on another branch is left alone, and a failed step stops the run', () => {
  const wrong = recorder({ 'git rev-parse --abbrev-ref': ok('main\n') });
  assert.throws(() => prepareWorktree({ worktree: 'w', repoRoot: 'repo', run: wrong.run, fsImpl: { existsSync: () => true } }), /is on main, not docs\/inbox-decisions/);
  assert.equal(wrong.lines().some((l) => l.startsWith('git merge')), false);

  const offline = recorder({ 'git fetch': fail('could not resolve host') });
  assert.throws(() => prepareWorktree({ worktree: 'w', repoRoot: 'repo', run: offline.run }), /git fetch failed \(exit 1\): could not resolve host/);
});

test('publish commits the day files, pushes, and opens the PR only when none is open', () => {
  const first = recorder({
    'git status': ok(' M docs/inbox-decisions/2026-10-07.md\n'),
    'git rev-list': ok('1\n'),
    'gh pr list': ok('\n'),
    'gh pr create': ok('https://github.com/emstacho-su/bb2dash/pull/99\n'),
  });
  assert.equal(publish({ worktree: 'w', run: first.run }), 'log branch: pushed; opened https://github.com/emstacho-su/bb2dash/pull/99');
  assert.deepEqual(first.lines().slice(0, 5), [
    'git status --porcelain -- docs/inbox-decisions',
    'git add -- docs/inbox-decisions',
    'git commit --quiet -m docs(inbox): decisions of 2026-10-07',
    `git rev-list --count origin/${BASE_BRANCH}..HEAD`,
    `git push --quiet -u origin ${LOG_BRANCH}`,
  ]);
  assert.ok(first.lines()[6].startsWith(`gh pr create --base ${BASE_BRANCH} --head ${LOG_BRANCH} --title ${PR_TITLE}`));

  const open = recorder({ 'git status': ok(' M docs/inbox-decisions/2026-10-07.md\n'), 'git rev-list': ok('2\n'), 'gh pr list': ok('99\n') });
  assert.equal(publish({ worktree: 'w', run: open.run }), 'log branch: pushed; PR #99 is open');
  assert.equal(open.lines().some((l) => l.startsWith('gh pr create')), false);
});

test('publish with nothing changed and nothing ahead pushes nothing; an unpushed commit from last time still goes', () => {
  const idle = recorder({ 'git status': ok(''), 'git rev-list': ok('0\n') });
  assert.equal(publish({ worktree: 'w', run: idle.run }), 'log branch: nothing new');
  assert.deepEqual(idle.lines(), ['git status --porcelain -- docs/inbox-decisions', `git rev-list --count origin/${BASE_BRANCH}..HEAD`]);

  const pending = recorder({ 'git status': ok(''), 'git rev-list': ok('1\n'), 'gh pr list': ok('99\n') });
  assert.equal(publish({ worktree: 'w', run: pending.run }), 'log branch: pushed; PR #99 is open');
  assert.equal(pending.lines().some((l) => l.startsWith('git commit')), false);
  assert.ok(pending.lines().includes(`git push --quiet -u origin ${LOG_BRANCH}`));
});

test('main: prepares, runs the exporter into the worktree, publishes, and returns the exporter\'s code', async () => {
  const rec = recorder({ 'git rev-parse --abbrev-ref': ok(`${LOG_BRANCH}\n`), 'git status': ok(''), 'git rev-list': ok('0\n') });
  const lines = [];
  let exporterArgs = null;
  const code = await main(['--worktree', 'w', '--limit', '3'], {
    env: {},
    log: (l) => lines.push(l),
    run: rec.run,
    repoRoot: 'repo',
    exporter: async (args) => {
      exporterArgs = args;
      return 1;
    },
  });
  assert.equal(code, 1);
  assert.deepEqual(exporterArgs, ['--limit', '3', '--log-dir', path.join(path.resolve('w'), 'docs', 'inbox-decisions')]);
  // Published even though the exporter reported a failure: what it did file is on disk.
  assert.deepEqual(lines, ['log branch: nothing new']);
});

test('main: --dry-run publishes nothing, and a git failure is exit 1 with one line', async () => {
  const dry = recorder({ 'git rev-parse --abbrev-ref': ok(`${LOG_BRANCH}\n`) });
  assert.equal(await main(['--dry-run'], { env: {}, log: () => {}, run: dry.run, repoRoot: 'repo', exporter: async () => 0 }), 0);
  assert.equal(dry.lines().some((l) => l.startsWith('git status')), false);

  const lines = [];
  const broken = recorder({ 'git fetch': fail('offline') });
  let ran = false;
  const code = await main([], { env: {}, log: (l) => lines.push(l), run: broken.run, repoRoot: 'repo', exporter: async () => { ran = true; return 0; } });
  assert.equal(code, 1);
  assert.equal(ran, false);
  assert.deepEqual(lines, ['inbox-decisions-pr: git fetch failed (exit 1): offline']);
});
