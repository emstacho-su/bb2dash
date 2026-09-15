# Phase 12 — Electron shell: window, notifications, Sync button

Date: 2026-09-14 (brief); PM session TBD. Product manager: Stack. Requirements: R-23 (MVP subset),
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

## Contract — to be frozen by the phase PM session before workers spawn

Must specify:

* Package `desktop/` (Electron, TypeScript): main process, preload with `contextBridge` only,
  no `nodeIntegration`, `requestSingleInstanceLock`, AppUserModelID for taskbar grouping,
  `safeStorage` for the Supabase session, window state persistence.
* Notification source: how the shell learns about the three triggers (Supabase Realtime on a
  small `notifications` outbox written by the Phase 9 driver and Phase 10a's gradebook stage,
  vs. polling `v_sync_status` + `v_gradebook_latest` + `v_work_items`); dedup so a trigger fires
  once; click → deep link into the web app route.
* Sync button: `wt.exe -d <repo> pwsh -NoExit -Command "claude '/bb-sync <id>'"` (or the exact
  working incantation), with the `agent_requests` row created first (R-13).
* Build: `electron-builder --dir` (unpacked) or equivalent; a `desktop/README.md` with the
  shortcut steps; how the deployed URL is configured.
* Tests: Playwright for Electron smoke (window opens, single instance, notification hook fires
  in a test mode).

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
- [ ] Notification source is a main-process **poller** with a stable-key / `lastSeenAt`
      watermark on disk (Realtime is for on-screen data, not background events, and sockets die
      across sleep); restarting the poller fires no duplicate toast (watermark test).
- [ ] The three toasts fire once each with the correct payload (test hook asserts); toasts are
      click-only for the MVP (action buttons need a ToastActivatorCLSID shortcut); a correct
      AppUserModelID is set (otherwise toasts fail silently).
- [ ] Sync button opens Windows Terminal (`wt.exe`), cwd = repo, `claude "/bb-sync <id>"`
      prefilled; a malformed id is rejected before spawn (test).
- [ ] Playwright-for-Electron suite green; reducer unit tests ≥ 80 %.
- [ ] Clean-profile Windows 11 smoke: the SmartScreen path screenshotted; the app runs after
      "Run anyway"; shortcut-creation steps written in `desktop/README.md`.
- [ ] Absent by inspection (grep): no crawl, no `shell.openPath`, no download interception, no
      auto-updater, no mirror code in the MVP.
- [ ] SOP gates: `/code-review main high` HIGH cleared; `/security-review` over the IPC
      surface, the spawn, and token storage; STATUS + DECISIONS + ORCHESTRATOR updated.

## Task loops

| # | task | executable check | demo line (Stack) | owner |
|---|---|---|---|---|
| 1 | Freeze the Contract; put the open questions to Stack | answers recorded | — | PM session |
| 2 | `desktop/` package, window, single-instance lock, AppUserModelID | Playwright: second launch focuses; one process | "one icon, one window" | W-23 |
| 3 | Secure `webPreferences` + navigation allowlist | test asserts flags; external link opens browser | — | W-23 |
| 4 | Session persistence (cookie Max-Age, `safeStorage`) | restart test: still signed in; no token in logs | "I reopen and I am still in" | W-23 |
| 5 | Sync button → `wt.exe` with prefilled command, `agent_requests` row first | spawn test with id validation | "the terminal opens with the command ready" | W-23 |
| 6 | Poller + watermark on disk | unit tests: dedup across restart | — | W-24 |
| 7 | Toast: sync landed with N | test hook asserts payload once | "I get told when a sync lands" | W-24 |
| 8 | Toasts: grade posted, due tomorrow (clock trigger) | tests; click raises the right screen | "I get told about a grade and a due item" | W-24 |
| 9 | Unpacked build + README + clean-profile smoke | build artefact runs; SmartScreen screenshot | — | W-23 |
| 10 | Gates + docs | SOP list | — | PM session |
| 11 | **Stack's acceptance script** | — | the six steps above | Stack |
| 12 | Post-MVP: file mirror | hash-verified copies under `course context/`; never writes elsewhere (test) | "new files show up in OneDrive" | W-23 |

Open questions from the research, for Stack (also in `70_MVP_INDEX.md` §5): launch at login in
or out (R-23 lists it, the MVP answer did not); does the poller reuse the web session or hold its
own token; poll interval, and does polling continue while the window is closed (tray icon or
window-only); quiet hours for "due tomorrow" or rely on Focus Assist; click-only toasts for the
MVP (recommended).

## Post-MVP task (same phase, after the MVP is signed off)

File mirror: download new `bb_files` from Storage into `course context/<course>/<bucket>/` and
copy Stack's uploads to `my_submissions/`, hashes verified, never writing elsewhere.

## Out of scope

Renderer changes (the web app is untouched), macOS/Linux, installer, auto-update, crawl.

## Workers (proposed)

* **W-23 shell** (`feat/electron-12-shell`): window, single instance, safeStorage, Sync button,
  build, README.
* **W-24 notifications** (`feat/electron-12-notify`): the outbox or polling source, the three
  triggers, dedup, deep links, test mode.
