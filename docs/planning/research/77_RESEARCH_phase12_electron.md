# R-12 research — Phase 12, Electron shell

Researcher R-12, 2026-09-14. Scope: R-23 (shell) + R-26 (desktop notifications), MVP per
`70_MVP_INDEX.md` §1.7. Windows 11 only, unpacked build, no installer, no crawl in Electron.

## 1 Comparables

* **Linear desktop** — ships the *same* web React app inside Electron; the wrapper buys "nicer
  notifications, dock badge, and most importantly: it's always on". No backend or renderer
  changes. Closest analogue to R-23. <https://linear.app/changelog/2019-04-25-linear-desktop-app>
* **Slack desktop** — same web bundle, but a deliberately thin interop layer between web and
  desktop so the shell can be shipped independently of the app.
  <https://slack.engineering/interops-labyrinth-sharing-code-between-web-electron-apps/>
* **Notion desktop / community wrappers** (`anechunaev/notion-electron`) — a readable reference
  for the minimal main+preload+`contextBridge` wrapper of a remote URL.
  <https://github.com/anechunaev/notion-electron>
* **JupyterLab Desktop** — worked `safeStorage` example: remote tokens encrypted at rest in main,
  renderer never sees them. <https://github.com/jupyterlab/jupyterlab-desktop/pull/1136>
* **`electron-windows-interactive-notifications`** — the reference for toast *buttons* on Windows
  (COM activator + Start Menu shortcut).
  <https://github.com/felixrieseberg/electron-windows-interactive-notifications>

## 2 Patterns to copy

**Process architecture.** One `main.js`, one `preload.js`, zero renderer changes — the renderer is
the deployed Vercel URL. Secure baseline: `nodeIntegration:false`, `contextIsolation:true`,
`sandbox:true`, `webSecurity:true`; expose only named IPC channels over `contextBridge`
(<https://www.electronjs.org/docs/latest/tutorial/security>). Call
`app.requestSingleInstanceLock()` before creating the window; on `second-instance`, restore and
focus the existing window. Call `app.setAppUserModelId()` early — each distinct AppUserModelID
gets its own taskbar button, so pin/grouping and toasts both depend on it
(<https://www.electronjs.org/docs/latest/api/app>). Known Windows quirk: work fired from
`second-instance` (including a toast) may need `setImmediate()`
(<https://github.com/electron/electron/issues/35732>).

**Notification source.** Prefer a **main-process poller over Realtime** for the MVP. Realtime's own
guidance is "subscribe to what's on screen, unsubscribe on blur"; background/off-screen events
belong to push or polling (<https://supabase.com/docs/guides/realtime/postgres-changes>), and a
socket dies across sleep/resume — exactly when Stack's machine is idle. Also, "due tomorrow" is a
*clock* trigger with no DB write behind it. Design: one scheduler in main that queries a single
server-side view/edge function on an interval, on window focus, and on power-resume; each candidate
carries a stable key (`sync:<run_id>`, `grade:<assignment_id>:<seen_at>`, `due:<item_id>:<date>`);
a `lastSeenAt` + fired-key watermark on disk stops duplicate toasts after restart. Coalesce a sync
into **one** toast ("12 changes") — Windows keeps at most 20 toasts per app in Action Center
(<https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/toast-collections>),
and Focus Assist / Do Not Disturb will suppress delivery, so never treat a toast as the only
channel: the in-app list (R-26) stays the source of truth. Click → `show()` + deep-link the
renderer. Buttons/actions are *not* in Electron's base `Notification`; they need a Start Menu
shortcut carrying `System.AppUserModel.ID` and a `ToastActivatorCLSID`
(<https://www.electronjs.org/docs/latest/tutorial/notifications>) — recommend **no action buttons
in the MVP**, click-to-open only.

**Terminal launch.** `spawn('wt.exe', ['-d', repoDir, '--title', 'bb-sync', 'pwsh', '-NoExit',
'-Command', cmd], { detached: true })` — argv array, never a shell string, and the `<id>` is
validated against `^[a-z0-9-]{1,64}$` before interpolation. `-d` sets the starting directory,
`--title` names the tab, and `;` must be escaped if ever used
(<https://learn.microsoft.com/en-us/windows/terminal/command-line-arguments>). `wt.exe` is a Store
execution alias; resolve `%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe` and fall back to
`powershell.exe` if absent.

**Session storage.** Two layers, don't conflate them. (a) Web login = Chromium cookies in a
`persist:` partition. Caveat worth testing: Electron's cookie store is **not** DPAPI-encrypted the
way Chrome's is (<https://github.com/electron/electron/issues/7073>), and `persist:` does **not**
retain `session`-flagged cookies (<https://github.com/electron/electron/issues/9995>) — so Supabase
auth cookies must carry a Max-Age. (b) Anything the *main process* holds to poll the API (a
refresh token or service-scoped key) goes through `safeStorage.encryptStringAsync` after `ready`;
on Windows the key is DPAPI-protected — safe from other users, **not** from other apps on the same
account (<https://www.electronjs.org/docs/latest/api/safe-storage>). Never pass either to the
renderer.

## 3 Anti-patterns

* `nodeIntegration: true` / `enableRemoteModule` / the `@electron/remote` module — disables the
  sandbox and hands a compromised page Node (Electron security doc, above).
* Loading local files or bundling a copy of the app. bb2dash's renderer is the Vercel deployment;
  a local copy forks the UI and drifts. (Obsidian is local-first by design — that shape does *not*
  transfer here.)
* Unrestricted navigation. Deny by default: `setWindowOpenHandler(() => ({action:'deny'}))` plus a
  `will-navigate` allowlist of the Vercel origin + Supabase auth origin; everything else goes to
  `shell.openExternal`.
* Silent auto-update. Out of MVP scope and it is the one path that can push unreviewed code onto
  Stack's machine; unpacked build + shortcut, updates are a manual rebuild.
* `shell.openPath` / download interception / a Blackboard webview — explicitly excluded by R-23.
* Firing one toast per changed row.

## 4 Standard operating procedure (testing)

Electron's own docs name **Playwright** as the supported E2E path:
`_electron.launch({ args: ['main.js'] })` drives the app, and `electronApp.evaluate()` runs inside
the **main** process, which is how you stub OS-level APIs deterministically — Playwright does not
intercept native dialogs/notifications, so you replace them in main
(<https://playwright.dev/docs/api/class-electron>,
<https://www.electronjs.org/docs/latest/tutorial/automated-testing>). Concretely: inject a
`BB2DASH_TEST=1` env that swaps `Notification` and the `spawn` of `wt.exe` for recorders, then
assert on the recorded payloads. Layer on top: unit tests for the trigger/dedupe reducer (pure
function over rows + watermark), and a **manual smoke on a clean Windows profile** — the only way
to see the real SmartScreen "Windows protected your PC / Unknown publisher" prompt that an unsigned
unpacked build produces (<https://www.electronjs.org/docs/latest/tutorial/code-signing>), and the
only way to confirm toasts appear at all (they fail *silently* without a correct AppUserModelID).

## 5 Proposed DoD checklist

- [ ] Launching the shortcut twice focuses the existing window; exactly one taskbar button, one process.
- [ ] Window shows the deployed app, already logged in; app restarted → still logged in (cookie Max-Age verified).
- [ ] `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true` asserted by a test that reads `webPreferences`.
- [ ] `will-navigate` allowlist + `setWindowOpenHandler` deny: an external link opens in the default browser, not in-window.
- [ ] `safeStorage.isEncryptionAvailable()` true; any main-held token round-trips encrypted; grep shows no token in the renderer bundle or logs.
- [ ] Toast fires for **sync landed with N changes** — one toast, correct N (test hook asserts payload).
- [ ] Toast fires for **grade posted** and for **item due tomorrow**; each names the course and item.
- [ ] Re-running the poller after restart fires **no** duplicate toast (watermark test).
- [ ] Clicking a toast raises the window and lands on the right screen.
- [ ] Sync button opens Windows Terminal, cwd = repo, with `claude "/bb-sync <id>"` prefilled; a malformed id is rejected before spawn.
- [ ] Playwright-for-Electron suite green in CI/local; unit tests on the trigger reducer at ≥80%.
- [ ] Clean-profile smoke on Windows 11: SmartScreen prompt path documented with a screenshot; app runs after "More info → Run anyway".
- [ ] `/code-review` HIGH+ cleared, `/security-review` run (IPC surface + spawn + token storage).
- [ ] STATUS.md + DECISIONS.md updated in the same PR; shortcut-creation steps written down.
- [ ] Confirmed absent: no crawl, no `shell.openPath`, no download interception, no auto-updater, no file mirror.

## 6 Open questions for Stack

1. **Launch at login** is in R-23's text but not in §1.7's MVP list — in or out?
2. Does the main-process poller authenticate as Stack (reusing the web session) or with its own
   stored token? This decides whether `safeStorage` is load-bearing or belongs to the mirror phase.
3. Poll interval, and should polling stop while the window is closed to the tray, or keep running?
4. Is a **tray icon** wanted, or window-only? (Affects whether "always on" is real.)
5. Quiet hours — suppress "due tomorrow" outside a window, or rely on Windows Focus Assist?
6. Toast **buttons** ("Sync now", "Open") need a Start Menu shortcut with a ToastActivatorCLSID —
   accept click-only toasts for the MVP?
