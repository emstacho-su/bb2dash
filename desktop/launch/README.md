# Logon build for the desktop shell

Two minutes after you sign in, a hidden task launches bb2dash from the build
that is already on disk, then, only if `desktop/` changed on `origin/main`,
rebuilds it in an ephemeral container for the next logon. The launch happens
before any network or Docker call; the `git fetch` that follows is capped at
45 s and, offline, the ref as last fetched is used. The common case is one
`Start-ScheduledTask` and one fetch, about two seconds at below-normal
priority. Docker Desktop's own autostart is not touched.

The Electron shell is a Windows program (toasts, tray, Windows Terminal), so it
is never run inside a container. What runs in the container is the build:
`npm ci`, typecheck, the unit suite, `electron-builder --win --x64 --dir`.

## Files

| file | job |
|---|---|
| `logon-build.ps1` | the scheduled action: fetch, decide, activate, launch, build, compose |
| `update-now.ps1` | the app's **Update now**: with `-Detach`, hand off to a second run of itself; that run waits for bb2dash to exit, repoints `current`, starts `Bb2dash-App` |
| `Bb2dashLaunch.psm1` | the logic: decisions, state record, build command (pure); the Update now swap (junction + injected process/task calls) and its hand-off (injected `Start-Process`) |
| `Bb2dashLaunch.Tests.ps1` | Pester tests for the module (Pester 3.4, as Windows ships it) |
| `compose.build.yaml` | the ephemeral build service, `docker compose run --rm` |
| `register-logon-task.ps1` | writes (or `-Unregister`s) the two Task Scheduler entries |

## State (outside every checkout)

```
%LOCALAPPDATA%\bb2dash-launch\
  launch\                                  the installed copy of these scripts; the task runs this
  builds\<tree>\win-unpacked\bb2dash.exe   one folder per built desktop/ tree hash
  current                                  junction -> the active win-unpacked
  state.json                               lastBuiltSha, lastBuildAt, lastResult
  last-check.json                          checkedAt, remoteTree, skip (what the last run could check)
  force-request.json                       from the app: a short Docker wait for the next run; consumed
  swap-pending                             the tree a running Update now helper is switching to; removed when it ends
  logs\logon-build.log                     one line per step; rolls at 512 KB
  logs\update-now.log                      one line per Update now step; rolls at 512 KB
```

`<tree>` is `git rev-parse origin/main:desktop`, the tree hash of the folder,
so a commit that only touches `web/` never triggers a rebuild. The junction is
only ever repointed while the app is not running: Windows locks a running
exe's files, so a build that finishes while bb2dash is open becomes current at
the next logon, or sooner when Stack presses **Update now** (below).

## Without a logon (2026-09-30)

The app itself starts `Bb2dash-LogonBuild` at launch and every 6 hours
(`BUILDER_INTERVAL_HOURS` in `src/core/update/builder-trigger.ts`), skipping it
when the task is already running. Nothing about the run changes: the app is
running, so the startup step does nothing, the fetch and the rebuild happen as
usual, and a finished build waits.

When a newer build is waiting (`state.json`'s `lastBuiltSha` differs from the
tree the app is running from, and that build is on disk), the next window open
shows **Update now / Update later** (details in `desktop/README.md`). **Update
now** runs `launch\update-now.ps1 -Tree <tree> -StateDir <dir> -Detach` as a
hidden child of the app and waits for it to exit 0 (30 s bound). With `-Detach`
the script does not swap: `Invoke-HelperHandoff` starts a second run of the same
script without `-Detach` through `Start-Process -WindowStyle Hidden`, logs that
run's pid and exits (6 when the start failed). The app quits only once that run
has written `swap-pending` naming the tree (20 s bound); otherwise it stays on
its build. The two stages exist because Windows PowerShell 5.1 started detached
(no console) exits 0 without running its script, and a plain child of the app
dies with the app, while a process that child starts does not (2026-10-04).

The helper (`Invoke-UpdateSwap` in `Bb2dashLaunch.psm1`) first refuses, touching
nothing (no marker, no mutex, no start; exit 5), while an existing `swap-pending`
names another build and is younger than its two waits (60 s app + 120 s builder);
an older one is a leftover and is overwritten. Otherwise it writes `swap-pending`,
then:

1. waits up to 60 s for every `bb2dash` process to exit;
2. repoints `current` at `builds\<tree>\win-unpacked` with the same junction
   step `Invoke-Activate` uses (the junction only, never a build folder), and
   puts the old target back if the new junction cannot be created;
3. starts `Bb2dash-App` (or `current\bb2dash.exe` when the task is missing).

If the build is gone or the junction cannot be moved, the old build stays
current and the app is started on it; if the app never exited, nothing is
started (the app gave up on the helper and is still running). Each step is logged to
`logs\update-now.log`. The helper runs from the installed copy under
`launch\`, which the builder refreshes after each successful build, so the first
build carrying this feature installs it. An app built before the hand-off cannot
deliver it through its own **Update now** (its detached start never runs the
script); the build carrying it becomes current at the next logon, when the app
is not running. A new app against an older installed script fails safe: the old
script rejects `-Detach`, exits non-zero, and the app stays on its build.

The build reads from a detached `git worktree` at `<repo>-build`, never from
the checkout the Sync terminal works in, so a rebuild cannot collide with a
running `/bb-sync`. The task runs the installed copy under `launch\`, not the
checkout, so the branch you have checked out does not matter; the copy is
refreshed from the build worktree after each successful build.

## Trust note

Whatever lands on the build ref is built and, at the next logon, run as you.
That is the feature, and it is the same trust root as running `git pull` and
`npm run pack` by hand, minus the human step. If push access to `main` is ever
in doubt, point `-BuildRef` at a tag you move deliberately, or turn on branch
protection with required reviews. `-BuildRef` is a parameter of both scripts.

## Two scheduled tasks

| task | trigger | priority | why |
|---|---|---|---|
| `Bb2dash-LogonBuild` | at logon + 2 min | 7 (below normal), 60 min limit | fetch, launch, build |
| `Bb2dash-App` | none | 4 (normal), no limit | runs `current\bb2dash.exe` |

The app runs through its own task so it is not a child of the build task. A
child would inherit the low priority and die when the build task hits its
time limit.

## Setup

```powershell
cd C:\Users\<you>\projects\bb2dash\desktop\launch

# 1. first build, in the foreground (pulls the ~6 GB builder image once)
powershell -NoProfile -File .\logon-build.ps1 -NoLaunch -Verbose

# 2. Start Menu shortcut with the AppUserModelID (toasts need it), pointing at the junction
..\scripts\make-shortcut.ps1 -ExePath "$env:LOCALAPPDATA\bb2dash-launch\current\bb2dash.exe"

# 3. install the copy the task runs, and the two tasks
.\register-logon-task.ps1
Start-ScheduledTask -TaskName Bb2dash-LogonBuild     # run it now instead of waiting for a logon
```

`%APPDATA%\bb2dash\config.json` must exist with `supabaseAnonKey` and a
`repoDir` that names your checkout (see `desktop/README.md`).

While this branch is unmerged, register with
`-BuildRef origin/feat/desktop-logon-build`; after the merge re-run with the
default (`origin/main`).

## Living with it

- `Get-Content "$env:LOCALAPPDATA\bb2dash-launch\logs\logon-build.log" -Tail 20` is the first
  place to look. Every decision is logged with its reason.
- A failed build leaves the previous build current and records `lastResult: failed`; the next
  logon tries again.
- `docker volume ls | Select-String bb2dash-desktop-build` shows the four caches the build keeps
  (node_modules, npm, Electron, electron-builder). Remove them to force a cold build.
- `.\register-logon-task.ps1 -Unregister` takes both tasks out. The builds folder and the
  junction can be deleted by hand.

## Tests

```powershell
Invoke-Pester -Path desktop\launch
```

The decision matrix, the state record's parsing and immutability, and the
build command are pinned. The Update now swap runs against a real junction
under Pester's `TestDrive`, with the process check and the launch injected. The side-effecting script is kept thin on purpose:
each function does one thing and logs it.
