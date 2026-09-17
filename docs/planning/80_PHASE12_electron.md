# Phase 12 — Electron shell: window, notifications, Sync button

Date: 2026-09-14 (brief); Contract frozen 2026-09-16 (PM session) with Stack's answers Q1–Q9 the same evening. Product manager: Stack. Requirements: R-23 (MVP subset),
R-26 (desktop) from `60_REQUIREMENTS_v2.md`. Phase branch `feat/electron-12`, one PR. **After
Phase 10a and 11 are on `main`** and after the week-11 exams. No migrations expected; if one is
needed (a notifications outbox), take it from 070–079.

## Why

Stack wants bb2dash to be an app on his taskbar, not a tab, and wants it to tell him things
without being open: a sync landed, a grade posted, something is due tomorrow. The web app stays
the product; Electron is a thin shell around the deployed site plus the local jobs a browser
cannot do.

## Stack's decisions (2026-09-14, `70_MVP_INDEX.md` §1.7)

* MVP jobs: **own window + taskbar icon + single instance** (loads the deployed web app;
  session in `safeStorage`); **desktop notifications for all three R-26 triggers** (sync landed
  with N changes, grade posted, item due tomorrow); **Sync button** that opens Windows Terminal
  in the repo with `claude "/bb-sync <id>"` ready.
* **Not in the MVP:** the OneDrive file mirror. It is the first post-MVP task of this phase.
* No crawl inside Electron, no Blackboard webview, no `shell.openPath` from the mirror, no
  installer, no code signing, no auto-update. Unpacked build + shortcut, Windows 11 only.

## MVP (in Stack's words)

Double-click a shortcut; bb2dash opens in its own window with its own taskbar icon and I am
still signed in. A second double-click focuses that window instead of opening another. When a
sync lands, a grade posts, or something is due tomorrow, Windows shows a notification that opens
the right screen when clicked. The Sync button opens a terminal with the sync command typed for
me.

## Contract (frozen 2026-09-16 by the PM session; Stack's answers to §Open questions are appended when given)

Everything below is what the workers build to. Names, files, queries and keys are fixed; a worker
who needs to change one writes it up as a numbered note in the verification file and the PM
decides. Zero changes under `web/`: `git diff --stat origin/main -- web/` on the phase branch is
empty (DoD). The Vercel project's Root Directory is `web`, so nothing under `desktop/` deploys.

### C-1 Package and layout

`desktop/` is a standalone npm package (`bb2dash-desktop`, private), TypeScript, Electron pinned to
the current stable at kickoff (the worker records the version in `desktop/README.md` and a
DECISIONS row). Frozen file names:

```
desktop/
  package.json                scripts: build (tsc), start, test (vitest), test:e2e (playwright), pack (electron-builder --dir)
  tsconfig.json
  electron-builder.yml        win target "dir"; appId su.stack.bb2dash; productName bb2dash; icon build/icon.ico
  build/icon.ico              placeholder glyph; the real icon is Phase 13's (C-3 carried item)
  src/main/index.ts           bootstrap: AUMID, single-instance lock, config, window, poller, sync watcher
  src/main/config.ts          schema + defaults + load of userData/config.json
  src/main/window.ts          BrowserWindow factory; window-state persistence
  src/main/navigation.ts      will-navigate allowlist, setWindowOpenHandler, openExternal
  src/main/session.ts         read the web session's access token from the partition's cookies
  src/main/secret.ts          safeStorage encrypt/decrypt helper (unit-tested; unused by the MVP, see C-5)
  src/main/rest.ts            one PostgREST GET helper (anon key + bearer), rows schema-validated
  src/main/deeplink.ts        route allowlist + navigate the window
  src/main/notify.ts          Notification wrapper; recorder under BB2DASH_TEST
  src/main/sync-terminal.ts   agent_requests insert watcher + wt.exe spawn; recorder under BB2DASH_TEST
  src/main/poller/scheduler.ts  timers, focus, power resume; ticks never overlap
  src/main/poller/sources.ts    the three reads (sync, grade, due) -> candidates
  src/main/poller/reducer.ts    pure: candidates + watermark -> toasts + next watermark
  src/main/poller/watermark.ts  userData/notify-watermark.json, atomic write
  src/main/mirror/              post-MVP (C-9); empty until W-27
  src/preload/index.ts        contextBridge exposes `bb2dashDesktop = Object.freeze({ version })` and nothing else
  scripts/make-shortcut.ps1   Desktop + Start Menu shortcut (C-10)
  test/unit/*.test.ts         vitest
  test/e2e/*.spec.ts          Playwright for Electron
  README.md
```

### C-2 Config

`config.json` in `app.getPath('userData')` (`%APPDATA%\bb2dash\config.json`), validated at startup
by a schema (zod); a bad file stops the app with a dialog naming the field. `desktop/README.md`
ships the example.

| key | default | meaning |
|---|---|---|
| `appUrl` | `https://web-xi-ten-uy9xk6c6p0.vercel.app` | the deployed web app; the only app origin the window may navigate to |
| `supabaseUrl` | `https://goultdzqcavefcgnifdy.supabase.co` | PostgREST + Storage; the second allowed origin (auth redirects, signed URLs) |
| `supabaseAnonKey` | required | the legacy anon JWT, the same value `web/` ships client-side |
| `repoDir` | `C:\Users\estac\projects\bb2dash` | cwd for the sync terminal: the `main` checkout, where `/bb-sync` runs |
| `pollIntervalMinutes` | `5` | poller cadence while the app runs (Q3) |
| `dueReminderTime` | `18:00` | New York wall-clock time the "due tomorrow" check runs once a day (Q5) |
| `launchAtLogin` | `false` | applied with `app.setLoginItemSettings` at startup (Q1) |
| `mirrorRoot` | see C-9 | post-MVP |

Secrets: the anon key is the only credential anywhere in `desktop/`; RLS is the boundary, as in
`web/`. `test/unit/audit.test.ts` greps `desktop/src` and `desktop/test` for `service_role` and
`sb_secret` on every run (copy of `web/test/audits.test.ts`).

### C-3 Process, window, single instance

* `app.setAppUserModelId('su.stack.bb2dash')` before `ready`; `app.requestSingleInstanceLock()` is
  the first call in `index.ts`, `app.quit()` when it fails; `second-instance` restores a minimized
  window and calls `focus()` (inside `setImmediate`, per the research quirk).
* One `BrowserWindow`, `webPreferences: { partition: 'persist:bb2dash', preload, nodeIntegration:
  false, contextIsolation: true, sandbox: true, webSecurity: true }`, `loadURL(appUrl)`.
  `session.setPermissionRequestHandler` denies every request: the renderer needs no OS permission
  (toasts are main's). The Sync button's clipboard write is a user-gesture write, not a permission
  request; W-25 confirms it still copies inside the shell (best-effort, the app's toast shows the
  command regardless).
* Window state (`bounds`, `isMaximized`) is written to `userData/window-state.json` on move/resize
  (debounced 500 ms) and on close, and restored only when the bounds intersect a current display;
  otherwise 1280x800 centered.
* Closing the window quits the app: window-only, no tray in the MVP (Q4). No IPC channel exists in
  the MVP besides the test hook (C-10).

### C-4 Navigation allowlist

* Allowed origins = `new URL(appUrl).origin` and `new URL(supabaseUrl).origin`. `will-navigate` to
  anything else is prevented; if the URL is `http(s)` it goes to `shell.openExternal`, otherwise it
  is dropped and logged. `setWindowOpenHandler` always returns `{ action: 'deny' }` and forwards
  `http(s)` URLs the same way, which is how Materials' signed Storage URLs reach the default
  browser (R-23).
* No `will-download` handler: Chromium's default save behaviour stands (R-23: no download
  interception).

### C-5 Session

* Login is the web app's own `/login` page inside the window. `@supabase/ssr` 0.12.7 writes
  `sb-goultdzqcavefcgnifdy-auth-token` (chunked `.0`, `.1`, ... above ~3 KB) with its default
  `Max-Age` of 400 days, so the `persist:` partition keeps it across restarts. The e2e suite asserts
  the cookie carries an `expirationDate`.
* `session.ts` reads that cookie set from the partition, joins the chunks in order, strips the
  `base64-` prefix, decodes the JSON and returns `{ accessToken, expiresAt }` **in memory only**.
  Main never writes a token to disk or to a log, and **main never refreshes**: refresh-token
  rotation stays the renderer's. If `expiresAt` has passed the poller skips the tick and retries on
  the next one (the page refreshes itself while loaded, including when minimized).
* `safeStorage` is therefore not load-bearing in the MVP. It becomes so only if Q2 picks an own
  token; `secret.ts` is written and unit-tested either way so the mirror (C-9) can use it.

### C-6 PostgREST reads

`rest.ts`: `GET ${supabaseUrl}/rest/v1/<relation>?<query>` with `apikey` and `Authorization: Bearer
<accessToken>`; 10 s timeout; a non-2xx is a typed error, logged once per relation per hour, never a
toast. Every row set is schema-validated before use. The four reads, frozen:

| id | relation | query | used by |
|---|---|---|---|
| R1 | `v_sync_status` | `select=id,run_id,status,started_at,finished_at,trigger,summary` (one row) | sync landed |
| R2 | `v_gradebook_history` | `seen_at=gt.<lastSeenAt>&score=not.is.null&select=shell_course_id,column_id,name,run_id,seen_at,score,possible,previous_score&order=seen_at.asc&limit=200` | grade posted |
| R3 | `v_work_items` | `due_on=eq.<tomorrow>&in_workload=is.true&status=not.in.(submitted,graded,missed,excused,not_applicable,waived)&select=item_kind,item_id,course_id,title,due_at,due_on,status` | due tomorrow |
| R4 | `agent_requests` | `kind=eq.sync&state=eq.queued&select=id,created_at&order=id.desc&limit=1` | Sync button |

Plus `courses?select=id,title_short` once per launch for labels. Course ids are `courses.id`
(`IST.323`, `GEO.103.lecture`, ...); `v_gradebook_history.shell_course_id` is one of them.

### C-7 Notifications (R-26)

**Scheduler.** A tick runs at launch (once the session is readable), every `pollIntervalMinutes`,
on window focus (at most once per 60 s) and on `powerMonitor` `resume`. A tick = R1 + R2 (+ R3
when due) -> reducer -> toasts -> watermark write. Ticks never overlap; a tick that cannot read the
session or any relation completely changes nothing.

**Watermark** `userData/notify-watermark.json`: `{ version: 1, lastSeenAt: <ISO>, dueCheckedOn:
<YYYY-MM-DD> | null, firedKeys: string[] }` (newest 500 keys kept), written atomically (tmp +
rename). On first launch `lastSeenAt = now`, so nothing historical fires.

**Reducer** (`reducer.ts`, pure, >= 90 % covered):
`reduce({ sync, grades, due, now, watermark, courses }) -> { toasts, watermark }`,
`Toast = { key, title, body, route }`. Rules:

1. **Sync landed** -- key `sync:<id>`. Fires when R1's row has `finished_at > lastSeenAt` and
   `status in (ok, partial, failed)`. N = length of `summary.changes`. Title `Sync landed · N
   change(s)`, or `Sync landed · no changes`, or `Sync failed` (body = `summary.errors[0]`). Body:
   the first three `summary.changes` lines. Route `/inbox` when `summary.attention_raised > 0`,
   else `/`.
2. **Grade posted** -- key `grade:<shell_course_id>:<column_id>:<run_id>`. Up to three new rows in
   one tick -> one toast each: title `<title_short> · <name>`, body `<score> / <possible>` plus
   `was <previous_score>` when not null; route `/course/<shell_course_id>/grades`. Four or more
   rows in one tick coalesce per shell course: `<title_short> · N grades posted`, same route.
3. **Due tomorrow** -- key `due:<YYYY-MM-DD>`, one per day. Runs on the first tick at or after
   `dueReminderTime` New York on a date not equal to `dueCheckedOn`; "tomorrow" is the New York
   calendar date plus one. Zero rows -> no toast, the date is still recorded. Title `Due tomorrow ·
   N item(s)`, body up to three `<title_short> · <title>` lines; route `/`.
4. A key in `firedKeys` never fires again. `lastSeenAt` advances to the tick's start time only after
   the toasts were shown and the file written; a crash between the two re-fires at most one tick's
   worth, deduped by key.

**Delivery.** `new Notification({ title, body })`; `click` -> `deeplink.navigate(route)` = restore +
focus + `loadURL(new URL(route, appUrl))`, with `route` validated against
`^/(|inbox|grades|planner|announcements|course/[A-Z]{3}\.\d{3}(\.[a-z]+)?/(grades|stream|classwork|info))(\?[\w=&:%.-]*)?$`.
Click-only for the MVP (Q6). Under `BB2DASH_TEST=1` the wrapper records instead of showing.

### C-8 Sync button (R-13 / R-23), zero renderer changes

The web app's Sync button already inserts the `agent_requests` row and copies the command; the
shell's job is to notice that insert and open the terminal.

* **Detection:** `session.webRequest.onCompleted({ urls: [supabaseUrl + '/rest/v1/agent_requests*'] })`
  filtered to `method === 'POST'` with a 2xx status -> R4 -> if the newest queued sync row's id is
  not in `firedKeys` under `syncterm:<id>`, spawn the terminal and record the key. A second press
  while a request is open makes no POST (the button re-copies), so no second terminal; the command
  is on the clipboard and in the app's own toast as today.
* **Spawn** (argv array, `detached: true`, `stdio: 'ignore'`, `unref()`; never a shell string):

  ```
  <wt> -d <repoDir> --title "bb-sync <id>" powershell.exe -NoExit -NoLogo -ExecutionPolicy Bypass -Command "<init>"
  ```

  `<wt>` = `%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe` when it exists, else `wt.exe` on PATH, else
  `powershell.exe` alone with `Set-Location '<repoDir>'; <init>`. `pwsh` is **not** installed on
  Stack's laptop (checked 2026-09-16); Windows PowerShell 5.1 is the host.
* **`<init>` types the command without running it** (Stack: "typed for me"), through PSReadLine:
  `Register-EngineEvent PowerShell.OnIdle -MaxTriggerCount 1 -Action {
  [Microsoft.PowerShell.PSConsoleReadLine]::Insert('claude "/bb-sync <id>"') }`. If PSReadLine is
  missing the init prints the command and `Set-Clipboard`s it. W-25 proves the prefilled line on
  this machine and puts a screenshot in the verification note (Q9 can flip this to run-immediately).
* `<id>` must match `^\d{1,12}$` before any argv is built; a malformed id is rejected and logged
  (test-asserted, DoD).

### C-9 File mirror (post-MVP task 12, W-27; frozen now so the shell leaves room for it)

* **Root:** `mirrorRoot` in config, default
  `C:\Users\estac\OneDrive - Syracuse University\.fall2026\.projects2026\bb2dash\course context`,
  where the harvested tree already lives (71 files on 2026-09-16; Q7). The repo's gitignored
  `course context/` is never a target.
* **Source:** `v_file_layout` joined to `bb_files` (`sha256`, `bytes`, `superseded_by`) for rows with
  `storage_path not null`; the path under the root is `local_relpath` minus its `course context/`
  prefix. `my_submissions` rows (pulled-back and Stack's staged uploads alike) come through the same
  path, so R-23(a)'s two halves are one job.
* **Fetch:** `POST /storage/v1/object/sign/bb-files/<key>` (60 s) then GET, as `web/` does; the
  owner's Storage policy (migration 020) covers it.
* **Write:** `<root>/<relpath>.part` -> sha256 -> must equal `bb_files.sha256` -> `rename` into place.
  Mismatch -> `.part` deleted, row reported. An existing file with the same hash is skipped; an
  existing file with a different hash is **left alone** and reported, never overwritten. Every
  target path is resolved and must start with the root; a relpath containing `..`, a drive letter,
  a `:` or a reserved device name is rejected (test).
* **Trigger:** after a *sync landed* toast, at launch, and every 6 h. Result in
  `userData/mirror-report.json`, plus one coalesced toast when anything failed. No DB writes:
  `bb_files.local_path` stays the skills' column.
* **Absent:** `shell.openPath`, file watching, deletion (a file removed from Storage stays on disk).

### C-10 Build, run, test

* `npm run pack` -> `desktop/dist/win-unpacked/bb2dash.exe`. `desktop/README.md`: prerequisites
  (Node 24, `npm ci`), the config file, `scripts/make-shortcut.ps1` (Desktop shortcut; and a Start
  Menu `.lnk` carrying `System.AppUserModel.ID = su.stack.bb2dash` if the clean-profile smoke shows
  toasts need it). No installer, no signing, no auto-update.
* **Tests.** vitest (`test/unit`): config schema, cookie decoding (chunked and single), reducer,
  watermark round-trip, deeplink validation, terminal argv + id rejection, mirror path safety,
  the credential audit. Playwright for Electron (`test/e2e`) launches `dist/main/index.js` with
  `BB2DASH_TEST=1` and `BB2DASH_APP_URL=<local static fixture page>`; asserts the window opens, the
  `webPreferences` flags, a second launch focuses the first, the cookie survives a relaunch, the
  recorded toasts and the recorded spawn argv. The test hook `globalThis.__bb2dashTest` (defined only
  under `BB2DASH_TEST=1`) exposes `recorded()` and `tick(fixture)` for `electronApp.evaluate`. No
  test touches `*.supabase.co`.
* **Logs.** Rolling file `userData/logs/main.log`; a redaction test proves no bearer token or cookie
  value is ever written.

### C-11 Migrations and seams

None expected. 073-079 stay reserved and unused unless a worker proves a view lacks a column; then
one additive migration, dry-run in `begin; ... rollback;`, applied under the file's name,
byte-identical. No other phase is in flight; Phase 13 touches `web/` only.

### Residual assumptions (PM's calls; stand unless Stack contradicts them)

* A `failed` or `partial` sync toasts like a landed one, with its error line.
* Readings with a due date count as "due tomorrow" items, the same as assignments (`v_work_items`).
* A grade toast follows `v_gradebook_history`'s own rule: first observation of a score, or a score
  that differs from the run before.
* R-26's "web app shows the same as an in-app toast/list" is not this phase: `web/` is untouched.
* The taskbar icon is a placeholder glyph until Phase 13.
* The PM writes the exported signatures of `rest.ts` and `session.ts` (types only) into the phase
  branch before worker branches are cut, so W-26 builds against them from day one.

### Stack's answers (2026-09-16) and the Contract amendments they make

| # | Answer | Amendment |
|---|---|---|
| Q1 | Launch at login **out**. | `launchAtLogin` is removed from C-2; no `setLoginItemSettings` call anywhere. |
| Q2 | Recommendation. | C-5 stands: the poller reads the web session's cookie; nothing on disk; main never refreshes. |
| Q3 | Longer cadence if it makes this less intensive. | `pollIntervalMinutes` default **15** (was 5); still a tick on launch, on window focus (once per 60 s at most), on power resume and on the tray's *Check now*. One tick is three small PostgREST reads, so the interval is the whole cost. |
| Q4 | **Tray: yes for the MVP; use the Google icon** (a PNG in Downloads). | New C-12 below. The icon is `eclipse-ring-120.png` (Downloads, 2026-09-15 16:50, the logo used for the Google consent screen), committed as `desktop/build/icon.png`; W-25 derives `icon.ico` (16/32/48/256, upscaled from 120 px) and the 16 px tray image from it. If that is the wrong file, Stack drops the right PNG at the same path. |
| Q5 | Recommendation. | C-7 rule 3 stands: one "due tomorrow" check a day at `dueReminderTime` = 18:00 New York. |
| Q6 | Recommendation. | Click-only toasts. |
| Q7 | Mirroring to OneDrive could be unnecessary. The project's future direction now includes migrating from local to **Docker** once development completes, so that it can be moved. | The file mirror is **dropped from Phase 12** (C-9 is withdrawn; W-27 is not spawned; task 12 is struck). The portability direction is recorded as **R-28** in `60_REQUIREMENTS_v2.md`, a DECISIONS row, and C-13 below, which shapes how this phase's code is split. |
| Q8 | Recommendation. | Moot with Q7: one PR for the phase. |
| Q9 | Can the shell run the command in the Claude session itself, portably to Docker later? | **Yes.** C-8 changes from *typed* to *run*: the terminal starts and immediately runs `claude "/bb-sync <id>"`, so the Claude session opens with the skill already going; Stack only watches and answers the skill's prompts (its step 1 stops on an expired Blackboard session, as today). The command is built by one pure function in `src/core/sync-command.ts` (`{ repoDir, id } -> argv`) so the container variant later is a one-file swap (C-13). |

#### C-8 (amended) Sync button runs the command

Detection is unchanged (`webRequest.onCompleted` on the renderer's own `POST /rest/v1/agent_requests`,
then R4, deduped by `syncterm:<id>`). Spawn (argv array, `detached`, `stdio: 'ignore'`, `unref()`):

```
<wt> -d <repoDir> --title "bb-sync <id>" powershell.exe -NoExit -NoLogo -ExecutionPolicy Bypass -Command "claude '/bb-sync <id>'"
```

`-NoExit` keeps the tab open when the session ends so the skill's report stays readable. `<wt>`
resolution and the `powershell.exe` fallback are as before; `<id>` still matches `^\d{1,12}# Phase 12 — Electron shell: window, notifications, Sync button

Date: 2026-09-14 (brief); Contract frozen 2026-09-16 (PM session) with Stack's answers Q1–Q9 the same evening. Product manager: Stack. Requirements: R-23 (MVP subset),
R-26 (desktop) from `60_REQUIREMENTS_v2.md`. Phase branch `feat/electron-12`, one PR. **After
Phase 10a and 11 are on `main`** and after the week-11 exams. No migrations expected; if one is
needed (a notifications outbox), take it from 070–079.

## Why

Stack wants bb2dash to be an app on his taskbar, not a tab, and wants it to tell him things
without being open: a sync landed, a grade posted, something is due tomorrow. The web app stays
the product; Electron is a thin shell around the deployed site plus the local jobs a browser
cannot do.

## Stack's decisions (2026-09-14, `70_MVP_INDEX.md` §1.7)

* MVP jobs: **own window + taskbar icon + single instance** (loads the deployed web app;
  session in `safeStorage`); **desktop notifications for all three R-26 triggers** (sync landed
  with N changes, grade posted, item due tomorrow); **Sync button** that opens Windows Terminal
  in the repo with `claude "/bb-sync <id>"` ready.
* **Not in the MVP:** the OneDrive file mirror. It is the first post-MVP task of this phase.
* No crawl inside Electron, no Blackboard webview, no `shell.openPath` from the mirror, no
  installer, no code signing, no auto-update. Unpacked build + shortcut, Windows 11 only.

## MVP (in Stack's words)

Double-click a shortcut; bb2dash opens in its own window with its own taskbar icon and I am
still signed in. A second double-click focuses that window instead of opening another. When a
sync lands, a grade posts, or something is due tomorrow, Windows shows a notification that opens
the right screen when clicked. The Sync button opens a terminal with the sync command typed for
me.

## Contract (frozen 2026-09-16 by the PM session; Stack's answers to §Open questions are appended when given)

Everything below is what the workers build to. Names, files, queries and keys are fixed; a worker
who needs to change one writes it up as a numbered note in the verification file and the PM
decides. Zero changes under `web/`: `git diff --stat origin/main -- web/` on the phase branch is
empty (DoD). The Vercel project's Root Directory is `web`, so nothing under `desktop/` deploys.

### C-1 Package and layout

`desktop/` is a standalone npm package (`bb2dash-desktop`, private), TypeScript, Electron pinned to
the current stable at kickoff (the worker records the version in `desktop/README.md` and a
DECISIONS row). Frozen file names:

```
desktop/
  package.json                scripts: build (tsc), start, test (vitest), test:e2e (playwright), pack (electron-builder --dir)
  tsconfig.json
  electron-builder.yml        win target "dir"; appId su.stack.bb2dash; productName bb2dash; icon build/icon.ico
  build/icon.ico              placeholder glyph; the real icon is Phase 13's (C-3 carried item)
  src/main/index.ts           bootstrap: AUMID, single-instance lock, config, window, poller, sync watcher
  src/main/config.ts          schema + defaults + load of userData/config.json
  src/main/window.ts          BrowserWindow factory; window-state persistence
  src/main/navigation.ts      will-navigate allowlist, setWindowOpenHandler, openExternal
  src/main/session.ts         read the web session's access token from the partition's cookies
  src/main/secret.ts          safeStorage encrypt/decrypt helper (unit-tested; unused by the MVP, see C-5)
  src/main/rest.ts            one PostgREST GET helper (anon key + bearer), rows schema-validated
  src/main/deeplink.ts        route allowlist + navigate the window
  src/main/notify.ts          Notification wrapper; recorder under BB2DASH_TEST
  src/main/sync-terminal.ts   agent_requests insert watcher + wt.exe spawn; recorder under BB2DASH_TEST
  src/main/poller/scheduler.ts  timers, focus, power resume; ticks never overlap
  src/main/poller/sources.ts    the three reads (sync, grade, due) -> candidates
  src/main/poller/reducer.ts    pure: candidates + watermark -> toasts + next watermark
  src/main/poller/watermark.ts  userData/notify-watermark.json, atomic write
  src/main/mirror/              post-MVP (C-9); empty until W-27
  src/preload/index.ts        contextBridge exposes `bb2dashDesktop = Object.freeze({ version })` and nothing else
  scripts/make-shortcut.ps1   Desktop + Start Menu shortcut (C-10)
  test/unit/*.test.ts         vitest
  test/e2e/*.spec.ts          Playwright for Electron
  README.md
```

### C-2 Config

`config.json` in `app.getPath('userData')` (`%APPDATA%\bb2dash\config.json`), validated at startup
by a schema (zod); a bad file stops the app with a dialog naming the field. `desktop/README.md`
ships the example.

| key | default | meaning |
|---|---|---|
| `appUrl` | `https://web-xi-ten-uy9xk6c6p0.vercel.app` | the deployed web app; the only app origin the window may navigate to |
| `supabaseUrl` | `https://goultdzqcavefcgnifdy.supabase.co` | PostgREST + Storage; the second allowed origin (auth redirects, signed URLs) |
| `supabaseAnonKey` | required | the legacy anon JWT, the same value `web/` ships client-side |
| `repoDir` | `C:\Users\estac\projects\bb2dash` | cwd for the sync terminal: the `main` checkout, where `/bb-sync` runs |
| `pollIntervalMinutes` | `5` | poller cadence while the app runs (Q3) |
| `dueReminderTime` | `18:00` | New York wall-clock time the "due tomorrow" check runs once a day (Q5) |
| `launchAtLogin` | `false` | applied with `app.setLoginItemSettings` at startup (Q1) |
| `mirrorRoot` | see C-9 | post-MVP |

Secrets: the anon key is the only credential anywhere in `desktop/`; RLS is the boundary, as in
`web/`. `test/unit/audit.test.ts` greps `desktop/src` and `desktop/test` for `service_role` and
`sb_secret` on every run (copy of `web/test/audits.test.ts`).

### C-3 Process, window, single instance

* `app.setAppUserModelId('su.stack.bb2dash')` before `ready`; `app.requestSingleInstanceLock()` is
  the first call in `index.ts`, `app.quit()` when it fails; `second-instance` restores a minimized
  window and calls `focus()` (inside `setImmediate`, per the research quirk).
* One `BrowserWindow`, `webPreferences: { partition: 'persist:bb2dash', preload, nodeIntegration:
  false, contextIsolation: true, sandbox: true, webSecurity: true }`, `loadURL(appUrl)`.
  `session.setPermissionRequestHandler` denies every request: the renderer needs no OS permission
  (toasts are main's). The Sync button's clipboard write is a user-gesture write, not a permission
  request; W-25 confirms it still copies inside the shell (best-effort, the app's toast shows the
  command regardless).
* Window state (`bounds`, `isMaximized`) is written to `userData/window-state.json` on move/resize
  (debounced 500 ms) and on close, and restored only when the bounds intersect a current display;
  otherwise 1280x800 centered.
* Closing the window quits the app: window-only, no tray in the MVP (Q4). No IPC channel exists in
  the MVP besides the test hook (C-10).

### C-4 Navigation allowlist

* Allowed origins = `new URL(appUrl).origin` and `new URL(supabaseUrl).origin`. `will-navigate` to
  anything else is prevented; if the URL is `http(s)` it goes to `shell.openExternal`, otherwise it
  is dropped and logged. `setWindowOpenHandler` always returns `{ action: 'deny' }` and forwards
  `http(s)` URLs the same way, which is how Materials' signed Storage URLs reach the default
  browser (R-23).
* No `will-download` handler: Chromium's default save behaviour stands (R-23: no download
  interception).

### C-5 Session

* Login is the web app's own `/login` page inside the window. `@supabase/ssr` 0.12.7 writes
  `sb-goultdzqcavefcgnifdy-auth-token` (chunked `.0`, `.1`, ... above ~3 KB) with its default
  `Max-Age` of 400 days, so the `persist:` partition keeps it across restarts. The e2e suite asserts
  the cookie carries an `expirationDate`.
* `session.ts` reads that cookie set from the partition, joins the chunks in order, strips the
  `base64-` prefix, decodes the JSON and returns `{ accessToken, expiresAt }` **in memory only**.
  Main never writes a token to disk or to a log, and **main never refreshes**: refresh-token
  rotation stays the renderer's. If `expiresAt` has passed the poller skips the tick and retries on
  the next one (the page refreshes itself while loaded, including when minimized).
* `safeStorage` is therefore not load-bearing in the MVP. It becomes so only if Q2 picks an own
  token; `secret.ts` is written and unit-tested either way so the mirror (C-9) can use it.

### C-6 PostgREST reads

`rest.ts`: `GET ${supabaseUrl}/rest/v1/<relation>?<query>` with `apikey` and `Authorization: Bearer
<accessToken>`; 10 s timeout; a non-2xx is a typed error, logged once per relation per hour, never a
toast. Every row set is schema-validated before use. The four reads, frozen:

| id | relation | query | used by |
|---|---|---|---|
| R1 | `v_sync_status` | `select=id,run_id,status,started_at,finished_at,trigger,summary` (one row) | sync landed |
| R2 | `v_gradebook_history` | `seen_at=gt.<lastSeenAt>&score=not.is.null&select=shell_course_id,column_id,name,run_id,seen_at,score,possible,previous_score&order=seen_at.asc&limit=200` | grade posted |
| R3 | `v_work_items` | `due_on=eq.<tomorrow>&in_workload=is.true&status=not.in.(submitted,graded,missed,excused,not_applicable,waived)&select=item_kind,item_id,course_id,title,due_at,due_on,status` | due tomorrow |
| R4 | `agent_requests` | `kind=eq.sync&state=eq.queued&select=id,created_at&order=id.desc&limit=1` | Sync button |

Plus `courses?select=id,title_short` once per launch for labels. Course ids are `courses.id`
(`IST.323`, `GEO.103.lecture`, ...); `v_gradebook_history.shell_course_id` is one of them.

### C-7 Notifications (R-26)

**Scheduler.** A tick runs at launch (once the session is readable), every `pollIntervalMinutes`,
on window focus (at most once per 60 s) and on `powerMonitor` `resume`. A tick = R1 + R2 (+ R3
when due) -> reducer -> toasts -> watermark write. Ticks never overlap; a tick that cannot read the
session or any relation completely changes nothing.

**Watermark** `userData/notify-watermark.json`: `{ version: 1, lastSeenAt: <ISO>, dueCheckedOn:
<YYYY-MM-DD> | null, firedKeys: string[] }` (newest 500 keys kept), written atomically (tmp +
rename). On first launch `lastSeenAt = now`, so nothing historical fires.

**Reducer** (`reducer.ts`, pure, >= 90 % covered):
`reduce({ sync, grades, due, now, watermark, courses }) -> { toasts, watermark }`,
`Toast = { key, title, body, route }`. Rules:

1. **Sync landed** -- key `sync:<id>`. Fires when R1's row has `finished_at > lastSeenAt` and
   `status in (ok, partial, failed)`. N = length of `summary.changes`. Title `Sync landed · N
   change(s)`, or `Sync landed · no changes`, or `Sync failed` (body = `summary.errors[0]`). Body:
   the first three `summary.changes` lines. Route `/inbox` when `summary.attention_raised > 0`,
   else `/`.
2. **Grade posted** -- key `grade:<shell_course_id>:<column_id>:<run_id>`. Up to three new rows in
   one tick -> one toast each: title `<title_short> · <name>`, body `<score> / <possible>` plus
   `was <previous_score>` when not null; route `/course/<shell_course_id>/grades`. Four or more
   rows in one tick coalesce per shell course: `<title_short> · N grades posted`, same route.
3. **Due tomorrow** -- key `due:<YYYY-MM-DD>`, one per day. Runs on the first tick at or after
   `dueReminderTime` New York on a date not equal to `dueCheckedOn`; "tomorrow" is the New York
   calendar date plus one. Zero rows -> no toast, the date is still recorded. Title `Due tomorrow ·
   N item(s)`, body up to three `<title_short> · <title>` lines; route `/`.
4. A key in `firedKeys` never fires again. `lastSeenAt` advances to the tick's start time only after
   the toasts were shown and the file written; a crash between the two re-fires at most one tick's
   worth, deduped by key.

**Delivery.** `new Notification({ title, body })`; `click` -> `deeplink.navigate(route)` = restore +
focus + `loadURL(new URL(route, appUrl))`, with `route` validated against
`^/(|inbox|grades|planner|announcements|course/[A-Z]{3}\.\d{3}(\.[a-z]+)?/(grades|stream|classwork|info))(\?[\w=&:%.-]*)?$`.
Click-only for the MVP (Q6). Under `BB2DASH_TEST=1` the wrapper records instead of showing.

### C-8 Sync button (R-13 / R-23), zero renderer changes

The web app's Sync button already inserts the `agent_requests` row and copies the command; the
shell's job is to notice that insert and open the terminal.

* **Detection:** `session.webRequest.onCompleted({ urls: [supabaseUrl + '/rest/v1/agent_requests*'] })`
  filtered to `method === 'POST'` with a 2xx status -> R4 -> if the newest queued sync row's id is
  not in `firedKeys` under `syncterm:<id>`, spawn the terminal and record the key. A second press
  while a request is open makes no POST (the button re-copies), so no second terminal; the command
  is on the clipboard and in the app's own toast as today.
* **Spawn** (argv array, `detached: true`, `stdio: 'ignore'`, `unref()`; never a shell string):

  ```
  <wt> -d <repoDir> --title "bb-sync <id>" powershell.exe -NoExit -NoLogo -ExecutionPolicy Bypass -Command "<init>"
  ```

  `<wt>` = `%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe` when it exists, else `wt.exe` on PATH, else
  `powershell.exe` alone with `Set-Location '<repoDir>'; <init>`. `pwsh` is **not** installed on
  Stack's laptop (checked 2026-09-16); Windows PowerShell 5.1 is the host.
* **`<init>` types the command without running it** (Stack: "typed for me"), through PSReadLine:
  `Register-EngineEvent PowerShell.OnIdle -MaxTriggerCount 1 -Action {
  [Microsoft.PowerShell.PSConsoleReadLine]::Insert('claude "/bb-sync <id>"') }`. If PSReadLine is
  missing the init prints the command and `Set-Clipboard`s it. W-25 proves the prefilled line on
  this machine and puts a screenshot in the verification note (Q9 can flip this to run-immediately).
* `<id>` must match `^\d{1,12}$` before any argv is built; a malformed id is rejected and logged
  (test-asserted, DoD).

### C-9 File mirror (post-MVP task 12, W-27; frozen now so the shell leaves room for it)

* **Root:** `mirrorRoot` in config, default
  `C:\Users\estac\OneDrive - Syracuse University\.fall2026\.projects2026\bb2dash\course context`,
  where the harvested tree already lives (71 files on 2026-09-16; Q7). The repo's gitignored
  `course context/` is never a target.
* **Source:** `v_file_layout` joined to `bb_files` (`sha256`, `bytes`, `superseded_by`) for rows with
  `storage_path not null`; the path under the root is `local_relpath` minus its `course context/`
  prefix. `my_submissions` rows (pulled-back and Stack's staged uploads alike) come through the same
  path, so R-23(a)'s two halves are one job.
* **Fetch:** `POST /storage/v1/object/sign/bb-files/<key>` (60 s) then GET, as `web/` does; the
  owner's Storage policy (migration 020) covers it.
* **Write:** `<root>/<relpath>.part` -> sha256 -> must equal `bb_files.sha256` -> `rename` into place.
  Mismatch -> `.part` deleted, row reported. An existing file with the same hash is skipped; an
  existing file with a different hash is **left alone** and reported, never overwritten. Every
  target path is resolved and must start with the root; a relpath containing `..`, a drive letter,
  a `:` or a reserved device name is rejected (test).
* **Trigger:** after a *sync landed* toast, at launch, and every 6 h. Result in
  `userData/mirror-report.json`, plus one coalesced toast when anything failed. No DB writes:
  `bb_files.local_path` stays the skills' column.
* **Absent:** `shell.openPath`, file watching, deletion (a file removed from Storage stays on disk).

### C-10 Build, run, test

* `npm run pack` -> `desktop/dist/win-unpacked/bb2dash.exe`. `desktop/README.md`: prerequisites
  (Node 24, `npm ci`), the config file, `scripts/make-shortcut.ps1` (Desktop shortcut; and a Start
  Menu `.lnk` carrying `System.AppUserModel.ID = su.stack.bb2dash` if the clean-profile smoke shows
  toasts need it). No installer, no signing, no auto-update.
* **Tests.** vitest (`test/unit`): config schema, cookie decoding (chunked and single), reducer,
  watermark round-trip, deeplink validation, terminal argv + id rejection, mirror path safety,
  the credential audit. Playwright for Electron (`test/e2e`) launches `dist/main/index.js` with
  `BB2DASH_TEST=1` and `BB2DASH_APP_URL=<local static fixture page>`; asserts the window opens, the
  `webPreferences` flags, a second launch focuses the first, the cookie survives a relaunch, the
  recorded toasts and the recorded spawn argv. The test hook `globalThis.__bb2dashTest` (defined only
  under `BB2DASH_TEST=1`) exposes `recorded()` and `tick(fixture)` for `electronApp.evaluate`. No
  test touches `*.supabase.co`.
* **Logs.** Rolling file `userData/logs/main.log`; a redaction test proves no bearer token or cookie
  value is ever written.

### C-11 Migrations and seams

None expected. 073-079 stay reserved and unused unless a worker proves a view lacks a column; then
one additive migration, dry-run in `begin; ... rollback;`, applied under the file's name,
byte-identical. No other phase is in flight; Phase 13 touches `web/` only.

### Residual assumptions (PM's calls; stand unless Stack contradicts them)

* A `failed` or `partial` sync toasts like a landed one, with its error line.
* Readings with a due date count as "due tomorrow" items, the same as assignments (`v_work_items`).
* A grade toast follows `v_gradebook_history`'s own rule: first observation of a score, or a score
  that differs from the run before.
* R-26's "web app shows the same as an in-app toast/list" is not this phase: `web/` is untouched.
* The taskbar icon is a placeholder glyph until Phase 13.
* The PM writes the exported signatures of `rest.ts` and `session.ts` (types only) into the phase
  branch before worker branches are cut, so W-26 builds against them from day one.

 before
any argv exists. The PSReadLine prefill is gone.

#### C-12 Tray (replaces the window-only rule in C-3)

* A `Tray` with the 16 px icon, tooltip `bb2dash`; left-click shows and focuses the window; context
  menu: **Open bb2dash**, **Check now** (runs one poller tick), **Quit**.
* Closing the window **hides it** (`win.hide()`); the app keeps running and polling. `Quit` from the
  tray, or a `before-quit`, is the only exit. `second-instance` shows the window as before.
* The window is created once and reused; `deeplink.navigate` shows it if hidden.
* e2e: close → process still alive and `BrowserWindow.getAllWindows()[0].isVisible() === false`;
  tray *Check now* records one tick under `BB2DASH_TEST=1`.

#### C-13 Portability split (R-28)

`desktop/src/core/` is plain Node with **no `electron` import** (a unit test greps every file under
`core/` and fails on `from 'electron'`). It holds everything that would run inside a container later:
`config` schema, `rest`, `session-decode` (cookie strings in, token out), `poller/{sources,reducer,
watermark}` behind a `WatermarkStore` interface, `sync-command` (argv builder), and two interfaces,
`Notifier { show(toast) }` and `Launcher { spawn(argv, cwd) }`. `desktop/src/main/` is the Electron
adapter: cookies from the partition, `Notification`, `child_process.spawn`, `Tray`, `BrowserWindow`.
Nothing in `core/` reads the filesystem except through `WatermarkStore`. A container later supplies
a token from the environment, a webhook or ntfy `Notifier`, and a `Launcher` that runs `claude -p`;
that is the whole port. The Blackboard crawl inside `/bb-sync` needs a logged-in browser (NetID +
Duo), which is the open problem of that migration and not this phase's.

## Definition of done

Source: Stack's answers (`70_MVP_INDEX.md` §1.7) + research `research/77_RESEARCH_phase12_electron.md` §5.

- [ ] **Stack's acceptance script (on his laptop, from the unpacked build):** (1) double-click
      the shortcut: bb2dash opens in its own window with its own taskbar button, signed in;
      (2) double-click again: the same window is focused, no second process; (3) close and
      reopen: still signed in; (4) trigger a sync and receive one "sync landed with N changes"
      toast with the right N; (5) receive a "grade posted" and a "due tomorrow" toast naming
      course + item, and clicking each raises the window on the right screen; (6) the Sync button
      opens Windows Terminal in the repo with the sync command prefilled. All six ticked.
- [ ] Single instance: launching twice focuses the existing window; one taskbar button, one
      process (Playwright-for-Electron test).
- [ ] Test asserts `webPreferences`: `nodeIntegration` off, `contextIsolation` on, `sandbox` on;
      external links open in the default browser; `will-navigate` allowlist enforced.
- [ ] Session persistence: Supabase auth cookies carry a Max-Age (Electron's cookie store keeps
      only persistent cookies across restarts and is not DPAPI-encrypted); any main-held token
      round-trips through `safeStorage`; no token in the renderer or logs.
- [ ] Closing the window hides it to the tray; polling continues; *Quit* is the only exit (C-12, e2e).
- [ ] Notification source is a main-process **poller** with a stable-key / `lastSeenAt`
      watermark on disk (Realtime is for on-screen data, not background events, and sockets die
      across sleep); restarting the poller fires no duplicate toast (watermark test).
- [ ] The three toasts fire once each with the correct payload (test hook asserts); toasts are
      click-only for the MVP (action buttons need a ToastActivatorCLSID shortcut); a correct
      AppUserModelID is set (otherwise toasts fail silently).
- [ ] Sync button opens Windows Terminal (`wt.exe`), cwd = repo, and **runs** `claude "/bb-sync <id>"`
      (C-8 amended); a malformed id is rejected before spawn (test).
- [ ] `desktop/src/core/` imports nothing from `electron` (C-13, test).
- [ ] Playwright-for-Electron suite green; reducer unit tests ≥ 80 %.
- [ ] Clean-profile Windows 11 smoke: the SmartScreen path screenshotted; the app runs after
      "Run anyway"; shortcut-creation steps written in `desktop/README.md`.
- [ ] Absent by inspection (grep): no crawl, no `shell.openPath`, no download interception, no
      auto-updater, no mirror code (the mirror left the phase with Q7).
- [ ] SOP gates: `/code-review main high` HIGH cleared; `/security-review` over the IPC
      surface, the spawn, and token storage; STATUS + DECISIONS + ORCHESTRATOR updated.

## Task loops

| # | task | executable check | demo line (Stack) | owner |
|---|---|---|---|---|
| 1 | Freeze the Contract; put the open questions to Stack | answers recorded | — | PM session |
| 2 | `desktop/` package, window, single-instance lock, AppUserModelID | Playwright: second launch focuses; one process | "one icon, one window" | W-25 |
| 3 | Secure `webPreferences` + navigation allowlist | test asserts flags; external link opens browser | — | W-25 |
| 4 | Session persistence (cookie Max-Age, `safeStorage`) | restart test: still signed in; no token in logs | "I reopen and I am still in" | W-25 |
| 5 | Sync button → `wt.exe` runs `claude "/bb-sync <id>"` after the app filed the row | spawn test with id validation | "the terminal opens and the sync is already running" | W-25 |
| 5b | Tray: hide on close, Open / Check now / Quit, icon from `build/icon.png` | e2e: hidden window, live process, recorded tick | "it stays in the tray" | W-25 |
| 6 | Poller + watermark on disk | unit tests: dedup across restart | — | W-26 |
| 7 | Toast: sync landed with N | test hook asserts payload once | "I get told when a sync lands" | W-26 |
| 8 | Toasts: grade posted, due tomorrow (clock trigger) | tests; click raises the right screen | "I get told about a grade and a due item" | W-26 |
| 9 | Unpacked build + README + clean-profile smoke | build artefact runs; SmartScreen screenshot | — | W-25 |
| 10 | Gates + docs | SOP list | — | PM session |
| 11 | **Stack's acceptance script** | — | the six steps above | Stack |
| ~~12~~ | ~~Post-MVP: file mirror~~ — dropped 2026-09-16 (Q7; see R-28) | — | — | — |

## Post-MVP task

None. The file mirror was dropped on 2026-09-16 (Q7): Stack's direction is a container migration
after development (R-28), where a OneDrive mirror has no place. C-9 stays in the text as the
withdrawn design, in case a mirror is wanted again.

## Out of scope

Renderer changes (the web app is untouched), macOS/Linux, installer, auto-update, crawl, file
mirror (Q7), launch at login (Q1).

## Workers

Numbers continue from Phase 11b (W-23, W-24). One branch and worktree each, cut from
`feat/electron-12` after the brief is committed; commit and push per task.

* **W-25 shell** (`feat/electron-12-shell`, `bb2dash-wt-electron-12-shell`): C-1 to C-6, C-8,
  C-10 (build, README, clean-profile smoke), C-12 tray, C-13 split. Owns `config.ts`, `session.ts`, `rest.ts`,
  `secret.ts`, `navigation.ts`, `window.ts`, `sync-terminal.ts`; pushes the first three on day one.
* **W-26 notifications** (`feat/electron-12-notify`, `bb2dash-wt-electron-12-notify`): C-7
  (`poller/*`, `notify.ts`, `deeplink.ts`) and their unit + e2e tests. Consumes W-25's `rest.ts`
  and `session.ts` signatures; touches no file W-25 owns.
* ~~W-27 mirror~~ — not spawned (Q7).

## Open questions for Stack (asked and answered 2026-09-16; answers are under the Contract)

Kept for the record.

| # | Question | Recommendation |
|---|---|---|
| Q1 | Launch at login: R-23 lists it, the 9/14 MVP answer did not. | Ship it as `launchAtLogin` in config, **off by default**; ten lines, no new surface. |
| Q2 | Does the poller reuse the web session or hold its own token? | **Reuse the web session's cookie** (C-5): no second sign-in, no refresh race, nothing on disk. `safeStorage` waits for the mirror. |
| Q3 | Poll interval, and does polling run with the window closed? | **5 min**, plus on focus and on resume; **window-only**: closing the window quits. |
| Q4 | Tray icon? | **No** for the MVP. If you want "always on" after using it, a tray becomes a config toggle in a follow-up. |
| Q5 | Quiet hours for "due tomorrow"? | **One check a day at 18:00 New York** (`dueReminderTime`); everything else relies on Focus Assist. |
| Q6 | Click-only toasts? | **Yes.** Buttons need a ToastActivatorCLSID shortcut; not worth it here. |
| Q7 | Mirror root: the OneDrive `course context` (71 harvested files today) or the repo's gitignored folder (20 seed files)? | **OneDrive**; it is where the harvest already lands. |
| Q8 | Mirror shipping: your prompt lists the mirror among the jobs; the 9/14 answer made it post-MVP. | Keep it post-MVP in this phase: **MVP PR first** (your acceptance on the unpacked build), then the mirror as a second small PR on `feat/electron-12-mirror`. That is a one-PR-per-phase exception, like 10a/10b, so it needs your nod; the alternative holds the PR until the mirror is in. |
| Q9 | Sync button: command **typed, not run** (your words), or run immediately? | **Typed**, via PSReadLine (C-8). If the prefilled line proves flaky on PowerShell 5.1, fall back to running it. |
