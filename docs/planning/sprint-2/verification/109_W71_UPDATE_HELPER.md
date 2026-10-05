# 109 — W-71 verification note: the desktop Update now helper

Worker W-71 · branch `fix/desktop-update-helper` (from `origin/main` 3d7683a) · worktree
`bb2dash-wt-update-helper`. Scope: the desktop app's **Update now** (prompt) and **Update desktop
app** (account menu) buttons. No database, no `project-state/`, no migrations. Nothing was run against
the real launcher folder (`%LOCALAPPDATA%\bb2dash-launch`), the real `Bb2dash-LogonBuild` or
`Bb2dash-App` tasks, or Stack's running `bb2dash.exe`.

## What was broken

Both buttons end in `startUpdateHelper` (`desktop/src/main/update-os.ts`). It started
`powershell.exe … -File <stateDir>\launch\update-now.ps1 -Tree <tree> -StateDir <stateDir>` through
`spawnDetached` (`detached: true`, `stdio: 'ignore'`, `windowsHide: true`). On Windows, `detached`
means DETACHED_PROCESS: the child has no console, and Windows PowerShell 5.1 then exits 0 before it
runs the script. Node still fires `spawn`, so `update-flow.ts` and `force-update.ts` logged "helper
started … quitting so it can swap" and quit. `update-now.ps1` never ran.

## Evidence (PM, 2026-10-04; built on here, not re-investigated)

* Six presses on 2026-10-04 all failed this way: no `logs\update-now.log`, no PowerShell
  engine-start event, and `current` never moved.
* Reproduced from Node against scratch folders. A detached spawn never runs the script, with or
  without `windowsHide`, with or without `-WindowStyle Hidden`, and also via `conhost --headless`.
* A non-detached spawn with `windowsHide: true` does run the script. But that child is in libuv's
  kill-on-close job object, so it would die when the app exits.
* What runs and also outlives the parent: a non-detached hidden-console PowerShell that starts a
  second PowerShell with `Start-Process -WindowStyle Hidden`. libuv's job sets
  SILENT_BREAKAWAY_OK, so the grandchild is outside the job.

## What changed

| File | Change |
|---|---|
| `desktop/launch/update-now.ps1` | New `[switch] $Detach`. With it, the script does not swap. It imports the module and calls `Invoke-HelperHandoff`, passing the running `powershell.exe` (`(Get-Process -Id $PID).Path`), `$PSCommandPath` and a `Start-Process -WindowStyle Hidden -WorkingDirectory $StateDir -PassThru` scriptblock (the list is joined explicitly, already quoted). It exits 0, or `$EXIT_HANDOFF_FAILED = 6` on any failure, with an ERROR line. The `-Detach` branch has no fallback restart, because the app is still running and stays on its build. The header describes both stages. |
| `desktop/launch/Bb2dashLaunch.psm1` | `New-HelperHandoffArgumentList` (pure): `-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File <script> -Tree -StateDir -AppTaskName -TimeoutSeconds`, with no `-Detach`. Every PowerShell option comes before `-File`. The tree is validated. `ConvertTo-ProcessArgument` quotes an element containing whitespace, doubles the backslashes before the closing quote, and refuses an element containing `"`. `Invoke-HelperHandoff` takes injected `-StartProcess` and `-Log`, logs INFO with the child's pid, and on a throw or a `$null` process logs ERROR and returns `Ok = $false`. Both are exported. |
| `desktop/launch/Bb2dashLaunch.Tests.ps1` | 9 Pester cases. Argv: no `-Detach`, `-WindowStyle Hidden`, `-File <script>`, options before `-File`, Tree/StateDir/AppTaskName/TimeoutSeconds carried, a StateDir and a script path with a space quoted, a trailing backslash kept, a bad tree and an embedded `"` refused. Hand-off: one start with the list in the state folder and the pid logged; a throwing start reported at ERROR; a `$null` start counted as a failure. |
| `desktop/src/core/update/swap-marker.ts` (new) | `PENDING_SWAP_FILE = 'swap-pending'` and the pure `judgeSwapMarker(seen, before, tree)`. It returns `waiting` (no marker, a leftover whose write time has not changed since before the press, or text that is not yet a tree hash), `started` (a new marker naming the tree), or `other-tree`. |
| `desktop/src/main/update-os.ts` | `updateHelperArgv` appends `-Detach`. `spawnDetached` is removed (nothing else used it). New: `runHidden`, a non-detached spawn with `windowsHide`, `stdio: 'ignore'` and `cwd`, bounded, which kills and rejects on timeout and rejects on a spawn error. Also new: `readSwapMarker` (stat + read; `null` only on ENOENT). `startUpdateHelper` checks the installed script, reads the marker as it was, runs stage 1 (`HELPER_HANDOFF_TIMEOUT_MS` 30 s) and requires exit 0. It then polls every `MARKER_POLL_MS` (250) for up to `HELPER_START_TIMEOUT_MS` (20 s) until `judgeSwapMarker` says `started`. All I/O is injected (`exists`, `readMarker`, `run`, `sleep`, `now`). The header explains the two stages. |
| `desktop/test/unit/update-os.test.ts` | The argv test gains `-Detach`. `startUpdateHelper` cases, on a fake clock: not installed; exit 0 + marker resolves (argv, cwd, bound, poll timing); exit 6 rejects without polling; no exit code; spawn error; stage-1 timeout; no marker by 20 s; a new marker naming another tree rejects at once; a leftover marker never counts, but a rewritten one does; a marker read error. Real: `runHidden` against `node` (exit 0/3, timeout kill, missing program, empty argv) and `readSwapMarker` in a temp folder. |
| `desktop/test/unit/swap-marker.test.ts` (new) | 7 cases for the verdict. |
| `desktop/README.md`, `desktop/launch/README.md` | The hand-off, both bounds, and the failure texts. `swap-pending` added to the state layout. A note on how the fix reaches a machine whose running app predates it. |

`update-flow.ts` and `force-update.ts` are unchanged. Their "helper started … quitting so it can
swap" lines are now true, because `startUpdate` resolves only after the marker appears.

### Failure texts a press can now produce

* `main.log`, prompt path: *Update now could not start the helper; staying on this build: …*.
  Account-menu path: *force update: the swap helper could not start; staying: …*, and the UI says
  *Update failed: the update could not start*. The `…` is one of:
  * `update-now.ps1 -Detach exited <n>: no helper was started (logs\update-now.log)`
    (`without an exit code` when stage 1 was killed)
  * `powershell.exe did not exit within 30000 ms; stopped it`
  * `the update helper did not start within 20000 ms: no swap-pending for build <tree> (logs\update-now.log)`
  * `another update is running: swap-pending names build <other>, not <tree>`
  * a spawn or marker-read error as Node reports it
* `update-now.log` (stage 1): `[ERROR] could not hand off to the helper: <reason>` or
  `[ERROR] update-now hand-off failed: <reason>`.

## RED evidence (tests first)

* Pester, with the new cases and no module functions yet: `Passed: 60 Failed: 8 Skipped: 0 Pending: 0 Inconclusive: 0`.
  The refusal case passed vacuously, because a missing command also throws. It became a real
  check once the function existed.
* Vitest, with the new cases and no implementation: `Tests  13 failed | 22 passed (35)`, and
  `swap-marker.test.ts` failed to import its missing module.

## Gates (final tree, last lines verbatim)

| Command (from `desktop/`) | Last line |
|---|---|
| `npm ci` | `added 336 packages, and audited 337 packages in 34s` (followed by the existing `npm warn allow-scripts` lines; exit 0) |
| `npm run typecheck` | `> tsc -p tsconfig.test.json --noEmit` (no errors; exit 0) |
| `npm test` | `Tests  819 passed (819)`; coverage `Statements 97.06% · Branches 94.3% · Functions 97.11% · Lines 98.2%` (thresholds 90/85/90/90) |
| `npm run test:e2e` | `23 passed (14.5s)` |
| `powershell -NoProfile -NonInteractive -Command "Invoke-Pester -Path 'C:/Users/stack/projects/bb2dash-wt-update-helper/desktop/launch'"` | `Passed: 68 Failed: 0 Skipped: 0 Pending: 0 Inconclusive: 0` |

The e2e run had `BB2DASH_LAUNCH_DIR` pointed at a scratch folder. The e2e shell is a dev run, so
it reads no launcher state anyway; the setting is an extra guard.

## Live OS proof (scratch only)

Setup: a plain `node` script (`scratchpad\w71\live-proof.mjs`) spawned stage 1 the way
`startUpdateHelper` now does: `spawn(powershell.exe, argv, { cwd: stateDir, stdio: 'ignore',
windowsHide: true })`, not detached, with a 30 s bound. It used the worktree's
`desktop\launch\update-now.ps1`, `-Tree 0000000000000000000000000000000000000000`,
`-StateDir <scratch>\w71\live`, `-AppTaskName Bb2dash-NoSuchTask-W71`, `-TimeoutSeconds 1` and
`-Detach`. The parent polled the marker and exited about 1.5 s after stage 1 exited. Beforehand,
`Mutex.TryOpenExisting('Local\Bb2dashLaunchBuild')` returned False, so no real build was running
when the scratch helper took that mutex for about 2 s.

Parent's record:

```
+0ms parent pid 28624; marker before stage 1: false
+28ms stage 1 spawned, pid 34076
+1078ms stage 1 exited 0
+1649ms marker present, content '0000000000000000000000000000000000000000'
+2602ms parent exiting; marker present now: true
```

`<scratch>\w71\live\logs\update-now.log` after the helper finished:

```
2026-10-04 21:15:06 [INFO] update to 0000000000000000000000000000000000000000 handed off to the helper (pid 40156); this stage exits
2026-10-04 21:15:06 [INFO] update to 0000000000000000000000000000000000000000 requested; waiting up to 1s for the app to exit
2026-10-04 21:15:08 [WARN] update decision: [Launch] because the app did not exit in time: the old build stays current
2026-10-04 21:15:10 [ERROR] the app could not be started: This command cannot be run because either the parameter "WorkingDirectory" has a value that is not valid or cannot be used with this command. Give a valid input and Run your command again.
2026-10-04 21:15:10 [INFO] update-now done (swapped=False, launched=False)
```

The helper wrote its last two lines about 3 s after the Node parent had exited. Afterwards
`swap-pending` was gone and pids 34076 and 40156 no longer existed. "The app did not exit in time"
is expected, because Stack's `bb2dash.exe` was running; the helper only read the process table. The
start error is expected, because the task name does not exist and the scratch folder has no
`current\bb2dash.exe`.

A second run used a state folder with a space in it (`<scratch>\w71\live space`) and produced the
same five lines, written into `live space\logs\`. So the quoted `-StateDir` reached the helper as
one argument.

A fail-safe check used the pre-fix `update-now.ps1` (from 3d7683a, copied to scratch) with
`-Detach`. Result: `A parameter cannot be found that matches parameter name 'Detach'.`, exit 1,
nothing written. A new app paired with an old installed script therefore stays on its build.

## Decided here, declined, or left out

* **Leftover markers never count.** I added a check that the design did not spell out. A
  `swap-pending` whose write time has not changed since before the press is a leftover from a helper
  killed before its cleanup, and it never counts as this press's helper. Without the check, a
  leftover naming the same tree would quit the app with no helper running, which is the very failure
  being fixed. A leftover naming another tree would also block every later update. Because of this,
  the injected `readFile` became `readMarker` (text plus write time). A new marker naming another
  tree still rejects at once. A marker that is empty or partial is treated as still being written.
* **The verdict lives in `core/update/swap-marker.ts`**, following "decisions in core". The
  polling stays in `update-os.ts`.
* **Quoting goes a little beyond "quote whitespace".** Backslashes before the closing quote are
  doubled, and an element containing `"` is refused.
* **Real-process unit tests.** A few tests spawn `node` for `runHidden` and use a temp folder for
  `readSwapMarker`. Everything else stays on fakes.
* **Not proven here: a press in the real app.** The real app, the tasks and the launcher folder are
  off limits, so the first real press is the end-to-end proof. An app built before this fix cannot
  deliver it through its own Update now (its detached start never runs the script). The build
  carrying it becomes current at the next logon.
* **Open risk (closed by the PM's probe, 2026-10-04 21:24): the relaunch through `Bb2dash-App`.**
  The PM ran a throwaway probe task whose action Start-Processes a sleeping grandchild. The task
  went back to `Ready` while the grandchild was still alive. So a handed-off process is outside the
  task's job, and the helper's `Start-ScheduledTask Bb2dash-App` is accepted. The original text
  follows for the record. The proof's parent was a plain
  Node process. The real app is the `Bb2dash-App` task's action, and Task Scheduler tracks a task's
  processes in its own job object. `Bb2dash-App` is registered with `MultipleInstances IgnoreNew`.
  If the handed-off helper stays in that job, the task instance may still count as running while the
  helper runs. In that case the helper's `Start-ScheduledTask Bb2dash-App` would be dropped: the swap
  happens, but the app does not come back. This exposure predates this fix, since the old design
  would have hit the same thing if its helper had ever run. It is unverified either way. The first
  real press settles it. Look for `app started on build <tree>` in `update-now.log` together with no
  running `bb2dash.exe`. If that is what happens, a follow-up should have the helper wait for the
  task to leave `Running`, or start `current\bb2dash.exe` directly. I did not register a probe task
  to test it, because that would be a system change outside this brief.
* **Commit trailer.** I used `Co-Authored-By: Claude Opus 5.5`, the model that did the work, as
  the session's attribution rule says, rather than the brief's "Claude Fable 5.1".

---

## Round 2 (from `/code-review fix/desktop-update-helper high`; `/security-review` had no finding)

Each item went test first: the new or changed cases failed, then passed. One commit per item.

| Item | Commit | What changed |
|---|---|---|
| R2-7 | 4ae23ac | `New-HelperHandoffArgumentList` no longer puts `-WindowStyle Hidden` in the child argv. `Start-Process -WindowStyle Hidden` in `update-now.ps1` hides the window, and a comment there says so. Pester pins that the argv carries neither `-WindowStyle` nor `Hidden`. |
| R2-3 | 66d2d4d | `Invoke-HelperHandoff` captures the process inside the `try` and logs outside it through `Write-BestEffortLog`, which falls back to stderr. A log that throws never changes `Ok`. Pester: a throwing `-Log` after a successful start gives `Ok=$true`, pid 4242; after a failed start it still reports the failure. |
| R2-1 | c7eab90 | Before writing its own marker, `Invoke-UpdateSwap` calls `Get-ForeignPendingSwap`. If an existing `swap-pending` names a different build and is younger than `TimeoutSeconds + LockWaitSeconds`, the helper logs ERROR `another update is in progress for build <other>: nothing swapped, nothing started`. It then returns `Launched=$false` (stage 2 exits 5) without writing anything, taking the mutex or starting anything. An older marker is a leftover and is overwritten. Pester: a fresh foreign marker is refused, with marker content and write time unchanged and `Mutex.TryOpenExisting` False; a stale foreign marker and a same-tree marker both proceed. The app-side `other-tree` verdict stays, and comments in `swap-marker.ts` and `update-os.ts` now say the helper refuses first. |
| R2-2 | e219c8e | When the app is still running after the wait, `Get-UpdateSwapDecision` returns no actions, with the reason `the app is still running after <n>s; nothing swapped, nothing started`. `Invoke-UpdateSwap` launches only when the swap step's decision says Launch. Past the builder-mutex bound it launches only if the app is gone (`Get-BuilderBusyOutcome`). Exit is 5 in both "nothing" cases. My own addition: the catch-path fallback (`Invoke-UpdateFallback` and the inline no-module fallback in `update-now.ps1`) follows the same rule and no longer "starts it anyway". On the app side, the marker-timeout and other-tree failures end with `; a helper may still be running: see logs\update-now.log`, and a failed stage 1 does not. Both READMEs now say "…stays current; if the app never exited, nothing is started" and describe R2-1's refusal. Pester: the decision, the swap, the mutex-bound-with-app-running case and the fallback. Vitest: both suffixes, plus no suffix after a failed stage 1. |
| R2-4 | 15e54a6 | While polling, a read or stat error counts as "not there yet". The last one is named at the bound: `…: no swap-pending for build <tree>; last read error: <code>; a helper may still be running: see logs\update-now.log` (the message text when there is no errno code). The read before stage 1 still rejects, because no helper exists yet. Tests: EPERM on poll 2 then the marker on poll 3 resolves; EPERM on every poll rejects naming `EPERM`; a codeless error is named by its message. |
| R2-5 | adc239e | The timeout reads `…did not exit within <ms> ms; stopped it (pid N)` only when `child.kill()` returned true, otherwise `…; could not stop it (pid N)`. The runner is now `createRunHidden(spawnFn)`, with `runHidden` as the default over Node's `spawn`. Tests: a real `node` past a 300 ms bound gives `stopped it (pid <n>)`; a fake child whose `kill()` returns false gives `could not stop it (pid 4242)`. |
| R2-6 | bf9992f, 0775bf6 | The `startUpdate` contract in `update-flow.ts` and `force-update.ts` now reads: "Hand the swap helper off through update-now.ps1 -Detach; resolves only once the helper's swap-pending marker names the build (seconds, up to about 50 s); rejects when nothing is running." I also fixed the module's own Update now section comment, which still said "spawns update-now.ps1, detached". |

Declined by the PM and left untouched: a per-press token in the marker; sharing
`ConvertTo-ProcessArgument` with `logon-build.ps1`; STATUS/DECISIONS; the commit trailers. The
relaunch risk is closed (see the open-risk paragraph above).

### Round 2 gates (final tree, last lines verbatim)

| Command (from `desktop/`) | Last line |
|---|---|
| `npm run typecheck` | `> tsc -p tsconfig.test.json --noEmit` (no errors; exit 0) |
| `npm test` | `Tests  824 passed (824)`; coverage `Statements 97.32% · Branches 94.3% · Functions 97.53% · Lines 98.4%` |
| `npm run test:e2e` (with `BB2DASH_LAUNCH_DIR` pointed at scratch) | `23 passed (9.1s)` |
| `powershell -NoProfile -NonInteractive -Command "Invoke-Pester -Path 'C:/Users/stack/projects/bb2dash-wt-update-helper/desktop/launch'"` | `Passed: 75 Failed: 0 Skipped: 0 Pending: 0 Inconclusive: 0` |

`npm ci` was not repeated: `package-lock.json` did not change in Round 2.

### Round 2 live proof (scratch only)

The same script and arguments as in round 1, run three times, each in a fresh scratch folder.
`Local\Bb2dashLaunchBuild` was not held beforehand.

**1. `live-r2`, `-TimeoutSeconds 1`, no `bb2dash` process running.** Stack's app was closed at
that moment. The helper took the "app gone" path and finished before the parent exited, so this
run shows the hand-off but not survival:

```
2026-10-04 21:49:07 [INFO] update to 0000000000000000000000000000000000000000 handed off to the helper (pid 12192); this stage exits
2026-10-04 21:49:07 [INFO] update to 0000000000000000000000000000000000000000 requested; waiting up to 1s for the app to exit
2026-10-04 21:49:08 [WARN] update decision: [Launch] because build 0000000000000000000000000000000000000000 is not on disk: the old build stays current
2026-10-04 21:49:08 [ERROR] the app could not be started: This command cannot be run because either the parameter "WorkingDirectory" has a value that is not valid or cannot be used with this command. Give a valid input and Run your command again.
2026-10-04 21:49:08 [INFO] update-now done (swapped=False, launched=False)
```

**2. `live-r2b`, `-TimeoutSeconds 1`, app running.** To get "the app is still running" without
touching Stack's app, a copy of `PING.EXE` named `bb2dash.exe` ran from scratch and exited on its
own after about 7 s. The R2-2 path shows, with no start attempted:

```
2026-10-04 21:49:33 [INFO] update to 0000000000000000000000000000000000000000 handed off to the helper (pid 20356); this stage exits
2026-10-04 21:49:33 [INFO] update to 0000000000000000000000000000000000000000 requested; waiting up to 1s for the app to exit
2026-10-04 21:49:34 [WARN] update decision: [] because the app is still running after 1s; nothing swapped, nothing started
2026-10-04 21:49:34 [INFO] update-now done (swapped=False, launched=False)
```

**3. `live-r2c`, `-TimeoutSeconds 4`, app running.** The longer wait makes the helper outlive
the parent, so this run shows survival. Parent's record:

```
+0ms parent pid 20648; marker before stage 1: false
+11ms stage 1 spawned, pid 8444
+377ms stage 1 exited 0
+612ms marker present, content '0000000000000000000000000000000000000000'
+1906ms parent exiting; marker present now: true
```

At the moment the parent exited, the log held only the first two lines. After the helper
finished:

```
2026-10-04 21:49:51 [INFO] update to 0000000000000000000000000000000000000000 handed off to the helper (pid 41844); this stage exits
2026-10-04 21:49:51 [INFO] update to 0000000000000000000000000000000000000000 requested; waiting up to 4s for the app to exit
2026-10-04 21:49:55 [WARN] update decision: [] because the app is still running after 4s; nothing swapped, nothing started
2026-10-04 21:49:55 [INFO] update-now done (swapped=False, launched=False)
```

Afterwards `swap-pending` was gone and pid 41844 no longer existed.

Stack's own `bb2dash.exe` appeared at 21:49:32, from `%LOCALAPPDATA%\bb2dash-launch\current`,
with parent `explorer.exe`: a launch from the shell, not by any helper. No helper in these runs
started anything; a helper start would have a PowerShell parent. I only read the process table;
nothing was stopped or started. The stand-in copy was deleted afterwards.
