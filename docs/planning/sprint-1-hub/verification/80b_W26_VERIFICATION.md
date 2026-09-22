# W-26 verification — Phase 12 notifications (C-7, the delivery half of C-6, C-10, C-13)

Worker: W-26. Branch `feat/electron-12-notify`, worktree `bb2dash-wt-electron-12-notify`.
Date: 2026-09-16. Contract: `docs/planning/80_PHASE12_electron.md`, frozen 2026-09-16 with
Stack's answers Q1–Q9 and the C-12 / C-13 amendments.

Task loops 6, 7 and 8. Zero changes under `web/`, `project-state/` or any file W-25 owns.

---

## 1. What was built, per clause

### C-13 portability split (R-28)

`desktop/src/core/` is plain Node with no `electron` import. Everything W-26 wrote that a
container could run later lives there; the three Electron adapters live in `desktop/src/main/`.

| file | lines | what it is |
|---|---|---|
| `src/core/poller/reducer.ts` | 254 | the pure reducer — C-7's four rules |
| `src/core/poller/ny-time.ts` | 103 | New York wall clock + the daily-check trigger |
| `src/core/poller/watermark.ts` | 133 | file-backed `WatermarkStore`, atomic write |
| `src/core/poller/sources.ts` | 238 | C-6's R1/R2/R3 + the course-label read |
| `src/core/poller/scheduler.ts` | 276 | tick orchestration, injected clock and timers |
| `src/core/route.ts` | 37 | C-7 Delivery's route allowlist (see note 1) |
| `src/core/redact.ts` | 72 | log redaction, C-10 |
| `src/main/notify.ts` | 68 | Electron `Notification` adapter + `BB2DASH_TEST` recorder |
| `src/main/deeplink.ts` | 80 | restore + show + focus + `loadURL` |
| `src/main/poller-wiring.ts` | 162 | the seam: store, notifier, deep link, scheduler, triggers |
| `src/main/test-hook.ts` | 106 | `globalThis.__bb2dashTest` (merged, not assigned) |

Every file is under the 400-line ceiling. The audit that proves the split is
`test/unit/core-portability.test.ts`: it walks every `.ts` file actually on disk under `core/`
and fails on `from 'electron'`, `require('electron')`, `import('electron')`, on an
Electron-only global in code (comments are stripped first — `core/` documents which Electron
object supplies each injected value), and on any `node:fs` import outside `watermark.ts`.

### C-7 rule 1 — sync landed

Key `sync:<id>`. Fires when `v_sync_status.finished_at` parses later than `lastSeenAt` and
`status ∈ {ok, partial, failed}`; `running` and anything else never fire. `N =
summary.changes.length`.

* `Sync landed · N change(s)` / `Sync landed · no changes` / `Sync failed`.
* Body: the first three `summary.changes` lines. For `failed`, `summary.errors[0]` (or
  `No error detail was recorded.` when the array is empty — note 4).
* For `partial` the title is the landed form and the error line is appended below the change
  lines, per the Contract's "Residual assumptions" row.
* Route `/inbox` when `summary.attention_raised > 0`, else `/`.
* A `null` summary reads as no changes, no attention, no errors.
* Timestamps are compared with `Date.parse`, not string order: PostgREST renders `timestamptz`
  with a `+00:00` offset and a lexical comparison against a `...Z` watermark would be wrong.

### C-7 rule 2 — grade posted

Key `grade:<shell_course_id>:<column_id>:<run_id>`. Already-fired rows are removed **before**
the coalescing count, so a replayed row can never push a tick over the threshold.

* Fewer than four new rows: one toast each. Title `<title_short> · <name>`, body
  `<score> / <possible>` — or `<score>` alone when `possible` is null — plus `· was
  <previous_score>` when `previous_score` is not null. Route `/course/<shell_course_id>/grades`.
* Four or more new rows in one tick: one toast per shell course, `<title_short> · N grades
  posted`, body the first three column names, same route (note 2 covers the coalesced key).
* `title_short` falls back to the raw course id when the label is missing or empty.
* A course id that is not `AAA.999[.suffix]` degrades the route to `/` rather than emitting a
  toast whose click the validator would refuse (note 3).

### C-7 rule 3 — due tomorrow

Key `due:<YYYY-MM-DD>` on the New York date the check ran, which is the same value written to
`dueCheckedOn`, so the key and the record can never disagree (note 5). Title `Due tomorrow ·
N item(s)`, body up to three `<title_short> · <title>` lines, route `/`. Zero rows fires
nothing but still records the date. The trigger (`shouldRunDueCheck`) is the first tick at or
after `dueReminderTime` New York on a date that is not `dueCheckedOn`; the scheduler owns that
decision and the reducer is told through `ReduceInput.due === null`.

The zone comes from `Intl.DateTimeFormat(..., { timeZone: 'America/New_York', hourCycle: 'h23' })`
— `hour12: false` renders midnight as `24` on some ICU builds. The arithmetic is integer work
on `YYYY-MM-DD` through `Date.UTC`, so "tomorrow" never consults the host zone and both DST
switch-overs are covered by tests.

### C-7 rule 4 — dedupe, cap, advance

A key in `firedKeys` never fires again. `firedKeys` keeps the newest 500 (duplicates dropped on
both sides so a hand-edited file cannot eat slots). `lastSeenAt` advances to the tick's start
time, and the scheduler writes it only **after** the toasts have been shown, so a crash between
the two re-fires at most one tick's worth and the keys dedupe it.

The reducer returns new objects throughout; `test/unit/reducer.test.ts` asserts the input
watermark is byte-identical afterwards and that the returned arrays are not the same references.

### C-7 Scheduler

`createPoller({ config, store, notifier, getSession, createRest, clock?, timers?, log? })`:

* `start()` — launch tick, then `setInterval` at `pollIntervalMinutes` (Q3's default 15 comes
  from W-25's config; the scheduler clamps to a 1-minute floor). Second call is a no-op.
* `runOnce(reason)` — the tray's *Check now* (C-12).
* `onFocus()` — at most one tick per 60 s, throttled on the injected clock.
* `onResume()` — `powerMonitor` resume, unthrottled.
* `runWithRows(rows)` — the C-10 hook's `tick(fixture)`.
* Ticks never overlap: one in-flight slot, and a trigger that arrives mid-tick is dropped, not
  queued (the next scheduled tick reads the same rows anyway).
* A tick that cannot read the session, or any of the four relations, changes nothing: no toast,
  no watermark write, no advance of `lastSeenAt`. Proven per relation in the suite.
* First launch (or an unreadable watermark) writes `lastSeenAt = now` and stops, so nothing
  historical can fire.
* Course labels are read once per launch and cached (C-6).

### C-6 reads (the delivery half)

`sources.ts` builds the query strings and validates the rows; W-25's `core/rest.ts` is the
transport, reached only through the PM-owned `RestGet` type. The query strings are asserted
byte for byte in `test/unit/sources.test.ts` against literals transcribed from C-6's table, and
I re-checked that transcription against the brief mechanically (R1, R2, R3 all match; R4 is
W-25's). Every interpolated value is regex-validated first — `lastSeenAt` must be exactly what
`Date.prototype.toISOString` produces, `dueOn` must be `YYYY-MM-DD` — so a value can never
smuggle a separator into another parameter. Rows are validated by hand (no runtime dependency
in `core/`) and a bad shape is a typed `RowShapeError` the scheduler turns into "this tick
changes nothing".

### C-7 Delivery

`main/notify.ts` shows `new Notification({ title, body })`, click-only (Q6), click routed to
`deeplink.navigate`. Under `BB2DASH_TEST=1` it records instead. `Notification.isSupported()`
false, a throwing constructor, or a Windows `failed` event each cost one log line, never the
tick.

`main/deeplink.ts` validates against C-7's frozen pattern, then restores a minimised window,
shows a hidden one (C-12), focuses, and `loadURL(new URL(route, appUrl))`. A refused route
never reaches `loadURL`.

### C-10 test hook and logs

`globalThis.__bb2dashTest` is **merged** into, never assigned over, because W-25's
sync-terminal recorder (C-8) installs its own entries there. It exposes `recorded()` (which
also calls and spreads any pre-existing `recorded()`), `tick(fixture)`, `clickToast(key)` and
`resetNotifications()`. It exists only when `BB2DASH_TEST === '1'`.

Every log line W-26 writes goes through `core/redact.ts`: JWTs, `sb-<ref>-auth-token[.N]`
values, `Bearer`/`apikey`/`access_token` values and any opaque run of 60+ characters are
**substituted**, never truncated. `test/unit/redact.test.ts` proves it against a structurally
real JWT and a real-shaped chunked auth cookie.

---

## 2. Test output

Run on Stack's laptop, 2026-09-16, Node 24.13.0 / npm 11.6.2, from
`C:/Users/estac/projects/bb2dash-wt-electron-12-notify/desktop`.

### `npm run typecheck`

```
> bb2dash-desktop@0.1.0 typecheck
> tsc --noEmit -p tsconfig.json

```

Clean, over `src/**` + `test/**` + `playwright.config.ts`, under `strict`,
`noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch` and
`noUnusedLocals`.

### `npm test` (`vitest run --coverage`)

```
 RUN  v5.0.0 C:/Users/estac/projects/bb2dash-wt-electron-12-notify/desktop
      Coverage enabled with v8

 Test Files  12 passed (12)
      Tests  256 passed (256)
   Start at  23:03:38
   Duration  1.56s (transform 39%, tests 28%, import 22%, worker 10%)

 % Coverage report from v8
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |    97.2 |    95.83 |   96.18 |   99.05 |
 core/poller       |   97.72 |    96.56 |   98.79 |   98.98 |
  ny-time.ts       |   94.11 |    85.71 |     100 |     100 | 48,72
  reducer.ts       |   98.95 |    97.26 |     100 |     100 | 62,149
  scheduler.ts     |     100 |    96.42 |     100 |     100 | 246
  sources.ts       |   98.76 |     98.3 |     100 |     100 | 111
  watermark.ts     |   92.85 |    96.66 |    87.5 |   93.61 | 72,112-113
 main              |   95.12 |    92.15 |   89.18 |   99.05 |
  notify.ts        |     100 |     87.5 |     100 |     100 | 32
  poller-wiring.ts |   86.66 |    86.36 |      75 |   97.22 | 102
-------------------|---------|----------|---------|---------|-------------------

=============================== Coverage summary ===============================
Statements   : 97.2% ( 486/500 )
Branches     : 95.83% ( 253/264 )
Functions    : 96.18% ( 126/131 )
Lines        : 99.05% ( 420/424 )
================================================================================
```

**`reducer.ts`: 100 % lines, 97.26 % branches, 100 % functions — the ≥ 90 % bar in C-7 is
met with room.** `core/route.ts` and `core/redact.ts` are at 100 % on every metric and the v8
text reporter therefore omits their rows; the JSON summary confirms it. Thresholds are
enforced in `vitest.config.mts` (90 % lines / 90 % functions / 85 % branches overall, and a
per-file 90/90/90 on `reducer.ts`), so the suite fails if coverage regresses.

The twelve files: `reducer`, `ny-time`, `route`, `watermark`, `redact`, `sources`, `scheduler`,
`core-portability`, `deeplink`, `notify`, `test-hook`, `poller-wiring`. Property tests
(fast-check, 200–300 runs each) cover: the 500-key cap and that a key added this tick always
survives the trim; that `mergeFiredKeys` preserves the order of what it keeps; that replaying
**any** tick against its own output watermark fires nothing; and that every emitted toast
carries a route the deep-link validator accepts.

### `npm run test:e2e` (Playwright for Electron)

```
> bb2dash-desktop@0.1.0 pretest:e2e
> npm run build
> tsc -p tsconfig.build.json

> bb2dash-desktop@0.1.0 test:e2e
> playwright test

Running 4 tests using 1 worker

  ✓  1 …notifications › a fixture tick fires exactly the expected toasts, and a second identical tick fires none (826ms)
  ✓  2 …notifications › a relaunch against the same watermark fires none (1.5s)
  ✓  3 …notifications › clicking a recorded toast navigates to its route (824ms)
  ✓  4 …notifications › a toast key that was never shown does not navigate (780ms)

  4 passed (4.8s)
```

These run against a **real Electron main process** (Electron 44.4.1), driven through
`electronApp.evaluate` into `globalThis.__bb2dashTest`, with a per-test `--user-data-dir` and a
loopback HTTP origin. Test 2 closes the app and relaunches against the same profile directory,
which is the C-7 "restarting the poller fires no duplicate toast" claim. Test 3 asserts the
window really lands on `http://127.0.0.1:<port>/course/IST.323/grades`. See deviation 7 for
which entry point they launch.

### DoD greps

```
$ git diff --stat origin/main -- web/
(empty)

$ grep -rn "shell.openPath\|autoUpdater\|will-download\|bb.runAll\|mirror" desktop/src
(no matches)
```

W-26's five commits touch `desktop/` only — no `web/`, no `project-state/`, no
`docs/planning/` except this file, and no file W-25 owns.

---

## 3. Fixtures used

* `desktop/test/fixtures/rows.ts` — row builders shaped from the migrations: `v_sync_status`
  with `summary = {stages, changes, attention_raised, errors}` and `changes` lines in
  `sync_change_lines()`'s wording (035); `v_gradebook_history` with `shell_course_id`,
  `column_id`, `name`, `run_id`, `seen_at`, `score`, `possible`, `previous_score` and a null
  `previous_score` on a first observation (058); `v_work_items` across both halves of the
  assignments/readings union (016). Course ids are real ones (`IST.323`, `GEO.103.lecture`,
  `MAT.295`).
* `desktop/test/e2e/notifications.spec.ts` carries the same shapes inline as the fixture the
  Playwright suite hands to `tick()`.
* `desktop/test/e2e/harness.ts` starts a loopback HTTP server as the app origin, so
  `new URL(route, appUrl)` resolves exactly as it does in production. **No test reaches
  `*.supabase.co`**; the only transports in the whole suite are stub `RestGet` functions and
  that loopback server.

---

## 4. Deviations and decisions (numbered)

1. **`core/route.ts`, not the regex inline in `main/deeplink.ts`.** C-1's file list puts the
   route allowlist in `main/deeplink.ts`; C-13 says everything portable belongs in `core/`.
   Route validation is pure string work with no Electron in it, and the reducer needs it too
   (note 3), so the pattern and `isAllowedRoute` live in `core/route.ts` and `main/deeplink.ts`
   is the Electron half that calls it. The pattern itself is character-for-character C-7's.
2. **The coalesced grade toast needed a key the Contract does not name.** C-7 freezes
   `grade:<shell>:<column>:<run>` for a row. A coalesced toast is not a row, so it carries
   `grade:<shell_course_id>:coalesced:<run_id of the newest member>`. Every member row key is
   still written to `firedKeys`, so dedupe remains row by row and the coalesced key is belt and
   braces.
3. **A malformed course id degrades the route to `/`.** If `shell_course_id` ever fails C-7's
   `[A-Z]{3}\.\d{3}(\.[a-z]+)?` shape, `/course/<id>/grades` would be refused at click time and
   the toast would be dead. The reducer falls back to Home instead. A fast-check property
   asserts every emitted toast carries a route `isAllowedRoute` accepts.
4. **`Sync failed` with no recorded error** gets the body `No error detail was recorded.`
   rather than an empty body. C-7 says "body = `summary.errors[0]`" and does not say what
   happens when the array is empty; `ical_poll` and `run_transform` can both leave it empty.
5. **`due:<YYYY-MM-DD>` uses the New York date the check ran on**, i.e. the same value written
   to `dueCheckedOn`, not the "tomorrow" the rows are due on. Both dedupe correctly; this one
   keeps the key and the recorded date in step, so they can never drift.
6. **`desktop/package.json`, `tsconfig.json`, `tsconfig.build.json`, `vitest.config.mts` and
   `playwright.config.ts` are W-26 stopgaps.** C-1 makes `package.json` and `tsconfig` W-25's.
   W-26's suite needed a runnable package before the shell branch landed. **On integration,
   take W-25's `package.json` and `tsconfig.json` and merge in these devDependencies:**
   `@playwright/test 1.63.0`, `@types/node 22.20.2`, `@vitest/coverage-v8 5.0.0`,
   `electron 44.4.1`, `fast-check 4.10.1`, `typescript 5.9.3`, `vitest 5.0.0`; and these
   scripts: `typecheck`, `test` (`vitest run --coverage`), `pretest:e2e` (`npm run build`),
   `test:e2e` (`playwright test`). `build` is `tsc -p tsconfig.build.json`, which is the
   emitting config; `tsconfig.json` is `noEmit` and covers `src/` + `test/` for `typecheck`.
7. **`test/e2e/fixtures/harness-main.cjs` is a W-26 test-only Electron entry**, not a second
   shell. C-10's suite launches `dist/main/index.js`, which is W-25's (C-1) and is not on this
   branch, so the specs would all have skipped and proven nothing. `test/e2e/harness.ts`
   prefers `dist/main/index.js` **whenever it exists** and only falls back to this file, so the
   same specs run against the real shell the moment W-25's branch is merged — no spec edit
   needed. The harness supplies a stub session and a stub `RestGet` that returns no rows, so it
   touches no network. Delete it after the merge if the PM prefers.
8. **Implementation before tests, not RED → GREEN.** The SOP asks for TDD. The Contract was
   frozen and unusually precise, and the whole surface was specified before a line was written,
   so the modules were written first and the suites written against the Contract's text rather
   than against the implementation (the C-6 query strings are transcribed from the brief, not
   read out of the code). Recording it as a deviation rather than claiming a cycle that did not
   happen.

---

## 5. Open items for W-25 and the PM

1. **`main/index.ts` must call `startPoller`.** W-26 never edits a file W-25 owns, so nothing
   currently calls the poller in the real shell. `src/main/poller-wiring.ts` carries a marked
   `TODO (W-25 seam, W-26 shim)` with the exact call. Roughly:

   ```ts
   const poller = startPoller({
     userDataDir: app.getPath('userData'),
     appUrl: config.appUrl,
     config: { pollIntervalMinutes: config.pollIntervalMinutes,
               dueReminderTime: config.dueReminderTime },
     getSession,                       // W-25's main/session.ts
     createRest,                       // W-25's core/rest.ts, bound to supabaseUrl + anon key
     getWindow: () => mainWindow,
     log,                              // W-25's rolling file logger, if there is one
   });
   // tray "Check now" (C-12) -> void poller.runOnce();
   // window replaced        -> poller.attachWindow(win);
   // before-quit            -> poller.stop();
   ```

   If W-25 prefers the `registerPoller(handle)` hook named in the briefing, its shape is
   exported as `RegisterPoller` from `poller-wiring.ts`.
2. **`createRest` signature.** W-26 codes against the PM-owned `RestGet` type and needs a
   `(session: WebSession) => RestGet` factory from W-25's `core/rest.ts`. If `rest.ts` exports
   something else — say a bound object, or a function taking the token string — the adapter is
   one line in `index.ts`, but the PM should confirm which.
3. **Logger.** W-26's modules take an injected `Logger` and fall back to a redacting console
   logger. If W-25 builds the C-10 rolling file at `userData/logs/main.log`, pass it in and the
   redaction comes along for free.
4. **`package.json` / `tsconfig` merge** — deviation 6.
5. **Nothing in `core/` reads config.** `pollIntervalMinutes` and `dueReminderTime` arrive as a
   `PollerConfig`; W-25's `core/config.ts` schema owns their defaults and validation. If Q3's
   amended default of 15 is not yet in the schema, that is W-25's line to change.
