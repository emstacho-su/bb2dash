# Phase 12 integration verification — W-25 + W-26 on `feat/electron-12`

Worktree `bb2dash-wt-electron-12`, branch `feat/electron-12`.
Merge commit `28ca5a8` (parents `96eb37f` = W-26 + brief fix, `f94a528` = W-25 shell).

The two workers built against the same frozen Contract but from separate branches, so ten
paths existed on both. §1 is each conflict and how it went; §2 is the numbers; §3 is what
changed on either side's behaviour as a result; §4 is what only Stack can settle.

---

## 1. Conflicts and resolutions

`git merge --no-ff origin/feat/electron-12-shell` produced ten add/add conflicts, exactly the
set predicted in `80a_W25_VERIFICATION.md` §5.

| path | resolution |
|---|---|
| `desktop/package.json` | **W-25's.** W-26's described itself as a stopgap ("this file is W-25's to own"); its devDependencies were already merged into W-25's before the merge. `test` now runs with `--coverage`. |
| `desktop/package-lock.json` | **W-25's**, then `npm ci`. |
| `desktop/tsconfig.json` | **W-25's** (the build config: `rootDir: src`, emits to `dist`). W-26's split — `tsconfig.build.json` for building, `tsconfig.json` for typechecking — was dropped; `tsconfig.test.json` is the typecheck config and covers `src/**`, `test/**` and `playwright.config.ts`. `tsconfig.build.json` deleted. |
| `desktop/vitest.config.mts` | **Merged.** W-26's thresholds (90 lines / 90 functions / 85 branches, and 90/90/90 on `reducer.ts`) kept, but applied over `src/core/**/*.ts` plus W-26's four mockable adapters rather than W-26's hand-kept file list — which had omitted every one of W-25's core files. |
| `desktop/playwright.config.ts` | **W-26's.** Near-identical; W-26's uses the index-signature-safe `process.env['CI']`. |
| `desktop/.gitignore` | **W-26's** (superset: it also ignores `coverage/`). |
| `desktop/src/core/redact.ts` | **W-26's superset** (`redact`, `Logger`, `createRedactingLogger`, `silentLogger`, `describeError`). W-25's `main/log.ts` already called `redact(line)` with the same signature, so it needed no change; it gained `createNamedLogger(prefix)` so the poller gets a `Logger` that writes to the same rolling file. |
| `desktop/test/unit/redact.test.ts` | **W-26's**, matching its module. |
| `desktop/test/unit/core-portability.test.ts` | **Merged** — see below. |
| `desktop/src/main/test-hook.ts` | **Unified** — see below. |

### `core-portability.test.ts`

W-26's is the better C-13 audit (it strips comments before grepping, so `core/` may name
`powerMonitor` in prose; it checks Electron-only globals; it already allowed `node:fs` in
`poller/watermark.ts` and nowhere else). It kept that, and took two things from W-25's: the
bare side-effect `import 'electron'` form, which has no `from` and so slipped past the first
pattern, and a `require('fs')` form alongside the `from 'node:fs'` one.

Its second `describe` block was a duplicate C-2 credential audit. That block **moved into the
canonical `audit.test.ts`**, bringing its extra `SUPABASE_SERVICE` needle and its
hard-coded-JWT check with it. It had to move: two audits that each spell out the strings they
forbid make each one flag the other's source file, which is how the first merged run failed —
and the only way to keep both is to have one exempt a file, which is the hole the audit
exists to close. `audit.test.ts` now assembles all three needles from fragments, so no file in
the package contains any of them.

### `main/test-hook.ts`

The two installers collided at runtime, not just in git: W-25's used
`Object.defineProperty(globalThis, '__bb2dashTest', { configurable: false, writable: false })`
with a `recorded()` returning an **array**, while W-26's assigned keys onto the existing
object and wrapped an existing `recorded()` with `{ ...previous(), toasts, navigations }` —
which needs a record and a writable property. Whichever ran second threw or produced
`{0: …, 1: …, toasts, navigations}`.

The unified file is one object, merged and never assigned over:

```
globalThis.__bb2dashTest = {
  recorded(): { events, toasts, navigations },   // plus a foreign installer's own keys
  tick(fixture),          // W-26: one poller tick from fixture rows
  clickToast(key),        // W-26
  resetNotifications(),   // W-26
  clickTrayItem(label),   // W-25: fire a tray menu item
}
```

* `recorded()` is a **record**, with W-25's flat event log under `events`. `test/e2e/launch.ts`
  reads `.events`; that was one line, because all eleven of `shell.spec.ts`'s call sites go
  through its helper.
* `tick` is W-26's `tick(fixture)`. W-25's no-argument tray tick gave the name up; it was
  already reachable as `clickTrayItem('Check now')`, which is what its spec used.
* `recorded()` is **rebuilt from named slots** rather than by wrapping the previous one, so
  installing twice cannot nest it (W-26's own idempotence test covers that).
* Two installers, one surface: `installShellTestHook` (`index.ts`, the tray) and
  `installTestHook` (`poller-wiring.ts`, the poller), in either order.

---

## 2. Test output

Node v24.13.0, npm 11.6.2, Windows 11 Home 26200, Electron 44.4.1.

### `npm run typecheck`

```
> tsc -p tsconfig.test.json --noEmit
```

No output, exit 0.

### `npm test` (`vitest run --coverage`, thresholds enforced)

```
 Test Files  22 passed (22)
      Tests  390 passed (390)
   Duration  2.10s
```

| file | tests | | file | tests |
|---|---|---|---|---|
| `route.test.ts` | 42 | | `deeplink.test.ts` | 15 |
| `reducer.test.ts` | 37 | | `redact.test.ts` | 15 |
| `sources.test.ts` | 33 | | `rest.test.ts` | 15 |
| `ny-time.test.ts` | 28 | | `wt.test.ts` | 12 |
| `scheduler.test.ts` | 26 | | `audit.test.ts` | 11 |
| `sync-command.test.ts` | 26 | | `poller-wiring.test.ts` | 11 |
| `watermark.test.ts` | 23 | | `test-hook.test.ts` | 11 |
| `session-decode.test.ts` | 22 | | `notify.test.ts` | 9 |
| `navigation-policy.test.ts` | 20 | | `core-portability.test.ts` | 7 |
| `config.test.ts` | 16 | | `secret.test.ts` | 5 |
| | | | `main-config.test.ts` | 3 |
| | | | `preload.test.ts` | 3 |

```
-------------------|---------|----------|---------|---------|
File               | % Stmts | % Branch | % Funcs | % Lines |
-------------------|---------|----------|---------|---------|
All files          |   96.82 |    93.75 |   96.72 |   98.53 |
 core              |   96.88 |     90.9 |   98.27 |   97.91 |
  config.ts        |     100 |    88.88 |     100 |     100 |
  rest.ts          |   98.14 |     86.2 |   92.85 |     100 |
  session-decode.ts|   91.42 |    89.36 |     100 |   92.98 |
 core/poller       |   97.72 |    96.56 |   98.79 |   98.98 |
  ny-time.ts       |   94.11 |    85.71 |     100 |     100 |
  reducer.ts       |   98.95 |    97.26 |     100 |     100 |
  scheduler.ts     |     100 |    96.42 |     100 |     100 |
  sources.ts       |   98.76 |     98.3 |     100 |     100 |
  watermark.ts     |   92.85 |    96.66 |    87.5 |   93.61 |
 main              |   94.63 |    90.62 |   90.47 |   98.44 |
  notify.ts        |     100 |     87.5 |     100 |     100 |
  poller-wiring.ts |   86.66 |    86.36 |      75 |   97.22 |
  test-hook.ts     |   96.22 |     90.9 |     100 |   97.72 |
-------------------|---------|----------|---------|---------|
Statements : 96.82% (702/725)   Branches : 93.75% (375/400)
Functions  : 96.72% (177/183)   Lines    : 98.53% (607/616)
```

Thresholds pass: 98.53 lines ≥ 90, 96.72 functions ≥ 90, 93.75 branches ≥ 85; and
`reducer.ts` at 100 lines / 100 functions / 97.26 branches against its own 90/90/90.
Files reported at 100 % on every metric are hidden by the text reporter.

### `npm run test:e2e` — both suites, against the real `dist/main/index.js`

```
Running 18 tests using 1 worker

  ok  1 notifications › a fixture tick fires exactly the expected toasts, and a second identical tick fires none (842ms)
  ok  2 notifications › a relaunch against the same watermark fires none (1.5s)
  ok  3 notifications › clicking a recorded toast navigates to its route (898ms)
  ok  4 notifications › a toast key that was never shown does not navigate (771ms)
  ok  5 the shell › opens one window, on the configured app URL (97ms)
  ok  6 the shell › locks down webPreferences (8ms)
  ok  7 the shell › hides the menu bar but keeps the menu installed (4ms)
  ok  8 the shell › and the renderer really has none of what those flags forbid (7ms)
  ok  9 the shell › exposes the frozen preload object and no IPC (6ms)
  ok 10 the shell › has a tray with Open / Check now / Quit (4ms)
  ok 11 the shell › creates no second window: window.open goes to the default browser (80ms)
  ok 12 the shell › opens the sync terminal when the app files a request (123ms)
  ok 13 the shell › opens no second terminal for the same request (554ms)
  ok 14 the shell › runs one poller tick from the tray (12ms)
  ok 15 the shell › keeps an outside link out of the window and hands it to the browser (141ms)
  ok 16 the shell › hides to the tray on close, and the process stays alive (35ms)
  ok 17 session persistence › the auth cookie survives a relaunch, carrying its expirationDate (685ms)
  ok 18 single instance › a second launch quits and leaves the first window alone (1.2s)

  18 passed (10.0s)
```

`test/e2e/fixtures/harness-main.cjs` — W-26's stand-in Electron main — is **deleted**, and
`harness.ts` now delegates to `launch.ts`'s launcher, so both suites launch the same binary
with the same environment. Neither resolves `*.supabase.co`: the fixture origin stands in for
both `appUrl` and `supabaseUrl`.

### `npm run pack` (cold; `dist/` deleted first)

```
  • packaging  platform=win32 arch=x64 electron=44.4.1 appOutDir=dist\win-unpacked
-rwxr-xr-x 246324736  dist/win-unpacked/bb2dash.exe
```

### Packed build on a fresh `--user-data-dir`

```
--- processes named bb2dash ---
17128 bb2dash  Sign in · bb2dash      (+ 3 helper processes)

--- main.log ---
config loaded from ...\merged-profile\config.json (appUrl https://web-xi-ten-uy9xk6c6p0.vercel.app, poll 15m)
sync watcher attached to https://goultdzqcavefcgnifdy.supabase.co/rest/v1/agent_requests*
tray created (Open bb2dash / Check now / Quit)
bb2dash shell ready (Electron 44.4.1); tray "Check now" runs one tick; polling every 15m
[poller] tick (launch) skipped: no readable session
[poller] tick (focus) skipped: no readable session

--- after stop ---
no bb2dash processes remain
```

That is the whole log: the window opened on the deployed app and got the login page (clean
profile, so no session), the tray came up, **the launch tick ran and skipped cleanly** — no
crash, no toast, no watermark write — a focus tick did the same, and the process left nothing
behind. Credential grep over the log: 0 occurrences of the config's anon key, 0 JWT-shaped
strings, 0 mentions of `bearer` / `auth-token` / `apikey`.

`pollIntervalMinutes` defaults to 15 (Q3) and there is no `launchAtLogin` anywhere (Q1),
both visible above and by grep.

### Absence greps and `web/`

```
$ git diff --stat origin/main -- web/          -> empty
$ grep -rn "shell.openPath"        desktop/src/ -> 0
$ grep -rn "will-download"         desktop/src/ -> 0
$ grep -rn "autoUpdater"           desktop/src/ -> 0
$ grep -rn "electron-updater"      desktop/src/ -> 0
$ grep -rn "setLoginItemSettings"  desktop/src/ -> 0
$ grep -rni "mirror"               desktop/src/ desktop/scripts/ -> 0
$ grep -rnE "from 'electron'|require\('electron'\)" desktop/src/core/ -> 0
$ grep -rn "node:fs" desktop/src/core/
    src/core/poller/watermark.ts:15,16   (the one exception C-13 allows)
```

---

## 3. What changed on either side

### The poller is wired (C-7, `main/index.ts`)

`start()` now runs, in order: config → window → navigation guards → hide-on-close → sync
watcher → **`startPoller`** → tray → shell test hook. The poller comes before the tray so
*Check now* has something to run on its first click. The tray's `onCheckNow` routes into
`poller.runOnce()` through `runPollerTick`, which still records the `poller-tick` event the
e2e suite asserts and never throws at the caller. `before-quit` calls `poller.stop()`, which
detaches the interval and the `powerMonitor` listener so the process can actually end.

`registerPoller` and W-26's matching `RegisterPoller` type are gone; nothing needs them once
`index.ts` calls `startPoller` directly.

### `core/rest.ts` gained a fixed-token reader

`PollerDeps.createRest` is `(session: WebSession) => RestGet`. `createMainRest` could not
satisfy it: it resolves the token per call, so one tick would re-open the partition's cookie
jar three times. The cleaner of the two options in `80a` §5 was taken —
`createRestGetForToken` binds the session the tick already read.

That introduced a second bug and a second fix: a new reader per tick means a new error
throttle per tick, and C-6's "logged once per relation per hour" would have become once per
relation per *tick*. `RestOptions` now accepts an injected `shouldLog`, and `main/rest.ts`
shares one process-wide throttle between both readers. Three tests cover it, including one
that deliberately omits the shared throttle and asserts the three log lines that proves why
it is needed.

### `autoHideMenuBar: true` (PM call on note 6)

The default application menu stays installed — Reload and the devtools accelerators keep
working — but the bar is hidden until Alt. Asserted in e2e off the live window
(`BrowserWindow.autoHideMenuBar` and `Menu.getApplicationMenu() !== null`) rather than off a
recorded constant.

### A config failure no longer opens a modal under test (unplanned, and it bit)

The first merged e2e run put a real "bb2dash cannot start … supabaseAnonKey" **modal error
box on Stack's screen**, and the Playwright run hung on it until it was dismissed. Two causes,
both now fixed:

1. `test/e2e/harness.ts` was launching the real shell with only `BB2DASH_TEST` and
   `BB2DASH_APP_URL`, because a patch to that file had silently matched nothing (the search
   text used LF, the checked-out file is CRLF — the repo's own documented gotcha). The real
   shell validates its config at startup and refuses to run without `supabaseAnonKey`.
   The fix is structural rather than an added variable: `harness.ts` now delegates to
   `launch.ts`'s launcher, so there is one launcher and a suite cannot forget a variable again.
2. `dialog.showErrorBox` is modal and blocks the main process until a human clicks it.
   `reportConfigError` now takes the environment and, under `BB2DASH_TEST=1`, writes the field
   and the reason to the log, to stderr and to the recorder as a `config-rejected` event, and
   opens nothing; `index.ts` then calls `app.exit(1)` rather than `app.quit()`, so a
   misconfigured launch fails a spec in seconds instead of hanging it. `test/unit/main-config.test.ts`
   (3 tests, `electron` mocked) holds both branches: no modal in test mode, and the dialog
   naming the field outside it.

No orphaned Electron or bb2dash process was left by that run; checked, and the count was zero.

### The tautological `wt.exe` test is gone (PM call on note 7)

`80a` note 7 flagged that `wt.test.ts`'s alias test computed its expectation with the same
`accessSync` call it was testing, so it could only pass. It is replaced by tests that drive
the injected `isPresent` predicate: first-hit-wins ordering (asserting the resolver *stopped*
probing rather than walking the whole `PATH`), the PATH walk in order, and the `null`
PowerShell fallback. `fileIsPresent` keeps a test that it answers, and never throws, for a
name that is not there. The real evidence that `accessSync` beats `existsSync` on the Store
execution alias stays in `80a` §1 as a transcript, where it is honest.

### Other PM decisions, applied as given

2 `syncDryRun` kept · 3 in-memory sync dedupe accepted, unchanged · 5 AppUserModelID on both
shortcuts, unchanged · 8 W-26's `redact.ts`, one redact test file · 9 test hooks merged as
mapped · 10 canonical package versions win.

---

## 4. What only Stack can verify

1. **The six-step acceptance script** on his laptop, from `dist/win-unpacked`, after running
   `desktop/scripts/make-shortcut.ps1` himself. Steps 1–3 and 6 exercise the shell; 4 and 5
   exercise the toasts.
2. **That toasts actually appear.** Every toast in the suite is recorded rather than shown —
   that is what `BB2DASH_TEST=1` is for — so nothing here has asked Windows to raise one. The
   Start Menu shortcut's `System.AppUserModel.ID` is the thing to suspect if they do not; sign
   out and in, or restart Explorer, so the Start Menu index picks the new entry up.
3. **A sync end to end**: the Sync button filing the row, the shell noticing the POST, and
   `wt.exe` opening on the repo and running `claude "/bb-sync <id>"`. No real terminal was
   spawned from any session here, because a real spawn files and runs a live sync.
   `BB2DASH_SYNC_DRY_RUN=1` opens the same terminal and prints the command instead.
4. **A real sync-landed toast with the right N**, which needs a real `v_sync_status` row. The
   reducer's arithmetic is unit-tested against fixtures; the wiring from a live row to a live
   toast is not, because nothing in the suite may reach `*.supabase.co`.
5. **SmartScreen**, only if the `win-unpacked` folder is ever zipped, moved off the machine
   and brought back. A locally packed binary carries no mark-of-the-web and started with no
   prompt on every run here.
