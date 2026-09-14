# R-12 research — Phase 12, Electron shell

R-12, 2026-09-14. Scope: R-23 + R-26, MVP per `70_MVP_INDEX.md` §1.7. Windows 11, unpacked.

## 1 Comparables

* **Linear desktop** — ships the *same* web app in Electron; the wrapper buys "nicer notifications,
  dock badge, and most importantly: it's always on". No renderer changes. Closest analogue.
  <https://linear.app/changelog/2019-04-25-linear-desktop-app>
* **Slack desktop** — same web bundle behind a deliberately thin web↔desktop interop layer.
  <https://slack.engineering/interops-labyrinth-sharing-code-between-web-electron-apps/>
* **`anechunaev/notion-electron`** — minimal main + preload + `contextBridge` wrapper of a remote
  URL. <https://github.com/anechunaev/notion-electron>
* **JupyterLab Desktop** — worked `safeStorage` example: tokens encrypted in main, renderer never
  sees them. <https://github.com/jupyterlab/jupyterlab-desktop/pull/1136>
* **`electron-windows-interactive-notifications`** — reference for toast *buttons* (COM activator +
  Start Menu shortcut). <https://github.com/felixrieseberg/electron-windows-interactive-notifications>

## 2 Patterns to copy

**Process architecture.** One `main.js`, one `preload.js`, zero renderer changes — the renderer is
the Vercel URL. Baseline `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`,
`webSecurity:true`; only named IPC channels over `contextBridge`
(<https://www.electronjs.org/docs/latest/tutorial/security>). `app.requestSingleInstanceLock()`
before the window; `second-instance` → restore + focus. `app.setAppUserModelId()` early — each
AUMID gets its own taskbar button, and toasts depend on it
(<https://www.electronjs.org/docs/latest/api/app>). Quirk: a toast fired from `second-instance`
may need `setImmediate()` (<https://github.com/electron/electron/issues/35732>).

**Notification source.** Prefer a **main-process poller over Realtime**. Supabase's own guidance is
"subscribe to what's on screen, unsubscribe on blur"; background events belong to push or polling
(<https://supabase.com/docs/guides/realtime/postgres-changes>), and a socket dies across
sleep/resume — exactly when the machine is idle. "Due tomorrow" is a *clock* trigger with no DB
write behind it. Design: one scheduler in main querying a server-side view or edge function on an
interval, on focus, and on power-resume; each candidate carries a stable key (`sync:<run_id>`,
`grade:<assignment_id>:<seen_at>`, `due:<item_id>:<date>`); a `lastSeenAt` + fired-key watermark on
disk prevents re-fires after restart. Coalesce a sync into **one** toast ("12 changes") — Windows
keeps at most 20 toasts per app in Action Center
(<https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/toast-collections>)
and Focus Assist suppresses delivery, so the in-app list stays the source of truth. Click →
`show()` + deep-link. Buttons need a Start Menu shortcut carrying `System.AppUserModel.ID` + a
`ToastActivatorCLSID` (<https://www.electronjs.org/docs/latest/tutorial/notifications>) — click-only
for MVP.

**Terminal launch.** `spawn('wt.exe', ['-d', repoDir, '--title', 'bb-sync', 'pwsh', '-NoExit',
'-Command', cmd], {detached:true})` — argv array, never a shell string; validate `<id>` against
`^[a-z0-9-]{1,64}$` first. `-d` sets the start directory, `--title` the tab, `;` needs escaping
(<https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments>). `wt.exe` is a Store
execution alias: resolve `%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe`, fall back to
`powershell.exe`.

**Session storage.** Two layers, don't conflate. (a) Login = Chromium cookies in a `persist:`
partition. Caveats: Electron's cookie store is **not** DPAPI-encrypted like Chrome's
(<https://github.com/electron/electron/issues/7073>) and `persist:` does **not** keep
`session`-flagged cookies (<https://github.com/electron/electron/issues/9995>) — Supabase auth
cookies must carry a Max-Age. (b) Anything *main* holds to poll goes through
`safeStorage.encryptStringAsync` after `ready`; on Windows the key is DPAPI-protected — safe from
other users, **not** other apps on the account
(<https://www.electronjs.org/docs/latest/api/safe-storage>).

## 3 Anti-patterns

* `nodeIntegration:true` / `enableRemoteModule` / `@electron/remote` — kills the sandbox, hands a
  compromised page Node (security doc above).
* Loading local files or bundling a copy of the app — the renderer *is* the Vercel deployment; a
  local copy forks and drifts. (Obsidian is local-first by design; that shape doesn't transfer.)
* Unrestricted navigation. Deny by default: `setWindowOpenHandler(()=>({action:'deny'}))` plus a
  `will-navigate` allowlist (Vercel + Supabase auth origins); the rest `shell.openExternal`.
* Silent auto-update — the one path that pushes unreviewed code onto Stack's machine. Updates are
  a manual rebuild.
* `shell.openPath`, download interception, a Blackboard webview — excluded by R-23.
* One toast per changed row.

## 4 Standard operating procedure (testing)

Electron's docs name **Playwright** as the supported E2E path: `_electron.launch({args:['main.js']})`
drives the app and `electronApp.evaluate()` runs in the **main** process — the documented way to stub
OS APIs, since Playwright does not intercept native dialogs or notifications
(<https://playwright.dev/docs/api/class-electron>,
<https://www.electronjs.org/docs/latest/tutorial/automated-testing>). Concretely: `BB2DASH_TEST=1`
swaps `Notification` and the `wt.exe` spawn for recorders; assert on recorded payloads. Plus unit
tests on the trigger/dedupe reducer (pure: rows + watermark → toasts), and a **manual smoke on a
clean Windows profile** — the only way to see the SmartScreen "Unknown publisher" prompt an unsigned
unpacked build produces (<https://www.electronjs.org/docs/latest/tutorial/code-signing>) and to
confirm toasts appear at all (they fail *silently* without a correct AUMID).

## 5 Proposed DoD checklist

- [ ] Launching the shortcut twice focuses the existing window; one taskbar button, one process.
- [ ] Window shows the deployed app, logged in; restart → still logged in (cookie Max-Age verified).
- [ ] Test asserts `webPreferences`: nodeIntegration off, contextIsolation on, sandbox on.
- [ ] External link opens in the default browser; `will-navigate` allowlist enforced.
- [ ] Any main-held token round-trips through `safeStorage`; no token in renderer or logs.
- [ ] **Sync landed** toast fires once with the correct N (test hook asserts payload).
- [ ] **Grade posted** and **due tomorrow** toasts fire, each naming course + item.
- [ ] Restarting the poller fires no duplicate toast (watermark test).
- [ ] Clicking a toast raises the window on the right screen.
- [ ] Sync button opens Windows Terminal, cwd = repo, `claude "/bb-sync <id>"` prefilled; malformed id rejected before spawn.
- [ ] Playwright-for-Electron suite green; reducer unit tests ≥80%.
- [ ] Clean-profile Win 11 smoke: SmartScreen path screenshotted; runs after "Run anyway".
- [ ] `/code-review` HIGH+ cleared; `/security-review` over IPC surface, spawn, token storage.
- [ ] STATUS + DECISIONS updated in the PR; shortcut-creation steps written down.
- [ ] Absent by inspection: no crawl, no `shell.openPath`, no download interception, no auto-updater, no mirror.

## 6 Open questions for Stack

1. **Launch at login** is in R-23's text but not in §1.7's MVP list — in or out?
2. Does the poller reuse Stack's web session or hold its own token? Decides whether `safeStorage`
   is load-bearing now or belongs to the mirror phase.
3. Poll interval, and does polling continue while the window is closed?
4. Tray icon or window-only? (Decides whether "always on" is real.)
5. Quiet hours for "due tomorrow", or rely on Focus Assist?
6. Click-only toasts for MVP (buttons need a ToastActivatorCLSID shortcut)?
