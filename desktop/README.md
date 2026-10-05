# bb2dash desktop shell

A thin Electron window around the deployed bb2dash web app, plus the two jobs a
browser tab cannot do: raise a Windows toast when something happens, and open a
terminal that runs a Blackboard sync.

The web app is still the product. Nothing under `web/` changes for this to work,
and nothing in here renders any of the UI — it loads `appUrl` and gets out of the
way.

Windows 11 only. Unpacked build, no installer, no code signing, no auto-update
(Phase 12 contract, C-10). New builds come from the logon builder in
[`launch/`](launch/README.md), and the app swaps to one only when Stack presses
**Update now** (see *Updates* below).

## Prerequisites

| | version used to build and test this |
|---|---|
| Node | v24.13.0 |
| npm | 11.6.2 |
| Electron | **44.4.1**, pinned exactly in `package.json` |

Electron is pinned rather than ranged: a shell whose only job is to be stable
should not pick up a new Chromium on an `npm install`.

```powershell
cd desktop
npm ci          # not `npm install` — the lockfile is the build
```

## Configuration

`config.json` lives in the app's `userData` folder:

```
%APPDATA%\bb2dash\config.json
```

Every key except `supabaseAnonKey` has a default. A file that does not validate
stops the app with a dialog naming the offending field; the app never starts on a
half-understood config, because a wrong `appUrl` or `repoDir` points the window or
the terminal somewhere unintended.

```json
{
  "appUrl": "https://web-xi-ten-uy9xk6c6p0.vercel.app",
  "supabaseUrl": "https://goultdzqcavefcgnifdy.supabase.co",
  "supabaseAnonKey": "paste the project legacy anon JWT here",
  "repoDir": "C:\\Users\\stack\\projects\\bb2dash",
  "pollIntervalMinutes": 15,
  "dueReminderTime": "18:00"
}
```

| key | default | meaning |
|---|---|---|
| `appUrl` | the Vercel deployment above | the deployed web app; one of the only two origins the window may navigate to |
| `supabaseUrl` | the project URL above | PostgREST and Storage; the second allowed origin |
| `supabaseAnonKey` | **required** | the project's legacy anon JWT — the same value `web/` already ships in its browser bundle |
| `repoDir` | `<profile>\projects\bb2dash`, derived from the signed-in user's home folder (`C:\Users\stack\projects\bb2dash` on stack-laptop) | working directory for the Sync terminal: the `main` checkout, where `/bb-sync` runs |
| `pollIntervalMinutes` | `15` | how often the notification poller ticks while the app runs |
| `dueReminderTime` | `18:00` | New York wall-clock time the once-a-day "due tomorrow" check runs |
| `syncDryRun` | `false` | when true the Sync terminal prints the command instead of running it |
| `syncLauncher` | `terminal` | `terminal`: the Sync button opens Windows Terminal on `/bb-sync`. `queue-only`: the button only queues and the container's runner takes the request; no terminal opens, and when the runner raises "Blackboard login needed" the app opens `http://127.0.0.1:6080/vnc.html` once in the default browser, already unlocked (brief 100, task 18) |
| `novncPasswordFile` | `<profile>\.bb2dash-secrets\novnc_password` | the file the login page's noVNC password is read from under `queue-only`; a BOM, CR and LF are stripped, and the password goes only into the URL handed to the browser, never into the log. A missing or unreadable file opens the page without it |

**Secrets.** The anon key is the only credential in this package, and it is not a
secret: it is public in the web bundle already, and row-level security is the
boundary. A `service_role` or `sb_secret` key must never appear here —
`test/unit/audit.test.ts` greps `src/` and `test/` for both on every run. The
key belongs in `config.json` on the machine, never in the repository.

**Environment overrides.** Every key can be overridden by an environment
variable (`BB2DASH_APP_URL`, `BB2DASH_SUPABASE_ANON_KEY`, `BB2DASH_REPO_DIR`,
`BB2DASH_POLL_INTERVAL_MINUTES`, `BB2DASH_DUE_REMINDER_TIME`,
`BB2DASH_SYNC_DRY_RUN`, `BB2DASH_SUPABASE_URL`, `BB2DASH_SYNC_LAUNCHER`,
`BB2DASH_NOVNC_PASSWORD_FILE`). The e2e suite uses them to point
the shell at a local fixture page so no test ever reaches `*.supabase.co`.

## Build, test, pack

```powershell
cd desktop

npm run build      # tsc -> dist/{core,main,preload}
npm run typecheck  # tsc --noEmit over src + test + playwright.config.ts
npm test           # vitest over test/unit, with coverage thresholds enforced
npm run test:e2e   # builds, then Playwright-for-Electron over test/e2e
npm start          # builds, then runs the shell from source
npm run pack       # builds, then electron-builder --dir
```

`npm run pack` produces:

```
desktop\dist\win-unpacked\bb2dash.exe
```

That folder is the whole app. It can be copied anywhere; the config and all
state live in `%APPDATA%\bb2dash`, not next to the executable.

`npm run icons` regenerates `build/icon.ico` and `build/tray-16.png` from
`build/icon.png`. The outputs are committed, so a normal build never runs it.

## Shortcuts

```powershell
cd desktop
.\scripts\make-shortcut.ps1 -WhatIf    # see what it would write
.\scripts\make-shortcut.ps1            # write them
```

It writes two shortcuts to the packed executable:

* `Desktop\bb2dash.lnk` — the double-click.
* `Start Menu\Programs\bb2dash.lnk` — the same target, **plus the shell property
  `System.AppUserModel.ID = su.stack.bb2dash`**.

That property is not decoration. Electron's notification documentation is
explicit: *"for notifications on Windows, your Electron app needs to have a Start
Menu shortcut with an AppUserModelID"*. An installer would write it; this build
has no installer. Without a Start Menu shortcut carrying an ID that matches the
`app.setAppUserModelId('su.stack.bb2dash')` call in the main process, Windows
drops every toast silently — no error, no notification, nothing in the log.
If toasts never arrive, this shortcut is the first thing to check.

No `ToastActivatorCLSID` is set: that is only needed for toast *action buttons*,
and this MVP's toasts are click-only.

Both shortcuts point at wherever the executable was when the script ran. Re-run
it after moving or re-packing the build.

## First launch: SmartScreen

The executable is unsigned on purpose (no code signing in this phase), so
Windows may show:

> **Windows protected your PC**
> Microsoft Defender SmartScreen prevented an unrecognised app from starting.

Click **More info**, then **Run anyway**. Windows remembers the decision for
that file; it comes back if the executable is rebuilt or moved.

SmartScreen's reputation check is triggered by the "mark of the web" that
Windows attaches to downloaded files. A build produced locally by
`npm run pack` usually carries no such mark and starts without any prompt; the
warning is expected if the `win-unpacked` folder is ever zipped, copied off the
machine and brought back.

## Living with it

* **Closing the window closes it for real** (2026-09-30). The web app's renderer
  process goes away; the main process, the tray and the poller keep running, so
  toasts still arrive. The tray menu is **Open bb2dash / Check now / Quit**;
  left-clicking the tray icon or choosing *Open* builds a fresh window, and
  clicking a toast builds one straight at the toast's screen. **Quit** is the
  only thing that ends the process.
  Measured on the packed build (signed-out page, so the renderer is on the small
  side), two open/close cycles each:
  * with GPU acceleration on (first cut): open 4 processes, 434-660 MB working
    set; closed 3 processes, 295-313 MB (main ~110, GPU ~130, utility ~57).
  * with GPU acceleration **off** (Stack, 2026-09-30; `app.disableHardwareAcceleration()`
    in `src/main/index.ts`): open 4 processes, 355-364 MB working set / ~118 MB
    private; closed 3 processes, 258-259 MB / ~81 MB private (main ~103, GPU
    ~100, utility ~56). Chromium still runs a GPU process for software
    compositing, but its private memory drops sharply.
* **The session stays fresh with the window closed.** When the web session has
  expired and no window is open, the shell loads the app once in a hidden page
  for 20 seconds (at most every 10 minutes) so the web app's own proxy rewrites
  the cookie, then destroys the page. Main still never calls the auth API.
* **One instance.** Launching a second time shows and focuses the window that is
  already open, or builds one if it was closed; there is never a second taskbar
  button.
* **Signing in** happens on the web app's own `/login` page inside the window.
  The session cookie lives in the window's persistent partition, so it survives
  a restart. The shell reads that cookie to make its own database reads and
  never refreshes it — token rotation stays the web app's job.
* **Logs** are at `%APPDATA%\bb2dash\logs\main.log` (rolls at 512 KB, one
  previous generation kept). Every line is redacted first: no bearer token, anon
  key or cookie value is ever written. That is the first place to look when
  something does not happen.
* **Other state** in `%APPDATA%\bb2dash`: `window-state.json` (size and
  position), `notify-watermark.json` (what has already been notified about),
  `update-reminder.json` (the *Update later* time). Deleting them is safe; the
  app rebuilds all three.
* **Links to anywhere else** — a signed file URL from Materials, an outside link
  in an announcement — open in the default browser, not in the window.

## Updates

Only for the app as the logon builder installs it
(`%LOCALAPPDATA%\bb2dash-launch\current\bb2dash.exe`); a dev run or a
hand-packed build does none of this.

* **Builds without a logon.** At launch and every 6 hours
  (`BUILDER_INTERVAL_HOURS`) the app starts the `Bb2dash-LogonBuild` task, unless
  it is already running. The builder fetches, rebuilds only when `desktop/`
  changed, and never switches builds while the app is open.
* **The prompt.** The running build is the tree hash in the resolved path of the
  executable (`builds\<tree>\win-unpacked`). When the builder's `state.json`
  records a newer `lastBuiltSha` whose build is on disk, the next time a window
  opens a small bb2dash window appears over it: *A new version of bb2dash is
  ready* with **Update now** and **Update later**. *Update later* asks when to
  remind: **In 1 hour**, **In 4 hours** or **Tomorrow** (09:00 local). The
  choice is saved in `%APPDATA%\bb2dash\update-reminder.json`, and no prompt
  appears before then. Closing the prompt saves nothing; the next open asks
  again. It is never a native dialog, and under `BB2DASH_TEST=1` it is only
  recorded (`update-prompt` event).
* **Update now** runs `launch\update-now.ps1 -Detach` as a hidden child and
  waits up to 30 s for it to exit. That stage hands the helper off to a
  separate hidden PowerShell (`Start-Process`, so the helper outlives the app)
  and exits. The app quits only after the helper's `swap-pending` marker names
  the new build (20 s bound). If the hand-off fails or no marker appears, the
  app stays on its build and `main.log` says *Update now could not start the
  helper; staying on this build:* with the reason, for example
  *update-now.ps1 -Detach exited 6: no helper was started* or *the update
  helper did not start within 20000 ms*. The helper waits for every bb2dash
  process to exit, points `current` at the new build and starts `Bb2dash-App`.
  If the app does not exit within 60 s, the build is missing or the junction
  cannot be moved, the old build stays current and the app starts on it. Its
  log is `%LOCALAPPDATA%\bb2dash-launch\logs\update-now.log` (both stages); the
  app's side is in `main.log` under `[update]`.
* **Forcing an update.** Open the account menu (the person icon, top right) and
  click **Update desktop app**. It first checks Docker (`docker version`, 10 s
  bound); with Docker not running it answers at once *Update failed: Docker isn't
  running — start Docker Desktop and try again* and starts nothing. Otherwise it
  shows *Checking for updates…*, writes `force-request.json` so this builder run
  waits only 30 s for Docker (`APP_DOCKER_WAIT_SECONDS`; the logon run keeps its
  600 s), starts `Bb2dash-LogonBuild` (or joins the run already going) and waits
  for it: fetch 45 s + Docker wait 30 s + longest build 20 min + 2 min margin
  (`FORCE_UPDATE_TIMEOUT_MS`, about 23 minutes). A container build takes a few
  minutes, a no-change run a few seconds. If the wait runs out anyway, it says
  *Update failed: still building — it will offer the update when it finishes*:
  the build keeps going, and the usual prompt offers it at the next window open.
  Then:
  * a newer build is on disk: the app runs the same **Update now** path as the
    prompt (hand-off, helper swap, relaunch) and says *Updating — bb2dash will
    restart* only once the helper's marker has appeared. A failed hand-off or no
    marker answers *Update failed: the update could not start* and the app stays
    on its build;
  * nothing newer, and this run fetched `origin/main` and its `desktop/` tree is
    the running build: *Up to date*. It never says that when it could not look;
  * anything else: *Update failed: &lt;reason&gt;*. Docker not running while a
    build was needed (*Docker isn't running — start Docker Desktop and try
    again*), no fetch (*could not reach GitHub …*), the build failed, or the builder left no check of its own (an older installed builder;
    that goes away once a successful build refreshes the installed scripts).
    Details are in `logon-build.log` and `main.log`.

  What the builder could check is in `%LOCALAPPDATA%\bb2dash-launch\last-check.json`
  (`checkedAt`, `remoteTree`, `skip`: empty, `fetch-failed`, `ref-unresolved` or
  `docker-not-ready`), written at the end of every build step.

  The item appears only inside the desktop app; a normal browser never shows it.
  It reaches main through the preload's `requestUpdate()`, the one IPC call
  (`bb2dash:request-update`), which main answers only for the main window's top
  frame on the app origin. One request runs at a time; clicking again while one
  runs waits for the same answer. A dev run answers *Update failed: this copy is
  not an installed build*; under `BB2DASH_TEST=1` the request is only recorded
  (`update-request` event).

## Acceptance script

The six steps that say this phase is done, run from the unpacked build:

1. Double-click the shortcut: bb2dash opens in its own window with its own
   taskbar button, and you are still signed in.
2. Double-click it again: the same window is focused. No second window, no
   second process.
3. Close the window (the renderer process goes away) and reopen it from the
   tray: a new window, still signed in.
4. Trigger a sync: one "Sync landed with N changes" toast, with the right N.
5. Receive a "grade posted" and a "due tomorrow" toast naming the course and the
   item; clicking each raises the window on the right screen.
6. Press the Sync button in the app: Windows Terminal opens in the repo and runs
   `claude "/bb-sync <id>"`.

## Layout

```
desktop/
  build/              icon.png (source), icon.ico, tray-16.png
  scripts/
    make-icons.mjs    derives the .ico and the tray PNG from icon.png
    make-shortcut.ps1 Desktop + Start Menu shortcuts (see above)
  src/
    core/             plain Node: config, rest, session decoding, the poller's
                      pure parts, the sync-command argv builder. Imports nothing
                      from electron — a unit test enforces it, so this half can
                      move into a container later (R-28).
    main/             the Electron adapter: window, tray, cookies, notifications,
                      child_process, logging.
    preload/          exposes one frozen object: version, requestUpdate (one IPC call).
  test/
    unit/             vitest
    e2e/              Playwright for Electron
```
