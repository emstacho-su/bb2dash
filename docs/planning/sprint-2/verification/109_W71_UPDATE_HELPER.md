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
* **Open risk, not tested: the relaunch through `Bb2dash-App`.** The proof's parent was a plain
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
