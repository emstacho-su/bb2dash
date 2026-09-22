# W-25 verification — Phase 12 shell (C-1 to C-6, C-8, C-10, C-12, C-13)

Branch `feat/electron-12-shell`, worktree `bb2dash-wt-electron-12-shell`, cut from `cb718ca`.
Contract: `docs/planning/sprint-1-hub/briefs/80_PHASE12_electron.md`, as amended by Stack's answers Q1–Q9.

The stream was resumed after its first agent died mid-task 9. Everything below was re-run
by the second agent on 2026-09-16/17; nothing is carried over on trust, including the PM's
checkpoint commit `e06b50a` (reviewed, and its central claim independently re-proved — see
§1 C-8 and note 7).

**Commits** (`cb718ca..HEAD`, 49 files, 9008 insertions):

| | |
|---|---|
| `58079d3` | core config, session decode, PostgREST helper |
| `1d31f20` | window, single instance, AppUserModelID, navigation allowlist |
| `4052cbb` | web session from the partition, `safeStorage` helper |
| `079dce1` | the Sync button opens a terminal and runs the sync command |
| `0244a0b` | tray with Open / Check now / Quit, hide-to-tray on close |
| `1fb3c1b` | Playwright-for-Electron suite |
| `e06b50a` | PM checkpoint of the dead agent's packaging work |
| `c7f9850` | **fix**: the default `repoDir` was mangled by unescaped backslashes |
| `d0681d2` | `make-shortcut.ps1`, both shortcuts, toast AppUserModelID |
| `917f644` | `desktop/README.md` |
| `a9d81ce` | coverage provider + `fast-check` in the canonical package |

---

## 1. What was built, per clause

### C-13 portability split (R-28)

`src/core/` is plain Node. `test/unit/core-portability.test.ts` (6 tests) greps every file
under it for four shapes of `electron` import (ESM, `require`, bare, dynamic) and for any
`node:fs` import, and fails on a hit. Manual confirmation:

```
$ grep -rnE "from '(electron|node:child_process|node:fs)'|require\('electron'\)" desktop/src/core/
  none
```

| file | lines | what it is |
|---|---|---|
| `src/core/types.ts` | 123 | the PM-owned shared signatures |
| `src/core/config.ts` | 139 | C-2 schema, defaults, environment overrides |
| `src/core/session-decode.ts` | 161 | cookie strings in, `{ accessToken, expiresAt }` out |
| `src/core/rest.ts` | 136 | C-6's PostgREST GET, schema-validated, 10 s timeout |
| `src/core/sync-command.ts` | 108 | C-8's `{ repoDir, id, wtPath } -> argv` |
| `src/core/navigation-policy.ts` | 53 | C-4's allow / open-external / drop decision |
| `src/core/redact.ts` | 31 | log redaction (see note 8: W-26 has this path too) |

`src/main/` is the Electron adapter: `index.ts` 158, `window.ts` 163, `sync-terminal.ts` 141,
`config.ts` 88, `tray.ts` 81, `session.ts` 75, `log.ts` 66, `navigation.ts` 62, `test-hook.ts` 51,
`wt.ts` 51, `secret.ts` 44, `rest.ts` 28, `resources.ts` 18. `src/preload/index.ts` is 19.
Every file is well under the 400-line standard.

### C-1 package and layout

`bb2dash-desktop`, private, TypeScript, CommonJS. **Electron pinned to 44.4.1** (exact, no
range) — confirmed at runtime by the packed build's own log line, `bb2dash shell ready
(Electron 44.4.1)`. Scripts: `build`, `typecheck`, `start`, `test`, `test:watch`, `test:e2e`,
`pack`, `icons`. `electron-builder.yml`: `appId su.stack.bb2dash`, `productName bb2dash`,
win target `dir`, icon `build/icon.ico`, `asar: false`.

Files the C-1 tree does not list are noted at 7; files it lists that do not exist are the
withdrawn `src/main/mirror/` (Q7) and W-26's half of the tree.

### C-2 config

`%APPDATA%\bb2dash\config.json`, zod schema, defaults for every key but `supabaseAnonKey`,
`ConfigError` naming the first bad field, `dialog.showErrorBox` then quit. 16 tests in
`config.test.ts`. No file at all is not an error (every other key has a default and the anon
key may arrive through `BB2DASH_SUPABASE_ANON_KEY`, which is how the e2e suite runs).

`test/unit/audit.test.ts` (9 tests) greps all of `src/` and `test/` for `service_role` and
`sb_secret` on every run, and asserts that the only environment variables read are `BB2DASH_*`
plus `NODE_ENV`, `LOCALAPPDATA` and `PATH` (the last two locate `wt.exe`). No key of any kind
is committed; the README's example carries a placeholder.

`launchAtLogin` is absent (Q1) and `mirrorRoot` is absent (Q7). `pollIntervalMinutes` defaults
to 15 (Q3). See notes 1 and 2.

### C-3 process, window, single instance

`app.requestSingleInstanceLock()` is the first statement executed in `index.ts`;
`setAppUserModelId('su.stack.bb2dash')` runs before `ready`; `second-instance` shows and
focuses inside `setImmediate`. One `BrowserWindow`, created once and reused, with
`partition: 'persist:bb2dash'`, `nodeIntegration: false`, `contextIsolation: true`,
`sandbox: true`, `webSecurity: true`, `spellcheck: false` and a preload that exposes one
frozen object. Window state in `userData/window-state.json`, debounced 500 ms, restored only
when the saved rectangle still intersects a connected display.

Two e2e tests cover the flags: one reads the object the window was actually built with, the
other proves the renderer really has none of what those flags forbid. `preload.test.ts` (3
tests) asserts the preload surface is `{ version }` and frozen, with no IPC.

The clipboard half of C-3 is **not verified** — see §4.

### C-4 navigation allowlist

`core/navigation-policy.ts` is the pure decision (allow / open-external / drop);
`main/navigation.ts` attaches it to `will-navigate` and `setWindowOpenHandler` (which always
returns `{ action: 'deny' }`). 20 unit tests. Two e2e tests prove the live behaviour: an
outside link and a `window.open` both leave the window and reach `shell.openExternal`, and no
second window is created. No `will-download` handler exists.

### C-5 session

`core/session-decode.ts` joins the chunked `sb-goultdzqcavefcgnifdy-auth-token.0/.1/...`
cookies in order, strips `base64-`, decodes and returns `{ accessToken, expiresAt }` in
memory. 22 unit tests (chunked, single, gaps, malformed, expiry). `main/session.ts` reads
them from the partition. Main never writes a token and never refreshes: an expired token
returns `null` and the caller skips the tick.

e2e: the auth cookie survives a relaunch of the same user-data directory and carries an
`expirationDate`. `secret.ts` (`safeStorage`) is written and unit-tested (5 tests) although
the MVP does not depend on it, per C-5.

`core/redact.ts` + `main/log.ts` are the belt to that braces: every log line is redacted for
bearer tokens, JWTs, `base64-` cookie values, `sb-*-auth-token=` and `?apikey=` before it is
written. 7 unit tests. The rolling file is `userData/logs/main.log`, 512 KB, one generation.

### C-6 PostgREST reads

`core/rest.ts`: `GET ${supabaseUrl}/rest/v1/<relation>?<query>`, `apikey` + `Authorization:
Bearer`, 10 s `AbortController` timeout, typed error on non-2xx, once-per-relation-per-hour
logging, every row set schema-validated by a caller-supplied validator. 12 unit tests with a
stubbed `fetch`; **no test touches `*.supabase.co`**. R4 is issued by the sync watcher; R1–R3
are W-26's callers.

### C-8 (amended) Sync button

`webRequest.onCompleted` on the partition, filtered to the renderer's own
`POST /rest/v1/agent_requests*` with a 2xx status, reads R4 back and builds the argv. The id
comes off the PostgREST row this process read, is checked against `^\d{1,12}$` before a single
argv element exists, and reaches `spawn` as an array element — never a shell string.

```
<wt> -d <repoDir> --title "bb-sync <id>" powershell.exe -NoExit -NoLogo -ExecutionPolicy Bypass -Command "claude '/bb-sync <id>'"
```

26 unit tests in `sync-command.test.ts` (argv shape, the PowerShell fallback, PowerShell
single-quote escaping for a repo path containing an apostrophe, a frozen return, the dry-run
variant, and id rejection for `''`, `'nope'`, `'1.5'`, `'-1'`, 13 digits, and injection
attempts). Two e2e tests: the terminal is recorded once for a request, and not a second time
for the same id.

**`wt.exe` resolution, re-proved on this machine** (the checkpoint's claim, independently
re-run against the compiled output):

```
resolveWtPath()          -> C:\Users\estac\AppData\Local\Microsoft\WindowsApps\wt.exe
fs.existsSync(that path) -> false
```

`%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe` is a Store **execution alias**, a reparse point
whose `stat` fails, so `existsSync` answers `false` for a file Windows runs happily.
`accessSync(F_OK)` answers `true`. Had the lookup used `existsSync`, every sync would have
fallen back to a bare PowerShell window. 9 tests in `wt.test.ts`.

### C-12 tray

`Tray` with the 16 px image derived from `build/icon.png`, tooltip `bb2dash`, left-click shows
and focuses, menu **Open bb2dash / Check now / Quit**. Closing the window calls
`preventDefault()` and `win.hide()`; only `Quit` (or `before-quit`) sets `isQuitting` and lets
the close through. Two e2e tests: the menu labels, and close → the process is still alive with
`BrowserWindow.getAllWindows()[0].isVisible() === false`. A third fires *Check now* through the
test hook and asserts exactly one recorded tick with `source: 'tray'`.

The packed build's own log on a clean profile:

```
config loaded from ...\clean-profile\config.json (appUrl https://web-xi-ten-uy9xk6c6p0.vercel.app, poll 15m)
sync watcher attached to https://goultdzqcavefcgnifdy.supabase.co/rest/v1/agent_requests*
tray created (Open bb2dash / Check now / Quit)
bb2dash shell ready (Electron 44.4.1); tray "Check now" runs one tick
```

### C-10 build, test, pack, shortcut, README

`npm run pack` → `desktop\dist\win-unpacked\bb2dash.exe` (246 MB, `asar: false` so the build
is inspectable and the tray reads `build/tray-16.png` off disk). `scripts/make-shortcut.ps1`
and `desktop/README.md` are described under §3 and §5.

---

## 2. Test output

Node v24.13.0, npm 11.6.2, on Windows 11 Home 26200.

### `npm run typecheck`

```
> tsc -p tsconfig.test.json --noEmit
```

No output, exit 0. The project config covers `src/**`, `test/**` and `playwright.config.ts`
under `strict` + `noUncheckedIndexedAccess` + `noImplicitOverride`.

### `npm test` (vitest)

```
 Test Files  11 passed (11)
      Tests  135 passed (135)
   Duration  921ms
```

| file | tests |
|---|---|
| `sync-command.test.ts` | 26 |
| `session-decode.test.ts` | 22 |
| `navigation-policy.test.ts` | 20 |
| `config.test.ts` | 16 |
| `rest.test.ts` | 12 |
| `audit.test.ts` | 9 |
| `wt.test.ts` | 9 |
| `redact.test.ts` | 7 |
| `core-portability.test.ts` | 6 |
| `secret.test.ts` | 5 |
| `preload.test.ts` | 3 |
| **total** | **135** |

Coverage of `src/core/**` (`vitest run --coverage`, v8):

```
Statements   : 96.48% ( 192/199 )
Branches     : 90.08% ( 109/121 )
Functions    : 97.87% ( 46/47 )
Lines        : 97.63% ( 165/169 )
```

Per file: `config.ts` 100 % / 88.9 % br, `navigation-policy.ts` 100 %, `redact.ts` 100 %,
`rest.ts` 98.0 % / 85.2 % br, `session-decode.ts` 91.4 % / 89.4 % br, `sync-command.ts` 100 %,
`types.ts` 100 %. (The text reporter hides the files at 100 %; the figures above come from the
json-summary reporter.)

### `npm run test:e2e` (Playwright for Electron)

```
Running 13 tests using 1 worker

  ok  1 opens one window, on the configured app URL (101ms)
  ok  2 locks down webPreferences (23ms)
  ok  3 and the renderer really has none of what those flags forbid (11ms)
  ok  4 exposes the frozen preload object and no IPC (9ms)
  ok  5 has a tray with Open / Check now / Quit (7ms)
  ok  6 creates no second window: window.open goes to the default browser (87ms)
  ok  7 opens the sync terminal when the app files a request (175ms)
  ok  8 opens no second terminal for the same request (542ms)
  ok  9 runs one poller tick from the tray (10ms)
  ok 10 keeps an outside link out of the window and hands it to the browser (138ms)
  ok 11 hides to the tray on close, and the process stays alive (32ms)
  ok 12 the auth cookie survives a relaunch, carrying its expirationDate (680ms)
  ok 13 a second launch quits and leaves the first window alone (1.2s)

  13 passed (5.6s)
```

The suite runs against a local static fixture served on `127.0.0.1`, pointed at through
`BB2DASH_APP_URL` / `BB2DASH_SUPABASE_URL`. No test resolves `*.supabase.co`.

### `npm run pack`

`dist/win-unpacked` was deleted first, so this is a cold pack.

```
  • electron-builder  version=26.15.3 os=10.0.26200
  • packaging       platform=win32 arch=x64 electron=44.4.1 appOutDir=dist\win-unpacked
  • signing with signtool.exe  path=dist\win-unpacked\bb2dash.exe

-rwxr-xr-x 246324736  dist/win-unpacked/bb2dash.exe
dist/win-unpacked/resources/app/build/  ->  icon.ico, tray-16.png
```

("signing with signtool.exe" is electron-builder writing the resource section; there is no
certificate and the binary is unsigned, per C-10.)

### DoD greps — absent by inspection

```
$ grep -rn "shell.openPath"                 desktop/src/      -> none
$ grep -rn "will-download"                  desktop/src/      -> none
$ grep -rnE "autoUpdater|electron-updater"  desktop/src/ package.json electron-builder.yml -> none
$ grep -rn "setLoginItemSettings"           desktop/ (no node_modules, no dist) -> none
$ grep -rni "mirror"                        desktop/src/ desktop/test/ desktop/scripts/ -> none
$ grep -rnE "from 'electron'|require\('electron'\)" desktop/src/core/ -> none
$ git diff --stat origin/main -- web/       -> empty
```

The same six exclusions plus `nodeIntegration: true`, `@electron/remote` and a Blackboard
crawl are asserted as tests in `audit.test.ts`, so they cannot silently return later.

---

## 3. The packed build, run by hand

### Clean-profile smoke — what was and was not verified

A new Windows user profile cannot be created from this session, so the closest honest thing
was done: the packed executable was launched twice against a **fresh, empty `--user-data-dir`**
under the scratchpad, with the whole directory deleted before each run.

**Verified:**

* The packed `bb2dash.exe` starts from a userData directory that did not exist a second
  earlier, with no `config.json` on disk (the anon key came from `BB2DASH_SUPABASE_ANON_KEY`).
* It loaded the real deployed app: `MainWindowTitle` read back from the live process as
  `Sign in · bb2dash` — i.e. a clean profile has no session and lands on `/login`, which is
  correct.
* Window geometry `128,32 .. 1408,832` = exactly the 1280×800 default of C-3, on a
  1536×864 work area.
* The tray was created, logged as `tray created (Open bb2dash / Check now / Quit)`.
* The log file was written at `<userData>\logs\main.log` and contains no token, key or
  cookie value.
* `<userData>\Partitions\bb2dash\` was created — the persistent partition C-5 depends on.
* Both runs were stopped by pid and `Get-Process -Name bb2dash` afterwards returned nothing.
  No Electron or bb2dash process was left running.
* `desktop/docs/packed-window-chrome.png` is that run: the packed window's own title bar and
  the deployed login page. `desktop/docs/packed-window.png` (from the first agent, reviewed
  and kept) is the same page at renderer resolution.

**Not verified:**

* A genuinely new Windows user profile: registry state, per-user notification settings and a
  first-run Start Menu were all this profile's existing ones.
* **SmartScreen was never shown, so there is no SmartScreen screenshot.** This is a finding,
  not an omission: SmartScreen's reputation check fires on the mark-of-the-web that Windows
  attaches to *downloaded* files. A build produced locally by `npm run pack` carries no such
  mark, and it started with no prompt on both runs. The warning is expected only if the
  `win-unpacked` folder is zipped, moved off the machine and brought back — which is exactly
  what the README says. Fabricating the screenshot was not an option.
* Toasts: no toast code is on this branch (`notify.ts` is W-26's), so the AppUserModelID
  half of the pair could not be proved end to end here. See note 5.
* The taskbar on this machine is auto-hidden (`Screen.WorkingArea` equals `Screen.Bounds`,
  with `Shell_TrayWnd` parked at y=816 of an 864-pixel screen), so no screenshot of the
  taskbar button or the tray icon could be taken without simulating input on Stack's desktop.
  The tray's existence is proved by the log line and by the e2e tests instead.

### Shortcut script

`desktop/scripts/make-shortcut.ps1`, 317 lines, `[CmdletBinding(SupportsShouldProcess)]`.

It was proved **without touching Stack's Desktop or Start Menu**: `-WhatIf` for the dry run,
and then a real run redirected with `-DesktopDir` / `-StartMenuDir` into a temp folder.

```
$ .\make-shortcut.ps1 -WhatIf
What if: Performing the operation "write Desktop shortcut (System.AppUserModel.ID = su.stack.bb2dash)"
         on target "C:\Users\estac\OneDrive\Desktop\bb2dash.lnk".
What if: Performing the operation "write Start Menu shortcut (System.AppUserModel.ID = su.stack.bb2dash)"
         on target "C:\Users\estac\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\bb2dash.lnk".

$ .\make-shortcut.ps1 -DesktopDir <tmp>\Desktop -StartMenuDir <tmp>\StartMenu
wrote Desktop    <tmp>\Desktop\bb2dash.lnk    (AppUserModelID = su.stack.bb2dash)
wrote Start Menu <tmp>\StartMenu\bb2dash.lnk  (AppUserModelID = su.stack.bb2dash)

read back:
  TargetPath       = ...\desktop\dist\win-unpacked\bb2dash.exe
  WorkingDirectory = ...\desktop\dist\win-unpacked
  IconLocation     = ...\bb2dash.exe,0
  AppUserModelID   = su.stack.bb2dash

$ .\make-shortcut.ps1 -ExePath C:\nope\bb2dash.exe
threw: No executable at C:\nope\bb2dash.exe.
```

**The AppUserModelID finding (C-10 asked for one).** Electron's notification documentation is
explicit: *"for notifications on Windows, your Electron app needs to have a Start Menu shortcut
with an AppUserModelID."* An installer (Squirrel/NSIS) writes it; this phase has no installer,
so the script must. `app.setAppUserModelId('su.stack.bb2dash')` in the main process is only
half the pair, and the missing half fails **silently** — no exception, no toast, nothing in the
log. The property is therefore written unconditionally rather than "if the smoke shows toasts
need it", because the smoke cannot show it (note 5). No `ToastActivatorCLSID` is set: that is
only needed for toast action buttons, and Q6 made these click-only.

Two implementation facts worth keeping:

* `WScript.Shell` can write a `.lnk` but cannot reach its property store, so the shortcut goes
  through `IShellLink` + `IPropertyStore` (`PKEY_AppUserModel_ID` =
  `{9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3}`, pid 5) via one `Add-Type` block.
* `InitPropVariantFromString` is an **inline helper in `propvarutil.h`, not an export of
  `propsys.dll`** — the first attempt died with `Unable to find an entry point named
  'InitPropVariantFromString'`. The PROPVARIANT is now built by hand as `VT_LPWSTR` plus a
  `CoTaskMem` string and freed with `PropVariantClear`.
* The file is pure ASCII: PowerShell 5.1 reads a BOM-less `.ps1` as ANSI, which turned an em
  dash in the shortcut description into mojibake on the first real run.

---

## 4. Notes for the PM (numbered)

**1. `repoDir`'s default was a mangled string, and is now fixed (`c7f9850`).**
`src/core/config.ts` had `repoDir: 'C:\Users\estac\projects\bb2dash'` — a JavaScript string
literal, so `\U`, `\e` and `\p` dropped their backslashes and `\b` compiled to a **backspace
character**. The shipped default was `C:Usersestacprojects\x08b2dash`. Any run without an
explicit `repoDir` in `config.json` would have spawned the sync terminal in a folder that
cannot exist. The existing test compared the parsed value to the same constant, so it agreed
with the mistake; the replacement spells C-2's table out character for character and asserts
the path contains no control characters. No Contract change — this only makes the shipped
value match C-2. Flagged because it is the kind of thing worth knowing happened.

**2. `syncDryRun` is a seventh config key that C-2's table does not list.**
`false` by default; when true the terminal opens in the same directory with the same title and
prints the command instead of running it. It exists so the terminal can be demonstrated
without starting a real Blackboard sync. **PM decision:** keep it (and add the row to C-2), or
strike it.

**3. The sync-terminal dedupe is an in-memory `Set`, not `firedKeys` on the watermark file.**
C-8 says "if the newest queued sync row's id is not in `firedKeys` under `syncterm:<id>`".
The implementation keys off an in-process `Set<string>`, with this reasoning: the watcher only
ever acts because *this* process observed the `POST`, so a restart cannot re-observe a POST
that happened before it started, and an in-memory set is the whole dedupe surface. Keeping
`syncterm:` keys out of `notify-watermark.json` also keeps that file wholly W-26's.
**PM decision:** accept, or move it onto the shared watermark.

**4. Files exist under `src/main/` and `src/core/` that C-1's tree does not list.**
C-1's tree predates C-13, which mandated the `core/` split, so `src/core/*` is all new.
Beyond that: `main/wt.ts` (note 7), `main/log.ts` and `core/redact.ts` (C-10's logging
requirement, which C-1 gave no file), `main/resources.ts` (18 lines: find `build/` in a dev run
and in the packed build alike), `main/tray.ts` (C-12, added after C-1 was written) and
`main/test-hook.ts` (C-10's `globalThis.__bb2dashTest`). `src/main/mirror/` does not exist (Q7).
**PM decision:** none needed unless C-1's tree is meant to be exhaustive.

**5. The Desktop shortcut also carries the AppUserModelID, and the "if toasts need it"
condition could not be evaluated.** C-10 makes the Start Menu property conditional on the
clean-profile smoke showing it is needed. The smoke cannot show it: `notify.ts` is W-26's and
no toast code is on this branch, so there was nothing to fire. The property is written
unconditionally, on both shortcuts, because the documented requirement is unambiguous, the
failure mode is silent, and the cost is zero. Setting it on the Desktop copy as well keeps the
taskbar button grouped under one identity whichever shortcut was used. **PM decision:** accept,
or drop it from the Desktop copy.

**6. The packed app shows Electron's default application menu** (File / Edit / View / Window,
including Reload and Toggle Developer Tools). The Contract says nothing about a menu, so
nothing was set either way. Arguments both ways: Reload is genuinely useful after a Vercel
deploy; a "an app, not a tab" shell arguably wants `Menu.setApplicationMenu(null)`.
**PM decision.** It is a one-line change in `index.ts` either way.

**7. `src/main/wt.ts` is a file of its own, and it uses `accessSync`, not `existsSync`.**
Re-proved this session: `%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe` is a Store execution
alias whose `stat` fails, so `existsSync` returns **false** for it while `accessSync(F_OK)`
returns true. With `existsSync`, Windows Terminal would never be found and every sync would
open a bare PowerShell window. The lookup is its own file so the unit suite can drive it
without mocking Electron. This is the substance of checkpoint `e06b50a`, and it is correct.
One caveat: the last test in `wt.test.ts` ("sees the wt.exe execution alias that fs.existsSync
cannot") computes its expectation with the same `accessSync` call it is testing, so it is a
tautology — harmless, but it proves nothing. The real proof is the transcript above.
**PM decision:** none needed; recorded so the reviewer does not credit that test.

**8. `src/core/redact.ts` and `test/unit/redact.test.ts` exist on both worker branches with
different APIs.** Mine is `redact(line: string): string`, 31 lines, used by `main/log.ts`.
W-26's is 72 lines and exports `Logger`, `createRedactingLogger` and `describeError`, used
throughout `poller/*`. They are not the same module and cannot be taken one over the other.
**Integrator:** W-26's is the superset — take it, and have `main/log.ts` call its
line-level redactor (or keep both, one wrapping the other).

**9. The two test hooks collide at runtime, not just in git.** Mine installs
`globalThis.__bb2dashTest` with `Object.defineProperty(..., { configurable: false, writable:
false })` and a `recorded()` that returns `readonly RecordedEvent[]` (an array of
`{ kind, at, payload }`). W-26's merges into whatever object is already there and wraps an
existing `recorded()` with `{ ...previousRecorded(), toasts, navigations }` — which needs
`recorded()` to return a **record, not an array**, and needs the property to be writable.
Whichever installs second either throws or produces `{0: …, 1: …, toasts, navigations}`.
This is a real integration bug and it is left unresolved on purpose; the shape it should
merge to is in §5.

**10. `npm test` here is `vitest run`; W-26's stopgap makes it `vitest run --coverage`.**
`@vitest/coverage-v8@5.0.1` and `fast-check@4.10.1` were added to this (canonical) package so
either script works and W-26's unit suite runs without an install during the merge
(`a9d81ce`). Note that W-26 pinned vitest 5.0.0 and `@types/node` 22.20.2; this package has
vitest 5.0.1 and `@types/node` 24.9.2. **PM/integrator:** the canonical package's versions win.

---

## 5. Integration map for whoever merges W-25 and W-26

### Files this branch owns that `feat/electron-12-notify` also carries

From `git diff --stat cb718ca..origin/feat/electron-12-notify`:

| path | how they differ | take |
|---|---|---|
| `desktop/package.json` | W-26's is a self-described stopgap ("this file is W-25's to own") | **W-25's** — its devDependencies already include W-26's additions |
| `desktop/package-lock.json` | different trees | **W-25's**, then `npm ci` |
| `desktop/tsconfig.json` | W-25's is the build config (`rootDir: src`, emits to `dist`); W-26 split build into `tsconfig.build.json` and made `tsconfig.json` the typecheck config | **W-25's** `tsconfig.json` + `tsconfig.test.json`; drop `tsconfig.build.json`, or keep it and repoint `build` |
| `desktop/vitest.config.mts` | W-26's adds coverage thresholds and more include paths | **merge** — keep W-25's `include: test/unit/**`, take W-26's coverage settings |
| `desktop/playwright.config.ts` | near-identical; both single-worker | either; keep one |
| `desktop/.gitignore` | same four entries | either |
| `desktop/src/core/redact.ts` | different APIs — note 8 | **W-26's** superset |
| `desktop/test/unit/redact.test.ts` | tests the respective API | **W-26's**, once its `redact.ts` is taken |
| `desktop/src/main/test-hook.ts` | different install strategies — note 9 | **merge**, see below |
| `desktop/test/unit/core-portability.test.ts` | W-25's 51 lines / 6 tests, W-26's 111 | **merge**: W-26's strips comments before grepping and also re-runs the credential audit, which is better; W-25's additionally forbids `node:fs` under `core/`, which C-13 requires and W-26's does not check. W-26's asserts `poller/reducer.ts` is present, so it only passes after the merge. |

Everything else is disjoint: W-25 owns `config`, `session`, `rest`, `secret`, `navigation`,
`window`, `tray`, `wt`, `sync-terminal`, `log`, `resources`, `index`, `preload`, the
`electron-builder.yml`, `build/`, `scripts/`, `README.md` and `test/e2e/shell.spec.ts` +
`launch.ts` + `fixture-server.ts`. W-26 owns `core/poller/*`, `core/route.ts`, `notify.ts`,
`deeplink.ts`, `poller-wiring.ts` and their tests.

### How `index.ts` expects the poller to be wired

`index.ts` currently exposes three seams and calls none of W-26's code:

```ts
export function registerPoller(run: () => Promise<void>): void   // sets the module-level runner
export async function runPollerTick(source: string): Promise<void>  // tray + test hook call this
export function getMainWindow(): BrowserWindow | null
export function getConfig(): DesktopConfig | null
```

`start()` does, in order: `loadConfig()` → `createWindow(config.appUrl)` →
`attachNavigationGuards(window, allowedOrigins(config))` → `hideOnClose(window)` →
`attachSyncWatcher({ config, restGet: createMainRest(config) })` → `createTray({ window,
showWindow, onCheckNow: () => void runPollerTick('tray'), onQuit: quit })` →
`installTestHook({ tick, clickTrayItem })`.

**The signatures do not line up.** W-26's `main/poller-wiring.ts` exports
`startPoller(deps): PollerHandle` and declares `RegisterPoller = (handle: PollerHandle) => void`,
whereas `registerPoller` here takes a bare `() => Promise<void>`. The wiring the integrator
should write, inside `start()`, immediately after `attachSyncWatcher(...)` and **before**
`createTray(...)`:

```ts
const poller = startPoller({
  userDataDir: app.getPath('userData'),
  appUrl: config.appUrl,
  config,                                   // W-26's PollerConfig; build it from DesktopConfig
  getSession: () => readWebSession({ appUrl: config.appUrl, supabaseUrl: config.supabaseUrl }),
  createRest: () => createMainRest(config), // note the arity difference, below
  getWindow: getMainWindow,
  log,                                      // main/log.ts, once note 8 is settled
});
```

then

* tray: `onCheckNow: () => void poller.runOnce()` — replacing `runPollerTick('tray')`;
* quit: call `poller.stop()` from the `before-quit` handler;
* delete `registerPoller` and `runPollerTick`, or keep `runPollerTick` as the
  never-throwing wrapper around `poller.runOnce()` so the `poller-tick` event the e2e suite
  asserts is still recorded.

Two mismatches to fix while doing it:

* **`createRest` arity.** W-26 wants `(session: WebSession) => RestGet`. `createMainRest(config)`
  takes no session: it builds its own `getAccessToken` that reads the partition cookies itself
  (`main/rest.ts` → `main/session.ts`). Either ignore the argument
  (`createRest: () => createMainRest(config)`, which double-reads the cookie per tick but is
  correct), or add an overload to `core/rest.ts` that accepts a fixed token. The second is
  cleaner and is a five-line change in a file W-25 owns.
* **`poller-wiring.ts` installs its own window-focus listener** via `attachWindow`. The
  window is created once and reused (C-12), so `getWindow()` at `startPoller` time is enough
  and `attachWindow` never needs calling again.

### How the two test hooks should merge

One `main/test-hook.ts`, W-26's merging strategy, W-25's event log kept, and `recorded()`
returning a **record**:

```ts
globalThis.__bb2dashTest = {
  recorded: () => ({ events, toasts, navigations }),  // W-25's array under a key
  tick: (fixture) => poller.runWithRows(fixture),     // W-26's — the name is theirs
  clickTrayItem: (label) => trayHandle.click(label),  // W-25's
  clickToast: (key) => deeplink.navigate(...),        // W-26's
  resetNotifications: () => recorder.reset(),         // W-26's
};
```

Required changes:

* Drop `Object.defineProperty(..., { configurable: false, writable: false })` in favour of
  W-26's "create the object if absent, then assign keys" — otherwise the second installer
  throws.
* W-25's `recorded()` must return `{ events: RecordedEvent[] }` rather than the bare array,
  so W-26's `{ ...previousRecorded(), ... }` spread is meaningful. `test/e2e/launch.ts`'s
  `recorded(app)` helper then reads `.events`. That is **one line**: all eleven call sites in
  `shell.spec.ts` go through the helper, and the one test that reaches
  `globalThis.__bb2dashTest` directly uses `clickTrayItem`, not `recorded`.
* W-25's `tick()` (no argument, the tray's *Check now*) must give up the name `tick` to
  W-26's `tick(fixture)`. The tray path is already reachable as
  `clickTrayItem('Check now')`, which is what `shell.spec.ts` actually uses, so nothing in
  W-25's suite breaks.
* Keep one recorder per process. W-25's is a module-level array reached through
  `recordEvent(kind, payload)`; W-26's is a `createRecorder()` instance passed into
  `createNotifier` and `createDeeplink`. Both can live side by side; only `recorded()` joins
  them.

---

## 6. What Stack must verify by hand

Nothing below could be proved from this session, and none of it is a defect — each needs a
signed-in session, a real Blackboard sync, or a Windows notification.

1. **The six-step acceptance script** (`80_PHASE12_electron.md`, Definition of done), on the
   unpacked build, after running `scripts/make-shortcut.ps1` himself. Steps 4 and 5 (the three
   toasts) also depend on W-26's half being merged in.
2. **That toasts arrive at all**, which is the real test of the AppUserModelID shortcut
   (note 5). If they do not, the Start Menu `.lnk` is the first suspect: sign out and in, or
   restart Explorer, so the Start Menu index picks the new entry up.
3. **The Sync button's clipboard write inside the shell** (C-3 asks W-25 to confirm it "still
   copies inside the shell"). It needs a signed-in session and a real press; the app's own
   toast shows the command regardless, so it is best-effort either way.
4. **That `wt.exe` actually opens and runs `claude "/bb-sync <id>"`** end to end. The argv is
   unit- and e2e-tested and `wt.exe` resolves correctly on this machine, but no real terminal
   was spawned from this session — a real spawn would file and run a live sync.
   `BB2DASH_SYNC_DRY_RUN=1` opens the same terminal and prints the command instead, which is
   the safe way to see it (note 2).
5. **SmartScreen**, if he ever moves the `win-unpacked` folder off the machine and back.
   It did not appear for a locally built binary.
