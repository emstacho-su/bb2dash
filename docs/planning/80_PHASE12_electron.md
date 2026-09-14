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

_Pending research (R-12 report) — filled in PR #11._

## Task loops

_Pending research (R-12 report) — filled in PR #11._

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
