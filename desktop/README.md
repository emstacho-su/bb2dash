# bb2dash desktop shell

A thin Electron window around the deployed bb2dash web app, plus the two jobs a
browser tab cannot do: raise a Windows toast when something happens, and open a
terminal that runs a Blackboard sync.

The web app is still the product. Nothing under `web/` changes for this to work,
and nothing in here renders any of the UI — it loads `appUrl` and gets out of the
way.

Windows 11 only. Unpacked build, no installer, no code signing, no auto-update
(Phase 12 contract, C-10).

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
  "repoDir": "C:\\Users\\estac\\projects\\bb2dash",
  "pollIntervalMinutes": 15,
  "dueReminderTime": "18:00"
}
```

| key | default | meaning |
|---|---|---|
| `appUrl` | the Vercel deployment above | the deployed web app; one of the only two origins the window may navigate to |
| `supabaseUrl` | the project URL above | PostgREST and Storage; the second allowed origin |
| `supabaseAnonKey` | **required** | the project's legacy anon JWT — the same value `web/` already ships in its browser bundle |
| `repoDir` | `C:\Users\estac\projects\bb2dash` | working directory for the Sync terminal: the `main` checkout, where `/bb-sync` runs |
| `pollIntervalMinutes` | `15` | how often the notification poller ticks while the app runs |
| `dueReminderTime` | `18:00` | New York wall-clock time the once-a-day "due tomorrow" check runs |
| `syncDryRun` | `false` | when true the Sync terminal prints the command instead of running it |

**Secrets.** The anon key is the only credential in this package, and it is not a
secret: it is public in the web bundle already, and row-level security is the
boundary. A `service_role` or `sb_secret` key must never appear here —
`test/unit/audit.test.ts` greps `src/` and `test/` for both on every run. The
key belongs in `config.json` on the machine, never in the repository.

**Environment overrides.** Every key can be overridden by an environment
variable (`BB2DASH_APP_URL`, `BB2DASH_SUPABASE_ANON_KEY`, `BB2DASH_REPO_DIR`,
`BB2DASH_POLL_INTERVAL_MINUTES`, `BB2DASH_DUE_REMINDER_TIME`,
`BB2DASH_SYNC_DRY_RUN`, `BB2DASH_SUPABASE_URL`). The e2e suite uses them to point
the shell at a local fixture page so no test ever reaches `*.supabase.co`.

## Build, test, pack

```powershell
cd desktop

npm run build      # tsc -> dist/{core,main,preload}
npm run typecheck  # tsc --noEmit over src + test + playwright.config.ts
npm test           # vitest, test/unit
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

* **Closing the window hides it.** The app keeps running in the tray and keeps
  polling. The tray menu is **Open bb2dash / Check now / Quit**; left-clicking
  the tray icon shows the window. **Quit** is the only thing that ends the
  process.
* **One instance.** Launching a second time shows and focuses the window that is
  already open; there is never a second taskbar button.
* **Signing in** happens on the web app's own `/login` page inside the window.
  The session cookie lives in the window's persistent partition, so it survives
  a restart. The shell reads that cookie to make its own database reads and
  never refreshes it — token rotation stays the web app's job.
* **Logs** are at `%APPDATA%\bb2dash\logs\main.log` (rolls at 512 KB, one
  previous generation kept). Every line is redacted first: no bearer token, anon
  key or cookie value is ever written. That is the first place to look when
  something does not happen.
* **Other state** in `%APPDATA%\bb2dash`: `window-state.json` (size and
  position), `notify-watermark.json` (what has already been notified about).
  Deleting them is safe; the app rebuilds both.
* **Links to anywhere else** — a signed file URL from Materials, an outside link
  in an announcement — open in the default browser, not in the window.

## Acceptance script

The six steps that say this phase is done, run from the unpacked build:

1. Double-click the shortcut: bb2dash opens in its own window with its own
   taskbar button, and you are still signed in.
2. Double-click it again: the same window is focused. No second window, no
   second process.
3. Close the window and reopen it from the tray: still signed in.
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
    preload/          exposes one frozen object and no IPC.
  test/
    unit/             vitest
    e2e/              Playwright for Electron
```
