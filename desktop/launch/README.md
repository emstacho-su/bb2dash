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
| `Bb2dashLaunch.psm1` | the pure half: decision, state record, build command; no side effects |
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
  logs\logon-build.log                     one line per step; rolls at 512 KB
```

`<tree>` is `git rev-parse origin/main:desktop`, the tree hash of the folder,
so a commit that only touches `web/` never triggers a rebuild. The junction is
only ever repointed while the app is not running: Windows locks a running
exe's files, so a build that finishes while bb2dash is open becomes current at
the next logon.

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
build command are pinned. The side-effecting script is kept thin on purpose:
each function does one thing and logs it.
