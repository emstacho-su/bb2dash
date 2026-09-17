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

---

# Round 2 — the ten `/code-review main high` findings

Eight commits on `feat/electron-12`, `e64c7d0..232e8cb`. Every fix has a test that fails
without it; where the test could only be written by changing a signature, that is said so.

| | |
|---|---|
| `f9e191d` | R2-1, R2-2, R2-9, R2-10 — the poller's reads and the shared shapes |
| `4dba968` | R2-3, R2-5 — live notifications, and the app's clipboard write |
| `62bcac1` | R2-6 — the sync terminal's fallback |
| `22f1ff1` | R2-7, R2-8 — a dead window, and an honest load outcome |
| `18e92a2` | de-flake the resume/focus wiring test |
| `8462a52` | R2-4 — expired session, hidden-window reload |
| `312601a` | one trigger per test, deterministic under coverage |
| `232e8cb` | R2-4 follow-up — do not reload a window that has never loaded |

## 1. Per finding

### R2-1 — the crawl to transform gap

`v_gradebook_history.seen_at` is the crawl time (`bb_raw.captured_at`), not the time the row
appears: `transform_tick` folds the crawl in minutes later. A tick landing between the two
read nothing, advanced `lastSeenAt` to `now`, and the rows arriving a minute later were
already behind the watermark — they could never toast.

**Fix.** Every grade read starts `GRADE_OVERLAP_MS` (6 h) behind the watermark and lets
`firedKeys` discard what has already fired. Six hours rather than minutes because it must
cover the crawl-to-transform gap, a laptop asleep through one, and skew between this
machine's clock and the database's. No migration was needed, so none is proposed.

First-launch silence needed a floor, so `Watermark` gains `notifyFloor` — the instant this
install started notifying, written once by `initialWatermark`, never moved. `gradesSince`
clamps to it. A file written before the field existed takes its own `lastSeenAt` as the
floor, so an upgrade does not reach back either.

**Tests.** `sources.test.ts`: `gradesSince` looks exactly `GRADE_OVERLAP_MS` back, clamps at
the floor, returns `lastSeenAt` unchanged for a fresh watermark, and always yields something
`gradesQuery` accepts. `scheduler.test.ts` adds `postgrestStub`, which honours `seen_at=gt.`
and `offset` (the existing `restStub` ignores the query and would hide both this finding and
R2-2): *"is still read and still fires, because the read overlaps backwards"*, *"fires it
exactly once, however many ticks re-read it"*, *"a first launch reads nothing behind its own
floor"*.

### R2-2 — `limit=200`

A full page advanced `lastSeenAt` to `now` while rows past the 200th were never read.

**Fix.** `readNewGrades` pages on `offset` until a page comes back short, capped at
`GRADE_MAX_PAGES` (10 = 2000 rows). Hitting the cap returns `complete: false`, and the
scheduler then advances `lastSeenAt` only to the last row it actually read, through a new
optional `ReduceInput.advanceTo`. The reducer also refuses to move the watermark backwards.

**Tests.** `sources.test.ts`: one short page is one request; 450 rows come back in three
requests with the right offsets; an exactly-full set costs one more empty read; the cap
reports `complete: false`. `scheduler.test.ts`: *"reads every row rather than the first
200"* asserts all 430 row keys reached `firedKeys`, and *"holds the watermark at the last row
it read when the page cap is hit"*.

### R2-3 — the collectable `Notification`

**Fix.** Every shown notification goes into a `Set` and leaves it on `click`, `close` or
`failed`. `close` is a new listener; Q6's click-only rule is about `action` and `reply`,
which are still absent and now asserted absent.

**Tests.** `notify.test.ts` *"R2-3 — live notifications are held against garbage
collection"*: three held at once; released on close, on click (with the route still
delivered), on failed; a throwing click handler still releases; nothing held when the
constructor throws, when the host cannot show toasts, or under `BB2DASH_TEST=1`.

*Note 1 below*: proving a strong reference needs the count to be observable, so
`createNotifier` returns `MainNotifier` — `Notifier` plus `liveCount()`. The core `Notifier`
interface is untouched.

### R2-4 — the expired session, and the hidden window

**The `web/` check first, since it gated the fix.** Answer: **yes**, a page load refreshes
the session cookie. `web/src/proxy.ts` matches every route the shell can reach (its only
exclusions are `_next/static`, `_next/image`, `favicon.ico` and image extensions) and calls
`updateSession`, which builds a `createServerClient` whose `setAll` writes cookies onto the
response and then calls `supabase.auth.getUser()` — which revalidates with the auth server
and rotates an expired token through the cookie adapter — returning that same response
(`web/src/lib/supabase/proxy-session.ts`). `@supabase/ssr` 0.12.7, `supabase-js` 2.116.0.
Two caveats are notes 2 and 3; neither blocks the fix, and `web/` was not touched.

**Fix.** `createUsableSessionReader` returns `null` for an expired session, so the tick skips
instead of 401-ing (C-5: main never refreshes). When the session is expired *and* the window
is not visible, main reloads it at most once per `HIDDEN_RELOAD_MIN_INTERVAL_MS` (10 min:
more often than the token's hour, less often than the 15-minute tick, so a long sleep costs
one reload rather than one per tick). The reload is a navigation, not a token operation.

**Tests.** `session-reader.test.ts` (14): live / expired / absent session; recovery when the
cookie is renewed; reload only when hidden; none when visible, destroyed or absent; the
throttle across four ticks; a reload that throws; no reload while healthy; and the two
booting-window cases below.

**A defect in this fix, found by the smoke and not by a test.** A window is created with
`show: false` and shown on `ready-to-show`, so at launch it is *not visible* — and the launch
tick reloaded it while its first load was still in flight. The log said so plainly:
`reloading the hidden window...` 0.9 s before `loaded https://...`. `ReloadableWindow` gained
`hasLoaded()` (wired to `!needsReload(window)`), so a window that has never loaded, or whose
renderer has died, is left to `window.ts`, which owns both. Re-run on a fresh profile: gone.

### R2-5 — the Sync button's clipboard write

**Fix.** `decidePermission` (pure, in `core/`) allows exactly `clipboard-sanitized-write` and
only from the app origin — not `allowedOrigins`, because Supabase is in the *navigation*
allowlist for auth redirects and signed Storage URLs and none of that needs a clipboard.
`clipboard-read` stays denied. Both the request handler and the *check* handler are set;
leaving the latter at its default would let `permissions.query()` report granted for
something the former then denies.

**Tests.** `navigation-policy.test.ts` (8 new cases): the allow; eight other permissions
denied; the Supabase origin denied; a lookalike host, an http downgrade, a `file:` URL and a
missing requesting URL all denied. `shell.spec.ts` *"lets the app copy to the clipboard, and
denies every other permission"* writes the real clipboard through the real handler, reads it
back from the main process, then asserts geolocation is refused and that no recorded
decision allowed anything but the clipboard write.

### R2-6 — the spawn

**Fix.** `spawnOnce` settles on the first of `error` or `spawn` and catches a synchronous
throw; `unref()` happens only once the process is really running (unreferencing one about to
emit `error` would leave the promise hanging). On failure the PowerShell-alone argv — built
before anything is spawned — is tried once. If that fails too the id is un-marked so the next
POST can retry. The id is still marked *before* the spawn, so a second POST mid-launch cannot
open a second terminal.

**Tests.** New `sync-terminal.test.ts` (11) with `child_process` and `electron` mocked: the
fallback on an async `error` and on a synchronous throw; no fallback when PowerShell was
already the command; the id freed when neither starts and kept when one does; and nothing
spawned for an empty id, `nope`, `1.5`, `-1`, thirteen digits or `77; rm -rf /`.

### R2-7 — the dead window

**Fix.** `attachLoader` owns the load. A rejection retries on `LOAD_RETRY_DELAYS_MS`
(2s/5s/15s/30s, then it stops — a laptop leaving a tunnel, not a service); a success resets
the backoff; `render-process-gone` reloads. The retry timer is `unref`'d. `showWindow`
reloads a window `needsReload` says is blank or crashed, which makes the tray's *Open* the
manual retry after the backoff has given up.

**Tests.** New `window.test.ts` (16) with `electron` mocked and fake timers: the backoff,
that it waits the *whole* delay, that it gives up after four, that a success resets it, the
crash reload (twice), `needsReload`'s four cases, tray *Open* as the manual retry, and that
`ensureLoaded` on an unknown window is a no-op.

### R2-8 — `void loadURL`

**Fix.** The outcome is recorded when the load settles. `ERR_ABORTED` is not a failure:
Chromium aborts the load it was asked for whenever something supersedes it, and the web app's
own proxy redirects — treating that as failure would report every redirect as a broken deep
link. A synchronous throw is still answered synchronously with `false`.

**Tests.** `deeplink.test.ts` (5 new): a rejected load recorded as a failure; `ERR_ABORTED`
recorded as a success; `isBenignLoadFailure`'s classification; *"leaves no unhandled
rejection behind"*; and the synchronous throw still returning `false`.

*Note 4 below*: `recorder.navigations()` is now written a microtask after `navigate()`
returns. Three existing tests moved to awaiting a flush.

### R2-9 — the wedged watermark

**Fix.** `normaliseWatermark` coerces `lastSeenAt` on read through `toISOString()`; only a
value that is not a timestamp at all is a corrupt file (which reads as `null`, i.e. a first
launch). Rejecting instead of coercing was the trap: a failed read changes nothing, so the
bad value stayed on disk and every subsequent tick threw too.

**Tests.** `watermark.test.ts` *"R2-9 — lastSeenAt is normalised on read, not rejected"*:
three loose shapes repaired and then accepted by `gradesQuery`; the repair surviving a write
and a second read; a non-timestamp still a first launch; a pre-`notifyFloor` file taking its
`lastSeenAt` as the floor; and the validations that must still refuse.

### R2-10 — the duplication

**Fix.** `HH_MM`, `ISO_DATE` and `ISO_INSTANT` now come from `core/patterns.ts`.
`deeplink.ts`'s private `raise()` — `showWindow()` minus the `isDestroyed()` guard — is gone.

**Tests.** New `patterns.test.ts` (45), whose point is not that a regex works but that the
four former call sites now look at the same one: the config schema and the NY clock accept
and reject the same `dueReminderTime`, and a `dueCheckedOn` the watermark accepts is a
`dueOn` the query builder accepts. `deeplink.test.ts` drives the shared `showWindow` with a
destroyed window.

## 2. Final numbers

Node v24.13.0, Electron 44.4.1, Windows 11 Home 26200. Every gate checked by exit code.

```
npm run typecheck   exit 0
npm test            exit 0    Test Files 26 passed (26)   Tests 535 passed (535)
npm run test:e2e    exit 0    19 passed (8.6s)
npm run pack        exit 0    dist/win-unpacked/bb2dash.exe, 246,324,736 bytes (cold)
```

Coverage (thresholds enforced: 90 lines / 90 functions / 85 branches, reducer 90/90/90):

```
Statements : 96.72% (767/793)    Branches : 94.05% (427/454)
Functions  : 96.89% (187/193)    Lines    : 98.23% (667/679)
reducer.ts : 100% lines, 100% functions, 97.4% branches
```

Per file, unit: `patterns` 45, `sources` 43, `route` 42, `navigation-policy` 38, `reducer` 37,
`scheduler` 33, `watermark` 30, `ny-time` 28, `sync-command` 26, `deeplink` 23,
`session-decode` 22, `notify` 17, `config` 16, `window` 16, `redact` 15, `rest` 15,
`session-reader` 14, `poller-wiring` 12, `wt` 12, `audit` 11, `sync-terminal` 11,
`test-hook` 11, `core-portability` 7, `secret` 5, `main-config` 3, `preload` 3.

Absence greps and `web/`:

```
git diff --stat origin/main -- web/    -> empty
shell.openPath / will-download / autoUpdater / electron-updater /
setLoginItemSettings / mirror          -> 0 hits in desktop/src
from 'electron' under desktop/src/core -> 0
node:fs under desktop/src/core         -> poller/watermark.ts only (the C-13 exception)
```

**Packed-exe smoke, fresh `--user-data-dir`**, whole log:

```
config loaded from ...\r2c-profile\config.json (appUrl https://web-xi-...vercel.app, poll 15m)
sync watcher attached to https://goultdzqcavefcgnifdy.supabase.co/rest/v1/agent_requests*
tray created (Open bb2dash / Check now / Quit)
bb2dash shell ready (Electron 44.4.1); tray "Check now" runs one tick; polling every 15m
no web session in the partition; skipping the tick
[poller] tick (launch) skipped: no readable session
permission denied: "media" is not on the allowlist            (x2)
permission denied: "web-app-installation" is not on the allowlist
permission denied: "geolocation" is not on the allowlist
[poller] tick (focus) skipped: no readable session
loaded https://web-xi-ten-uy9xk6c6p0.vercel.app
```

Window title `Sign in ; bb2dash`, tray created, R2-5's handler visibly denying everything
but the clipboard, no spurious reload, and `no bb2dash processes remain` afterwards. No
window or dialog was put in front of Stack beyond the shell's own window.

One run in the middle of this series showed the *signed-in* Today page on an equally fresh
profile, with a second navigation about eighteen seconds in. Two other fresh-profile runs
before and after it showed the login page, so the most likely explanation by far is that
Stack signed in at the keyboard while that window was up. It is recorded rather than
explained away. Because that would have left a real session cookie in a scratchpad profile,
every smoke profile directory and every screenshot from this session has been deleted.

## 3. Notes needing a decision

1. **`createNotifier` returns `MainNotifier`, not `Notifier`** — the same interface plus
   `liveCount()`. R2-3 is about a strong reference, and a strong reference cannot be proven
   without the count being observable. `core/types.ts`'s `Notifier` is untouched, so the
   container port (C-13) is unaffected. Accept, or move the count behind `BB2DASH_TEST`.

2. **A real bug in `web/`, out of scope here.** `web/src/lib/supabase/proxy-session.ts`
   returns `NextResponse.redirect(url)` on its two auth-guard branches *without* copying the
   cookies `setAll` populated. If a token refresh happened during `getUser()` on a request
   that then redirects — an authenticated visitor hitting `/login`, or the unauthenticated
   guard — the rotated `sb-...-auth-token` is discarded and the browser keeps the old one. It
   self-heals on the next request, but it burns a refresh-token rotation, and with refresh
   reuse detection that is the shape of bug that can invalidate a session. `web/` is
   read-only for this phase: your call whether it becomes a Phase 13 item.

3. **R2-4's nudge only helps within the refresh token's lifetime.** `getUser()` rotates a
   token that is expired or near expiry, but if the shell has been shut for longer than the
   refresh token lives, no page load will help and Stack signs in again. That is the correct
   behaviour; recording it so "the shell keeps me signed in forever" is not read into it.

4. **`recorder.navigations()` is now asynchronous** (R2-8): written a microtask after
   `navigate()` returns, because the outcome is not known until the load settles. Three
   existing tests moved to awaiting a flush; the e2e specs already await a real round trip.
   Anything written later that reads `navigations()` immediately after a click will see an
   empty array.

5. **`firedKeys` is capped at 500 (C-7) and R2-1 widened the window it has to cover.** The
   overlap re-reads up to six hours of grade rows every tick and relies on `firedKeys` to
   keep them quiet. A backlog large enough to evict a key that is still inside the window
   would re-toast it. 500 observations in six hours is not a plausible gradebook — the
   R2-2 test deliberately uses 430 to stay inside it — but the two numbers are now coupled,
   and C-7 freezes the 500. Leave it, or raise the cap.

6. **Two tests were flaky and are now deterministic**, which is a behaviour claim worth your
   eye rather than a silent edit. `poller-wiring.test.ts`'s resume/focus test compared the
   watermark file before and after, so two ticks in the same millisecond wrote identical JSON;
   it also fired both events at once, and since ticks never overlap one was always dropped as
   busy, so it could only ever prove one of the two paths it named. Each trigger now gets its
   own poller. Six consecutive full runs under coverage, checked by exit code.

## 4. Still only Stack's to verify

Unchanged from Round 1, and R2-4 adds one: **that the app is still signed in after a long
spell hidden in the tray** — the hidden-window reload is unit-tested against a faked cookie
jar, but nothing here has watched a real token expire and be rotated by the real proxy.
