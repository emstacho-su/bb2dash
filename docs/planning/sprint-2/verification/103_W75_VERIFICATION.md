# 103: W-75 verification note (Phase 22, the walk box)

Worker W-75. Branch `feat/styling-22-walkbox`, cut from `feat/styling-22` at a58be34. Worktree
`C:/Users/stack/projects/bb2dash-wt-22-walkbox`. Task 0 of brief 103 as the PM's freeze ruling F-3
describes it: the throwaway test container that every Phase 22 browser walk uses, and the helpers
its specs share.

Files, all new: F-3's six (`scripts/walk-box.mjs`, `scripts/walk-box.test.mjs`,
`docker/walk/entry.sh`, `web/e2e/walk22.lib.ts`, `web/test/walk22-lib.test.ts`, this note) and
five more beside them since the third sitting, listed under "Files added in the third sitting".
Nothing else was changed.

Date: 2026-10-08. Every command below was run by itself and its exit code read directly.

This worker sat three times. The first two built the walk box. The third answered an independent
checker's six findings. Its section comes first, because it changes what the later sections say.
Where a later section still describes the walk box as it was before the findings, it says so.

## Task 0's check

| Check | Result |
|---|---|
| `node --test scripts/walk-box.test.mjs` gives 0 failures | 98 tests, 98 pass, 0 fail, 0 skipped, exit 0 (49 before the findings) |
| `cd web && npx vitest run test/walk22-lib.test.ts` | 48 passed, exit 0 (39 before the findings) |
| A real run of `web/e2e/harness.spec.ts` on this branch's build ends with 0 | run `20261008T172425Z` at 42923e1, clean, exit 0, 65 s, 2 tests passed. Every fix of the third sitting is in it. After 42923e1 only two test files (a01165e, 14e94ef) and this note changed |
| `run.json` is present | yes, in `C:/Users/stack/.bb2dash-walk/22/<run id>/` |
| No container is left (`docker ps -a --filter name=bb2dash-walk22`) | no line printed, before and after the run |

## The checker's six findings (third sitting)

An independent checker read the second sitting's work and sent six findings, one must-fix and five
should-fix. Each was checked against the code first. All six are right. Each was fixed with a
failing test first, in the order below.

| Finding | What was wrong | Red | Green |
|---|---|---|---|
| W75-C5 | `entry.sh` and the real docker call had no test that ran them | 0f00e84 | 3d24059 |
| W75-C1 | a failed sign-in could print the login or the share token | c015822 | 432291c |
| W75-C3 | a stopped run left its box running | 7ca2c96 | 69e980d |
| W75-C2 | `--url` typed the test login into any https host | 29cbc1d | b87911c |
| W75-C4 | an `--exec` record named the caller's commit, not the box's | c4cf9d4 | f94ae43 |
| W75-C6 | a new spec could take the old write guard by mistake | e0d5d6f | b6fc942 |

Six more commits change no behaviour of the walk box: 3bb6bd4 (the test file in three parts),
4a00687 (the host script in three parts), and four that touch tests only: f76f9a4 (the
`entry.sh` runs start four at a time), 42923e1 (a stand-in waits a minute, not ten), a01165e (a
wait in a test is given an end) and 14e94ef (a run of `entry.sh` gets 300 s, not 60). The last
two came out of "The mutation run".

### W75-C5: tests that run `entry.sh` and the real docker call

Verified. The second sitting's tests read `entry.sh` as text and injected docker. Nothing ran the
script, and nothing started a real process through `runDocker`.

`docker/walk/entry.test.mjs` now runs the script the way `docker/workspace/init-firewall.test.mjs`
runs its own. Each test copies `entry.sh` into a scratch folder with its four place constants
(`SRC_WEB`, `WORK`, `NPM_CACHE`, `BOX_OUT`) pointed at that folder, puts stand-ins for `npm`, `npx`
and `node` first on PATH, and runs it with a real bash. `entry.sh` itself has no test switch. The
runs hold:

* The order of a new box: copy, `npm ci`, the build, the server, the sign-in, the walk, the results.
* The walk ends with Playwright's own exit code (1 and 2 tried), and the results are kept.
* Each step that breaks ends with its own code and nothing after it runs: 72 `npm ci`, 73 a
  setting that is missing or in quotes, 73 the build, 74 the server, 75 the sign-in. 71 without
  the login file. 70 for a call it cannot read.
* What a build must not inherit is not copied: `node_modules`, `.next`, `.env.local`, `e2e/.auth`,
  `e2e/.results`, `*.tsbuildinfo`. The login file is copied nowhere.
* `walk` in a kept box takes `e2e/` again from the worktree, installs and builds nothing, and
  writes to its own folder.
* `--url` builds and serves nothing, and only there does the share token reach the sign-in.
* No sentinel value handed in (the login file's two values, the anon key, the share token, a
  value in `.env.local`) is in what the script prints, on five ways of ending.

The two text checks are tighter. Every line of `entry.sh` that names the login file must be one of
two exact lines. No line may hold `export -p`, `declare -x` or `-p`, `typeset`, `printenv`,
`compgen`, `set -x`, `xtrace`, `/proc/<pid>/environ`, or `env` or a bare `set` as a command. One
more check holds that Playwright's code is never read through a pipe.

`runDocker` is exported and takes the client as an option (the default is `docker`). The tests
drive it against node running a small script. They hold that every argument arrives as given
(spaces, `$HOME`, `%PATH%`, `;`, `&`, quotes, `*`), that the exit code is the answer, that what is
printed reaches the console and the log file, and that a client that cannot be started is an error
and never a code. One test runs `main()` through the real call. One starts
`node scripts/walk-box.mjs` itself and reads 64 off the process.

A spec reached through a link is refused from both sides: a link inside `web/e2e` that leads out,
and a link outside it that leads in.

Red: the one command failed to load, because `runDocker` was not exported. The `entry.sh` run
tests and the link test passed from their first run, since the code they hold was right. A test
that has never failed proves little, so their proof is the mutation run below. Green: 68 tests,
68 pass.

Not done: `scripts/package.json`'s `test` list. That file is not in this worker's set, so it is
left for the PM (see "What the PM should know", item 11).

### W75-C1: a failed sign-in printed what was being typed

Verified with made-up values, no env file read. On Playwright 1.63.0 a `fill` that cannot land
ends with `fill("<the value>")` in its call log, and a `goto` that fails ends with the whole
address, `_vercel_share` included. `login.mjs` prints that message. `entry.sh` passed it on to the
console, and the host script copied it to `stdout.log`.

Fixed in `entry.sh`, which is this worker's file. `sign_in` now catches everything `login.mjs`
prints, stdout and stderr, in a variable that lives for that function. None of it is printed on
any path, a sign-in that lands included. A failed sign-in says two lines of fixed words:

```
[walk-box] login.mjs ended with exit code 1 at: locator.fill on #password (timed out)
[walk-box] what login.mjs printed is not shown: a failed step's message can carry the login or the share token
```

The name of the call comes from a fixed list of the nine Playwright calls `login.mjs` makes
(`LOGIN_CALLS`). The field and "timed out" are fixed phrases too. An error of any other shape is
told as "a step login.mjs does not name". The rest is told from the outside, as before: whether
`/login` answers, and the server's log.

Red: the stand-in for `node` fails the sign-in three ways with a sentinel in each message. 18
tests, 14 pass, 4 fail; the share token sentinel was in what `entry.sh` printed. Green: 18 pass.

Not done: `web/e2e/login.mjs` itself. It is a Phase 17 file outside this worker's set, and the
finding says the PM has to assign it. It still prints `error.message` when it is run by hand
(`npm run walk:login`, and the acceptance run's host wrapper in bb2dash-stack, which was not
looked at). Through the walk box nothing it prints can reach the console or `stdout.log` any more.

### W75-C3: a stopped run left its box

Verified. The script had no signal handler. A kept box was started without `--rm` and slept for
good. The walk had no limit of its own.

The host script, while a walk runs, listens for SIGINT, SIGTERM and SIGHUP. On one of them it:

1. removes the box this run started, with `docker rm -f` of its own container;
2. ends its docker client;
3. finishes `run.json` with `interrupted (<signal>), box removed` and exits with 128 plus the
   signal's number (130, 143, 129).

A docker call that itself ends with 129, 130, 137 or 143 is treated the same way. That is the
checker's own case: the client was gone, `run.json` said the run had ended, and the box was up.
An `--exec` run never removes the kept box, because another run started it. It ends its client,
writes `interrupted (<signal>), kept box left running`, and prints the `--rm` line.

Every box is now started with `--rm`. A kept box sleeps four hours (`KEPT_BOX_LIFE_S`) and then
ends and removes itself.

Inside the box, the sign-in has a limit of 300 s and the whole walk one of 3600 s, both through
`timeout`, like `npm ci` and the build (900 s each). A walk stopped at its limit ends with 77, a
new code of its own. A sign-in stopped at its limit ends with 75. The limits add up to 5820 s,
under two hours.

What no script can do: a hard kill runs no handler. On Windows that is what a tool's time limit
and the task manager do. The box then ends by its own limits and removes itself, and `run.json`
stays at "running". That case is now bounded, not gone.

Red: the one command failed to load, and the `entry.sh` tests alone gave 20 tests, 17 pass, 3
fail. Green: 84 tests, 84 pass.

### W75-C2: `--url` took any host

Verified. The box types the owner's test login into `<host>/login`, and `--url` checked only that
the address was a bare https origin. The second sitting's own test used
`https://web-xi-ten.vercel.app`, which is not the project's host.

`--url` now takes two kinds of host:

* production, `https://web-xi-ten-uy9xk6c6p0.vercel.app`. It is one constant. A test holds it
  equal to `appUrl` in `desktop/src/core/config.ts`.
* a branch preview of this project, `https://web-git-<branch>-emstacho-sus-projects.vercel.app`
  (the form `project-state/ORCHESTRATOR.md` gives).

Any other host is refused with 64 before any container starts. The refusal names the host as it
was read. To walk another host it has to be named a second time, in `WALK_BOX_ALLOW_HOST` (the
host, or `host:port`), which is compared exactly.

One limit, said in the code too: the preview pattern stops a slip of the hand. It does not prove
who holds a host. A name under `vercel.app` is anyone's to take until this project has taken it.

Red: the one command failed to load. Green: 89 tests, 89 pass.

### W75-C4: an `--exec` record named the caller, not the box

Verified. `planExec` built its record from the caller's worktree and HEAD and never read the box's
own `run.json`.

`--exec` now reads the `run.json` this script wrote when it started the box, and:

* refuses, with 64, a folder without that record, a record that is not that container's, and a
  box that another worktree started;
* writes the box's commit on the exec record as `built_commit`, with `built_dirty`, `mode` and
  `base_url`. `commit` and `dirty` stay what they were: the tree `web/e2e` is read from now;
* asks git, before the box is asked anything, which files under `web/` outside `web/e2e` are not
  as the box's commit has them (`git diff --name-only <built_commit> -- web ':(exclude)web/e2e'`
  and `git ls-files --others --exclude-standard` with the same paths). Any such file is refused
  with 64: `--exec` does not rebuild, so the walk would go on record against an app that is not
  this tree's. The answer is a new box.

Two cases are not compared, and say so. A box built from a worktree with uncommitted changes
cannot be compared with anything: `built_dirty` is true and a line says it. A `--url` box built
nothing: `built_commit` is null.

The default taken between "refuse" and "flag": refuse. A flag in `run.json` is not seen by a
reader who looks at the exit code.

One test runs the two git calls against a real scratch repository. A change under `web/e2e`, a
change under `docs/` and an ignored file are not listed. An edited file, a committed change and a
new file under `web/src` each are.

Red: the one command failed to load. Green: 98 tests, 98 pass.

### W75-C6: two write guards with nearly one name

Verified. `walk.ts`'s `guardWrites` passes every address under `/rest/v1/rpc/`. The app calls
`mark_announcements_seen` when the bell opens and when `/announcements` is visited
(`web/src/lib/queries.announcements.ts`), and the bell is one of the surfaces this phase walks.
Nothing checked which guard a spec uses.

`walk22.lib.ts` now exports `test`: Playwright's own, with `writes22` as an automatic fixture. It
puts `guardWrites22` on the context before the test runs and fails the test afterwards if anything
was recorded. `expect` is handed on beside it. A spec takes both from the lib and names no guard:

```ts
import { expect, quietSync, test } from './walk22.lib';

test('home, dark', async ({ page, context }) => {
  await quietSync(context);
  // ...
});
```

`web/test/walk22-lib.test.ts` reads every `.ts` file under `web/e2e` that Phase 21 did not leave
there (the nineteen older files are listed by name) and fails on a file that:

* takes `guardWrites` from `./walk`, by name, under another name, or by taking `walk.ts` whole;
* takes `test` from `@playwright/test`;
* is a spec and does not take `test` from `./walk22.lib`;
* opens a context of its own without `guardWrites22` on it, or uses `browser.newPage()`.

The rule is tried on `harness.spec.ts` saved under a new name, which is the finding's own case: it
fails on three counts.

Red: 48 tests, 43 pass, 5 fail. Green: 48 pass. `npm run typecheck` exit 0.
`npx eslint . --max-warnings 0` exit 0. The whole suite, `npx vitest run`: 157 files, 2961 tests
passed, exit 0.

#### The guarded test in a real runner

The unit tests drive the fixture's body against a stand-in for Playwright's context. Whether
Playwright itself runs an automatic fixture before the page opens was proved once, outside the
repository. A spec in the scratchpad took `test` from the lib and named no guard. It opened
`about:blank` and made requests to a made-up host, so there was no server, no sign-in and no data.
It ran on the host with this worktree's Playwright 1.63.0, not in docker.

| Run | Result |
|---|---|
| two tests that only read | exit 0, 2 passed. `mark_announcements_seen` was answered by the guard: 200, body `0` |
| one test that tried `workspace_ask` and a table write | exit 1, 1 failed, as it must: `Error: a walk spec tried to write`, raised by `withWriteGuard22` after the test ran, with both addresses listed |

### Files added in the third sitting

F-3 names six files. `scripts/walk-box.test.mjs` was 742 lines and `scripts/walk-box.mjs` 616
before the findings, and the fixes add about 1,400 lines of tests and 400 of code. The owner's
rule is 800 lines a file at most. No file is over it now; the longest is
`web/test/walk22-lib.test.ts` at 776. So five files were added beside the six, all under names of the walk
box. The one command still runs every test, because `scripts/walk-box.test.mjs` reads the other two
test files in.

| File | What it holds |
|---|---|
| `scripts/walk-box-main.test.mjs` | the `main()` tests, moved word for word (3bb6bd4), and the new ones |
| `docker/walk/entry.test.mjs` | the `entry.sh` tests, as `docker/workspace/init-firewall.test.mjs` sits beside its script |
| `scripts/walk-box-kit.mjs` | what the two host test files share. No test |
| `scripts/lib/walk-box-inputs.mjs` | what the box is handed and the rule for each: the output folder, the specs, the two files, the host of `--url` |
| `scripts/lib/walk-box-client.mjs` | the docker client and the signal watch |

The default taken: files added, not one file past 800 lines. If the PM wants only F-3's six, the
five fold back without a change of behaviour.

### The mutation run

The checker broke the code 28 ways and 8 changes survived. The same 28 were run again against the
tests as they are now, with 25 new ones, one or more per fix. Each mutant got a scratch copy
outside the repository.

Result, at a01165e: 53 mutants, 53 caught, none survived, none hung.

| The checker's eight survivors | Now caught by |
|---|---|
| M06, M07: either half of the spec path check dropped | a spec reached through a link is refused, whichever side of `web/e2e` the link is on |
| M21: the docker call resolves 0 always | runDocker: the answer is the client's own exit code |
| M22: the docker call goes through a shell | the runDocker tests against the stand-in (six fail) |
| M24: `entry.sh` ends with 0 after the walk | the run tests that read the exit code (five fail) |
| M25: Playwright's code read through a pipe | the text check for a pipe. `pipefail` is set, so the code still came through; the run tests do not tell this one apart |
| M26: the login file is printed | the two-lines check, and the sentinel in the run tests |
| M27: a failed sign-in is ignored | a step that breaks ends the box with that step's code |
| M28: the environment is printed | the text check, and the sentinel in the run tests |

The 25 new ones, by fix: three for W75-C1 (what was caught is printed after all; stderr not caught;
the step told with what follows its name), five for W75-C2 (any host; the pattern open at either
end; a port; the override as a prefix), ten for W75-C3 (the box left; a kept box removed by
`--exec`; a signal's exit code not acted on; the client not ended; `sleep infinity`; SIGHUP not
listened for; the watch never ended; no walk limit; the limit's code not mapped; no sign-in
limit), seven for W75-C4 (another worktree's box taken; a moved tree walked; `web/e2e` compared
too; new files not looked for; `built_commit` not the box's; any text taken for a commit; another
container's record taken).

The run found one fault in this sitting's own tests. Its first try stalled at M22 for twenty
minutes and was stopped by hand. With the docker call started through a shell, the stand-in client
never starts on Windows, and the test that waited for it to say "started" waited without end. A
gate that hangs is worse than one that fails. The wait now gives up after 15 s and fails the test
(a01165e), and the run was started again from M01.

The script is `mutate.mjs` in the session's scratchpad, not in the repository. W75-C6's rule is
not in it: its samples of files that must be refused are in `web/test/walk22-lib.test.ts` itself.

The run found a second fault of the same kind. Three `entry.sh` mutants run side by side, and in
one batch their counts of failed tests were higher than when each ran alone. So the `entry.sh`
tests were run unchanged, several suites at once:

| Suites side by side | Limit for one run of `entry.sh` | Result |
|---|---|---|
| 3 | 60 s | 20 of 20 in each, about 145 s each |
| 5 | 60 s | 7 to 9 of 20 failed in each. Every failure was a run stopped at the limit, none a wrong answer |
| 5 | 300 s | 20 of 20 in each, about 233 s each |

Several workers run their gates at once on this laptop, so that case is real. The limit only ends
a bash that hangs. It is 300 s now (14e94ef), and a loaded machine makes these tests slow, not
red. The 53 mutants were counted before that change, which touches no assertion.

### What the third sitting did not run

The task allowed one kind of docker use: a plain `docker run --rm` of a new container. So:

* `--keep`, `--exec` and `--rm` were not run for real after the fixes. The second sitting ran all
  three before them (the table under "The real runs"). What changed in them since is held by unit
  tests only: a kept box started with `-d --rm` and `sleep 14400`, and the `--exec` checks.
* `docker rm -f` was not run for real. The stop path is held with docker injected.
* No real signal was sent. On Windows one process cannot send another a signal it can catch, so
  the handlers are held by firing the watch by hand, and `watchSignals` against an event emitter.
* What `docker rm -f` answers for a container that is already gone was not looked at. The script
  does not depend on it: `run.json` says "box removed" only when docker ended with 0, and "box not
  removed" with a line naming `docker ps` when it did not.

## How the work was found

This is the second sitting's account. The first sitting wrote the host script's tests (8158ef2,
red), then the script and `entry.sh` (5c46e93, green), started the first real run and ended there.
The second sitting found two commits, a clean worktree, and one container named
`bb2dash-walk22-20261008t131023z` that had been up for two hours with no host script driving it.

That container was not touched. While it was being looked at, it ended by itself: docker's own
event log shows `die` with exit code 0 at 15:16:36Z and `destroy` one second later. Its run folder
`20261008T131023Z` holds `results/.last-run.json` with `"status": "passed"`, and a `run.json` that
still says `"result": "running"`, because the host script that would have finished the record was
gone. It is left as it is. It is the evidence for one rule below: a walk box whose host script is
killed finishes its walk and removes itself, and its `run.json` is never finished.

## Red, then green: the first two sittings

The third sitting's red and green are in the section above, finding by finding.

### The host script and the box (`scripts/walk-box.mjs`, `docker/walk/entry.sh`)

First cut, from the first sitting:

* RED, 8158ef2. `node --test scripts/walk-box.test.mjs` fails with `ERR_MODULE_NOT_FOUND`:
  `scripts/walk-box.mjs` is not written. (From that commit's own message; not re-run here.)
* GREEN, 5c46e93. Re-run at the start of the second sitting: 46 tests, 46 pass, exit 0.

Second cut, the second sitting. Reading the first cut against a real docker turned up three gaps:

1. `docker exec` ends with 1 for a container that is gone or stopped. 1 is also Playwright's code
   for a failed test, so `--exec` on a removed box would have been recorded as "tests failed".
2. A `--keep` run whose container never started still printed "is left running" with the two
   commands for it.
3. `npm ci` and the build had no time limit. A box whose host script was killed is watched by
   nobody, so each open-ended step needs an end of its own.

* RED, ea2fc72. 49 tests, 43 pass, 6 fail, exit 1.
* GREEN, 74eaa9a. 49 tests, 49 pass, exit 0.

What the tests hold, with docker and git injected so that nothing starts a container:

* The command line: specs, `--url`, `--keep`, `--exec`, `--rm`, Playwright's own arguments after
  `--`, and fifteen ways of writing it wrong.
* The exact docker arguments for a run, `--url`, `--keep`, `--exec` and `--rm`.
* The image tag equals `web/package.json`'s `@playwright/test` version, and a checkout with
  another version is refused.
* Refusals before any container starts: an output folder that is relative, inside a repository,
  inside a worktree, or reached through a link; a spec outside `web/e2e`, missing, or not a
  `.spec.ts` file; a missing web env file (build only) or login file; a path with a comma.
* No call names compose, a network, a port, another volume or another container.
* No value of either env file, and not the share token, appears in a docker call, in what is
  logged, or in `run.json`. The script opens neither env file.
* `run.json` is written before the container starts and again when it ends.
* `entry.sh` has LF line ends, stops at the first failure, copies `web/` without `node_modules`,
  `.next`, `e2e/.auth`, `e2e/.results` and any `.env*`, and never copies the login file.

Two of these lines were weaker than they read, and the checker showed it. "No value appears in
what is logged" held for the host script only, because docker was injected: what the container
printed was never looked at (W75-C1). The `entry.sh` line was a reading of its text (W75-C5).

### The spec helpers (`web/e2e/walk22.lib.ts`)

* RED, ce8eda8. `npx vitest run test/walk22-lib.test.ts` fails:
  `Error: Cannot find module '../e2e/walk22.lib'`. `Test Files 1 failed (1)`, `Tests no tests`.
* GREEN, 5bd8237. `Test Files 1 passed (1)`, `Tests 39 passed (39)`, exit 0. Two assertions were
  added with the code (an address under `rpc/` that names no function is stopped).

The route handlers are tested against a stand-in for Playwright's context that runs them in
Playwright's order: the handler registered last sees a request first. The rows `quietSync` hands
the app are read back through the app's own `syncPhase()`, and the copied labels are compared
with the app's `PHASE_LABEL`, so a change in the app turns this test red.

### The other gates, from `web/`

| Command | Second sitting | Third sitting |
|---|---|---|
| `npm ci` | not repeated: `web/node_modules` was already there | not repeated |
| `npx vitest run test/walk22-lib.test.ts` | 39 passed, exit 0 | 48 passed, exit 0 |
| `npm run typecheck` | exit 0 | exit 0 |
| `npx eslint . --max-warnings 0` | exit 0, no output | exit 0, no output |
| `npx vitest run` (the whole suite) | 157 files, 2952 tests passed, exit 0 | 157 files, 2961 tests passed, exit 0 |

## The real runs

All from `C:/Users/stack/projects/bb2dash-wt-22-walkbox`. Output is under
`C:/Users/stack/.bb2dash-walk/22/`.

The first table is the second sitting's, before the checker's findings. Each of its lines would
end the same way now. Two things would differ: the kept box would be started with `--rm` and a
four-hour sleep, and each `--exec` record would carry `built_commit`.

| Run id | Command | Commit | Time | Exit | Result |
|---|---|---|---|---|---|
| `20261008T152840Z` | `node scripts/walk-box.mjs web/e2e/harness.spec.ts` | 74eaa9a, clean | 74 s | 0 | passed, 2 tests |
| `20261008T153831Z` | `node scripts/walk-box.mjs --keep web/e2e/harness.spec.ts` | 5bd8237, clean | 56 s | 0 | passed, box left running |
| `exec-20261008T154008Z` | `node scripts/walk-box.mjs --exec bb2dash-walk22-20261008t153831z web/e2e/harness.spec.ts` | 5bd8237, clean | 12 s | 0 | passed, 2 tests |
| `exec-20261008T154034Z` | the same with `WALK_SHOTS=1` and the probe spec (below) | 5bd8237, dirty | 26 s | 0 | passed, 4 tests, 2 shots |
| none | `node scripts/walk-box.mjs --rm bb2dash-walk22-20261008t153831z` | | not timed | 0 | removed |
| none | `--exec` on the box just removed | | not timed | 67 | "is not running", no folder made |
| `20261008T154207Z` | `node scripts/walk-box.mjs --url https://web-xi-ten-uy9xk6c6p0.vercel.app web/e2e/harness.spec.ts -- -g "signed in"` | 5bd8237, clean | 35 s | 0 | passed, 1 test |
| `20261008T154258Z` | `node scripts/walk-box.mjs web/e2e/harness.spec.ts -- -g "no test has this title w75"` | 5bd8237, clean | 47 s | 1 | tests failed (no test found) |
| `20261008T154823Z` | `node scripts/walk-box.mjs web/e2e/harness.spec.ts` | 5edf03d, clean | 61 s | 0 | passed, 2 tests |

The last line is the same plain run again, on the branch as pushed with this note in it. Between
5bd8237 and 5edf03d only a comment in the script and this note changed.

A plain run took 47 to 74 seconds with npm's cache filled. In the 74-second run `npm ci` reported
21 s and the build's two timed steps 4.8 s and 9.1 s; the rest is the copy, the other build steps,
sign-in and the tests. The first run on a machine has an empty cache and was not timed.

Three refusals were also run for real. Each ended with 64, started no container and made no
folder: a spec outside `web/e2e`, `-g` given before `--`, and `WALK_BOX_OUT` set to a folder inside
the worktree.

After every line above, `docker ps -a --filter name=bb2dash-walk22` printed nothing. The one
volume is `bb2dash-walk-npm-cache`.

After the second sitting, four more runs are in the output folder. Three are the checker's, read
here from their `run.json`, all at e418ab4. They are what this note had under "could not be
proved": a failed build, a failed sign-in, and a host script that was stopped.

| Run id | Whose | What | Exit | `run.json` says |
|---|---|---|---|---|
| `20261008T160023Z` | the checker's | a build forced to fail | 73 | box failed: build |
| `20261008T160101Z` | the checker's | a sign-in forced to fail | 75 | box failed: sign-in |
| `20261008T160257Z` | the checker's | the host script stopped after 8 s (finding W75-C3) | 143 | ended with exit code 143 |
| `20261008T172425Z` | the third sitting's | `node scripts/walk-box.mjs web/e2e/harness.spec.ts` at 42923e1, clean | 0 | passed, 65 s |

The last line is the one real run of the third sitting, on every fix. It is a plain run, so it
went through the changed `docker run` call (`--rm` first), the sign-in with its output caught and
its limit, and the walk with its limit. Its `stdout.log` has no line of `login.mjs`'s. `npm ci`
reported 24 s. Before and after it, `docker ps -a --filter name=bb2dash-walk22` printed nothing.

The fourteen `stdout.log` files in the output folder were counted, not printed, for a line with
`fill("` or `_vercel_share=`. None has one. So the leak of W75-C1 did not happen in any run so
far.

### The run against production

The `--url` run walked the production site. It was not asked for. It was done because the first
real use of that mode would otherwise be after the merge. It signed in with the test login and ran
the one test `signed in`, which opens Home and reads. The local build reads the same database as
the same owner, so it touched nothing the other runs did not, except three page loads from Vercel.

### The probe: the helpers in a real browser

`harness.spec.ts` does not use `walk22.lib.ts`, so a spec of four tests was copied into `web/e2e`
for one `--exec` run and removed again. It is not committed. It is printed at the end of this note.
That run's `run.json` says `dirty: true` for that reason.

Each test first puts a backstop on the context. Playwright runs the handler registered last first,
so the backstop is the last one before the network. It records whatever the helpers let through
and stops every write and every RPC. In all four tests it saw nothing.

1. `quietSync(context)`: the Sync button says "Sync". A press shows the toast "Sync requested",
   no error line, and the label stays "Sync". No insert left the browser.
2. `quietSync(context, LONGEST_SYNC_PHASE_22)`: the button says "waiting on the container…" and
   still says so 12 seconds later, past two clock ticks and one poll. Its box was 193.6 px wide at
   1440 px.
3. `/announcements` calls `mark_announcements_seen`. The answer was 200 with body `0`, made by
   the guard. The database was not reached.
4. Five requests made from the page were stopped and recorded, in order: `workspace_ask`, an RPC
   with a made-up name, a PATCH of `assignment_progress`, a file write to Storage, and a
   sign-out. They carried no key and no session, so the API would have refused them anyway.

With `WALK_SHOTS=1` two shots were written through `shotPath22`, to
`C:/Users/stack/.bb2dash-walk/22/20261008T153831Z/exec-20261008T154034Z/shots/`. The Home shot
shows the owner's data signed in, in Inter, with the toast up.

## What was built beyond F-3's words

Each is small. Each is named here so the PM can strike it.

* **`--exec` asks the box first** (`docker exec <box> true`) and ends with 67 when it is not
  running.
* **`entry.sh` limits `npm ci` and the build** to 900 s each.
* **`guardWrites22` also stops a file write to Storage and a sign-out.** The app can upload and
  remove a submission file (`queries.submissions.ts`), and neither goes through `/rest/v1`. The
  account menu's Sign out calls `supabase.auth.signOut()`, which ends every session of the owner,
  the desktop app's among them. The account menu is one of the surfaces Phase 22 walks. A POST
  that only signs a link to read a file (`createSignedUrl`) passes.
* **`quietSync` refuses a context without `guardWrites22`.** Handlers run last registered first.
  With the guard first, a press of Sync is answered by `quietSync` and everything else falls
  through to the guard. In the other order the guard would stop the press.
* **`guardWrites22` twice on one context returns the same record.** A second set of handlers would
  have left the first caller's record empty for good.
* **A shot's folder is refused inside any git checkout**, not only the one the spec runs from.
* **`shotsAsked22()`**, so a spec asks before it shoots.
* **`run.json` holds more than F-3 lists**: the container, the mode, the host walked, the image,
  the worktree, whether it was dirty, the finish time, the duration and the result in words.
* **`next.log`** in the run folder: the server's own log.

Added by the third sitting, each for a finding:

* **`WALK_BOX_ALLOW_HOST`**: the one way to walk a host that is not the project's (W75-C2).
* **Exit 77** for a walk past its time limit, and **129, 130 and 143** for a run stopped by a
  signal (W75-C3).
* **`built_commit`, `built_dirty`, `mode` and `base_url` on an `--exec` record**, and the refusal
  of an `--exec` whose tree has moved on (W75-C4).
* **`test` and `expect` from `walk22.lib.ts`**, and `withWriteGuard22`, the fixture's body
  (W75-C6).

## The read list

F-3 says to list the RPCs the app calls for reads and to treat every other RPC as a write.
`grep "rpc("` under `web/src` finds six calls, all writes: `workspace_ask`, `workspace_cancel`,
`planner_series_create`, `planner_series_update`, `planner_series_delete` and
`mark_announcements_seen`. The app calls no RPC for a read. Search goes through the `search` edge
function at `/functions/v1/search`, which the guard does not touch.

The read list holds the three search functions of the database (`search_file_text`,
`match_file_text`, `hybrid_search_file_text`), because F-3 names search RPCs as reads. The default
taken: they are listed although no screen calls them today. In practice every RPC a screen makes
now is stopped, or answered in the case of `mark_announcements_seen`.

## What could not be proved

* **Two boxes at once.** Run ids are the UTC second, so two starts in the same second collide and
  the second is refused with 64. That is tested. Two builds running side by side were not tried.
* **A cold npm cache.** The first sitting's run filled it.
* **A server that does not start, in a real box.** The checker forced a failed build (73) and a
  failed sign-in (75) for real. A server that does not start (74) is held by the `entry.sh` run
  tests only.
* **`WALK_VERCEL_SHARE`.** The production host needs no share token. The token is passed by name
  and never by value, which the tests hold; no protected preview was walked.
* **The time limits, in a real box.** No step came near its limit. The run tests hold the sign-in
  and the walk limits with one-second limits and stand-ins that hang.
* **A press of Sync in a phase other than idle,** and the phases between idle and the longest, in
  a browser. The unit test reads all twelve through the app's `syncPhase()`.
* **The stop path against a real docker**, and `--keep`, `--exec` and `--rm` after the fixes. See
  "What the third sitting did not run".
* **The `entry.sh` run tests on another machine.** They ran on this laptop: Windows, Git Bash, GNU
  tar 1.35, coreutils 8.32. They need bash with GNU tar and coreutils' `timeout`. Where those are
  missing they are skipped and say why, so the count of skipped tests is worth reading. A Mac's
  own tar and its missing `timeout` are that case.
* **The guarded `test` in the walk box.** No Phase 22 spec exists on this branch, and
  `harness.spec.ts` is a Phase 17 file that keeps its own guard. The fixture was proved in a real
  Playwright runner on the host, not in the box.

One line that was here is gone: "`docker/walk/entry.sh` has no test that runs it". Thirteen
tests run it now.

## What the PM should know before workers use it

1. **The script walks the worktree it lives in.** A worker's branch needs this branch merged in
   before it can walk its own build.
2. **Give it time.** A tool call that ends after two minutes kills the host script, and on Windows
   that is a hard kill no script can catch. The box then finishes by itself within its own limits
   (under two hours at worst, about a minute for a small walk) and removes itself, `run.json`
   stays at "running", and the result is in `results/.last-run.json`. Start a walk with a time
   limit of ten minutes, or in the background, and read `run.json`. Ctrl-C, a plain kill and a
   closed terminal are different: the script removes its box and writes "interrupted".
3. **`--exec` does not rebuild, and now says no when it would matter.** It reads `web/e2e` from
   the worktree as it is now. The app is the one the box built. A changed or new file under `web/`
   outside `web/e2e` is refused with 64: start a new box. It is also refused from another
   worktree. A box started from a worktree with uncommitted changes is not compared, so commit
   before `--keep` if the record should name what was built. A kept box ends by itself after four
   hours.
4. **The build type-checks `web/e2e` too.** `next build` runs TypeScript over everything
   `tsconfig.json` includes. A spec with a type error fails a new box with 73. `--exec` does not
   type-check.
5. **Exit codes.** 0 passed. 1 Playwright did not pass. 64 refused before any container. 65 docker
   could not be started. 67 `--exec` on a box that is not running. 70 to 77 the box broke (wrong
   call, copy, npm ci, build, server, sign-in, results, the walk past its hour). 125 to 127 are
   docker's own. 129, 130 and 143 the run was stopped by a signal.
6. **Where shots are.** A run's are in `<run id>/shots/`. An `--exec` run's are in
   `<box run id>/exec-<run id>/shots/`. The folder is made by the first shot.
7. **A spec takes `test` and `expect` from `./walk22.lib`, never from `@playwright/test`.** That
   `test` guards every test by itself, so a spec names no guard. It calls `quietSync(context)`
   when the Sync label should hold still, and then opens the page. It never takes `guardWrites`
   from `./walk`. `cd web && npx vitest run test/walk22-lib.test.ts` fails on a new file under
   `web/e2e` that breaks this, so W-67's and W-68's specs are held to it as soon as this branch is
   merged into theirs. A spec that opens a context of its own calls `guardWrites22` on it.
8. **`harness.spec.ts` still takes its Phase 17 shot** through `shotPath`. In the box that path is
   inside the container's scratch copy and is thrown away with it. The worktree is mounted
   read-only, so nothing a spec does can write into it.
9. **The box is Linux Chromium.** Inter comes from Google Fonts over the network and renders as
   it does anywhere. The monospace stack (`ui-monospace, SFMono-Regular, Menlo, monospace`) falls
   back to a Linux font. A taste call about monospace text is better made on the Vercel preview.
10. **The box needs the network**: npm's registry, Google Fonts, and Supabase.
11. **`scripts/package.json`'s `test` script lists its files by name** and does not list
    `walk-box.test.mjs`. That file is outside this worker's set, so the checker's fix for it
    (W75-C5) is the PM's to make or to assign. One name is enough: `walk-box.test.mjs` reads the
    other two test files in. Listing all three would run two of them twice. The file takes about
    a minute on this laptop, because thirteen tests each run `entry.sh` under bash, and up to
    four minutes when several workers run it at once.
12. **The first sitting's run folder** `20261008T131023Z` has a `run.json` that says "running".
    It can be deleted. Nothing reads it.
13. **`web/e2e/login.mjs` still prints Playwright's whole message when a step fails** (W75-C1).
    The walk box no longer passes it on. Run by hand it goes to the caller's own console. The
    finding's fix for the file itself is fixed words for each step and no message. It is a Phase
    17 file outside this worker's set, so it is the PM's to assign.
14. **`--url` takes production and a branch preview only.** For any other host:
    `WALK_BOX_ALLOW_HOST=<host> node scripts/walk-box.mjs --url https://<host> ...`. One build's
    own address (`web-<id>-emstacho-sus-projects.vercel.app`) is such a host.

## The helpers as built

```ts
// web/e2e/walk22.lib.ts
type Env = Readonly<Record<string, string | undefined>>;

shotsAsked(env: Env): boolean
shotPathFrom(env: Env, checkoutRoot: string, name: string): string
shotsAsked22(): boolean                    // WALK_SHOTS === '1'
shotPath22(name: string): string           // <WALK_SHOT_DIR>/<name>; throws unless asked for

READ_RPCS: ReadonlySet<string>
type GuardVerdict = 'pass' | 'abort' | 'answer_seen'
rpcNameOf(address: string): string | null
rpcVerdict(name: string): GuardVerdict
guardVerdict(method: string, address: string): GuardVerdict
guardWrites22(context: BrowserContext): Promise<string[]>   // by hand only for a context a spec opens itself

// Third sitting. A spec takes these two, and names no guard.
test                                       // Playwright's test with the automatic fixture writes22: string[]
expect                                     // Playwright's own, handed on
withWriteGuard22(context: BrowserContext, runTest: (writes: string[]) => Promise<void>): Promise<void>

SYNC_PHASES_22: readonly ['idle', 'queued', 'unclaimed', 'requeued', 'starting', 'crawling',
                          'pulling_files', 'finishing', 'session', 'done', 'failed', 'cancelled']
type SyncPhase22 = (typeof SYNC_PHASES_22)[number]
SYNC_LABEL_22: Readonly<Record<SyncPhase22, string>>
LONGEST_SYNC_PHASE_22: SyncPhase22         // 'unclaimed', "waiting on the container…"
QUIET_REQUEST_ID: number
QUIET_RUN_ID: string
quietSyncAnswer(phase: SyncPhase22, request: QuietRequest, now: Date): QuietAnswer | null
quietSync(context: BrowserContext, phase?: SyncPhase22): Promise<void>   // idle by default
```

A shot's name is a bare `.png` file name: letters, digits, dot, underscore and hyphen, starting
with a letter or a digit.

The host script's command line, as it is after the third sitting:

```
node scripts/walk-box.mjs [--url <https origin>] [--keep] <spec under web/e2e>... [-- <playwright arguments>]
node scripts/walk-box.mjs --exec <container> <spec under web/e2e>... [-- <playwright arguments>]
node scripts/walk-box.mjs --rm <container>
```

What it reads from the environment, by name: `WALK_BOX_OUT`, `WALK_BOX_WEB_ENV`,
`WALK_BOX_LOGIN_ENV`, `WALK_SHOTS`, `WALK_VERCEL_SHARE` and, new, `WALK_BOX_ALLOW_HOST`.

## The probe spec, as it was run

Not a file of this branch. Kept here as the record of the second sitting's run. It is written the
old way: `test` from `@playwright/test`, and the guard called by hand. Saved under `web/e2e` as it
stands, it would now fail `test/walk22-lib.test.ts`. To repeat the run, take `expect` and `test`
from `./walk22.lib` and drop the three `guardWrites22` calls that the fixture now makes; the
fourth test, which tries writes on purpose, then has to empty its record before it ends.

```ts
import { expect, test, type BrowserContext } from '@playwright/test';
import { assertNoWrites, dismissNativeDialogs, openSignedIn } from './walk';
import {
  LONGEST_SYNC_PHASE_22,
  QUIET_REQUEST_ID,
  QUIET_RUN_ID,
  SYNC_LABEL_22,
  guardWrites22,
  quietSync,
  shotPath22,
  shotsAsked22,
} from './walk22.lib';

const SYNC_BUTTON = 'sync-button';
const SETTLE_MS = 2000;

/** What got past the lib. A read goes on to the database; anything else stops here. */
async function backstop(context: BrowserContext): Promise<string[]> {
  const reached: string[] = [];
  await context.route(/\/rest\/v1\/(agent_requests|sync_runs|rpc\/)|\/storage\/v1\/|\/auth\/v1\/logout/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isRpc = url.pathname.includes('/rest/v1/rpc/');
    const isQuietRead =
      url.searchParams.get('kind') === 'eq.sync' ||
      url.searchParams.get('id') === `eq.${QUIET_REQUEST_ID}` ||
      url.searchParams.get('run_id') === `eq.${QUIET_RUN_ID}`;
    if (request.method() === 'OPTIONS' || (request.method() === 'GET' && !isRpc && !isQuietRead)) {
      await route.fallback();
      return;
    }
    reached.push(`${request.method()} ${url.pathname}${url.search}`);
    if (request.method() === 'GET' && !isRpc) await route.fallback();
    else await route.abort('blockedbyclient');
  });
  return reached;
}

test('w75 probe: idle is pinned, and a press of Sync files nothing', async ({ page, context }) => {
  const reached = await backstop(context);
  const writes = await guardWrites22(context);
  await quietSync(context);
  dismissNativeDialogs(page);

  await openSignedIn(page, '/');
  const button = page.getByTestId(SYNC_BUTTON);
  await expect(button).toHaveText(SYNC_LABEL_22.idle);
  await page.waitForTimeout(SETTLE_MS);

  await button.click();
  const wrap = button.locator('xpath=..');
  await expect(wrap.getByRole('status').filter({ hasText: 'Sync requested' })).toBeVisible();
  await expect(wrap.getByRole('alert')).toHaveCount(0);
  await page.waitForTimeout(SETTLE_MS);
  await expect(button).toHaveText(SYNC_LABEL_22.idle);

  if (shotsAsked22()) await page.screenshot({ path: shotPath22('w75-probe-home-idle.png') });
  expect(reached, 'nothing of the Sync button reached the database').toEqual([]);
  assertNoWrites(writes);
});

test('w75 probe: the longest label is pinned', async ({ page, context }) => {
  const reached = await backstop(context);
  const writes = await guardWrites22(context);
  await quietSync(context, LONGEST_SYNC_PHASE_22);
  dismissNativeDialogs(page);

  await openSignedIn(page, '/');
  const button = page.getByTestId(SYNC_BUTTON);
  await expect(button).toHaveText(SYNC_LABEL_22[LONGEST_SYNC_PHASE_22]);
  await expect(button).toHaveAttribute('title', /Nothing has claimed this sync/);
  await page.waitForTimeout(12_000);
  await expect(button).toHaveText(SYNC_LABEL_22[LONGEST_SYNC_PHASE_22]);
  console.log(`[w75 probe] longest label, button box: ${JSON.stringify(await button.boundingBox())}`);

  if (shotsAsked22()) await button.screenshot({ path: shotPath22('w75-probe-sync-longest.png') });
  expect(reached, 'nothing of the Sync button reached the database').toEqual([]);
  assertNoWrites(writes);
});

test('w75 probe: mark_announcements_seen is answered here', async ({ page, context }) => {
  const reached = await backstop(context);
  const writes = await guardWrites22(context);
  await quietSync(context);
  dismissNativeDialogs(page);

  const seen = page.waitForResponse((response) => response.url().includes('/rest/v1/rpc/mark_announcements_seen'));
  await openSignedIn(page, '/announcements');
  const response = await seen;
  expect(response.status()).toBe(200);
  expect(await response.text()).toBe('0');
  await page.waitForTimeout(SETTLE_MS);

  expect(reached, 'no RPC reached the database').toEqual([]);
  assertNoWrites(writes);
});

test('w75 probe: a write RPC, a table write, a file write and a sign-out are stopped and recorded', async ({ page, context }) => {
  const reached = await backstop(context);
  const writes = await guardWrites22(context);
  await quietSync(context);
  dismissNativeDialogs(page);
  const firstRead = page.waitForRequest((request) => request.url().includes('/rest/v1/'));
  await openSignedIn(page, '/');

  // No key and no session: the API would refuse each anyway, and none may leave the browser.
  const api = new URL((await firstRead).url()).origin;
  const attempts: [string, string][] = [
    ['POST', '/rest/v1/rpc/workspace_ask'],
    ['POST', '/rest/v1/rpc/w75_probe_not_a_function'],
    ['PATCH', '/rest/v1/assignment_progress?id=eq.0'],
    ['POST', '/storage/v1/object/w75-probe/none.txt'],
    ['POST', '/auth/v1/logout?scope=local'],
  ];
  const outcomes = await page.evaluate(
    async ({ origin, list }) => {
      const out: string[] = [];
      for (const [method, path] of list) {
        try {
          const response = await fetch(`${origin}${path}`, { method, body: '{}' });
          out.push(`${method} ${path} -> ${response.status}`);
        } catch {
          out.push(`${method} ${path} -> blocked`);
        }
      }
      return out;
    },
    { origin: api, list: attempts },
  );
  expect(outcomes).toEqual(attempts.map(([method, path]) => `${method} ${path} -> blocked`));
  expect(writes).toEqual(attempts.map(([method, path]) => `${method} ${api}${path}`));
  expect(reached, 'none of them reached the network').toEqual([]);
});
```
