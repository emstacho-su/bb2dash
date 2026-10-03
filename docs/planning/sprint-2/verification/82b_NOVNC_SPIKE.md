# 82b — Phase 14 verification: Task 0 session probes, then the noVNC spike

> Record for brief `100_PHASE14_containers.md` tasks 3 (Task 0) and 4 (the spike). Task 0's rows are
> written as each probe happens, by the session that runs it. The spike's `Verdict:`, `Sandbox:` and
> `LOGIN_HOSTS:` lines are written when the spike runs; they are absent until then.

## Task 0 — how long a Blackboard login lives (R-82, P-93, B-47)

Login confirmed (t0): **2026-09-29T15:25:39Z**, baseline probe `200` from a fresh tab of the same Chrome
profile. The login itself was made about 14:00Z for sync request 184. "Stay signed in?" (Entra KMSI):
**yes**, Stack's standing rule (2026-09-29). Browser: Stack's Chrome, driven read-only through the Claude in
Chrome extension; no clicks, no navigation after the tab is on Blackboard.

Probe, run in the logged-in tab:

```js
const r = await fetch(location.origin + '/learn/api/public/v1/users/me', { credentials: 'include', redirect: 'manual' });
({ status: r.status, type: r.type, href: location.href, at: new Date().toISOString() })
```

`200` = the login is alive. `401`/`403`, or an opaque redirect toward `login.microsoftonline.com`, = it
died. Each row is read as a measurement of SU's Entra Conditional Access / KMSI policy, not of Shibboleth
ceilings (P-93).

**How the probes run (Stack, 2026-09-29):** once a login is confirmed, idle probes are spawned
periodically, self-paced, for as long as the login lives — not on an hourly clock. Each probe appends a
row with the elapsed time since t0. The idle series ends at the first dead probe, which is the lifetime,
or when the laptop sleeps (a row says so and the series resumes with the next confirmed login). The reopen
probes are separate: the same Chrome profile reopened after the browser was closed, about +1, +3, +7 and
+14 days after t0.

### Idle probes (tab open, laptop awake)

| probe | at (UTC) | elapsed since t0 | status | note |
|---|---|---|---|---|
| probe-0 | 2026-09-29T15:25:39Z | 0:00 | 200 | baseline; fresh tab of the same profile, `/ultra/institution-page` |
| probe-1 | 2026-09-29T15:31:42Z | 0:06 | 200 | first self-paced probe; the loop then widens to ~30 min, then ~60 min |
| probe-2 | 2026-09-29T16:07:13Z | 0:41 | 200 | idle, tab open; next probe ~30 min |
| probe-3 | 2026-09-29T16:39:15Z | 1:14 | 200 | idle, tab open; cadence widens to ~60 min |
| probe-4 | 2026-09-29T17:40:14Z | 2:15 | 200 | idle; the tab now shows `/ultra/course` (Blackboard or Stack moved it; no click by the loop) |
| probe-5 | 2026-09-29T18:41:21Z | 3:16 | 200 | tab in active use by Stack (a course file page), so this hour was not idle; the login is alive either way |
| probe-6 | 2026-09-29T19:42:23Z | 4:17 | 200 | tab on the ECN.304 course outline, still in use by Stack; alive |
| probe-7 | 2026-09-30T04:01:23Z | 12:36 | **401** | dead: the tab sits on Blackboard's landing page with `new_loc=/ultra/courses/_571529_1/outline`, the redirect a signed-out session gets. This wake fired about 7 h late (the session's usage limit paused the loop from ~20:43Z), so the death lies somewhere after probe-6 |

Idle lifetime: **between 4:17 and 12:36** (t0 2026-09-29T15:25:39Z → last alive 19:42:23Z, first dead 04:01:23Z on 2026-09-30). Bracketed, not measured: the loop's hourly wake was delayed by the session's usage-limit pause, and probes 5–6 were taken while Stack was using the tab, so the series is not a pure idle measurement. The laptop stayed on. KMSI was yes.

### Reopen probes (same profile, browser closed in between)

| probe | plan | at (UTC) | elapsed since t0 | status | note |
|---|---|---|---|---|---|
| reopen-1 | about +1 d (2026-09-30) | pending | | | |
| reopen-2 | about +3 d (2026-10-02) | pending | | | |
| reopen-3 | about +7 d (2026-10-06) | pending | | | |
| reopen-4 | about +14 d (2026-10-13), the Duo remember-me window | pending | | | |

## The spike — a Blackboard login inside a container (brief 100 task 4; R-82, P-102, P-103)

Built 2026-10-02 on `feat/containers-14`: `docker/sync/Dockerfile` on
`mcr.microsoft.com/playwright:v1.63.0-noble` with Xvfb, x11vnc and noVNC; `docker/sync/entrypoint.sh`;
`docker/sync/seccomp_profile.json` (Playwright's own, tag v1.63.0, unchanged); `docker/sync/spike/session-age.mjs`;
the root `compose.yaml` with the one service `sync`, the volume `bb-profile` and the secret `novnc_password`.

First start, 2026-10-02T06:22:17Z, before any login:

* `docker compose port sync 6080` → `127.0.0.1:6080`; `docker port bb2dash-sync-1` → `6080/tcp -> 127.0.0.1:6080`.
* `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:6080/vnc.html` → `200`.
* `docker compose exec sync whoami` → `pwuser`.
* x11vnc runs with `-localhost` and reads its password with `-passwdfile /run/secrets/novnc_password`.
* `session-age.mjs` launched Chromium with `launchPersistentContext(<bb-profile>, { headless: false, chromiumSandbox: true })`
  and logged `host blackboard.syracuse.edu` and `users/me 401 2026-10-02T06:22:20.462Z +0m` (nobody is logged in yet).

Sandbox: seccomp

The `/proc` scan while `session-age.mjs` ran (12 Chromium processes): `grep -c -- "--no-sandbox"` → `0`.

Each probe in the log is a request from the browser's own cookie jar, so the overnight log measures a
login touched every 30 minutes (`PROBE_MINUTES`), not an untouched one.

After the code-review fixes (c3d3f9c) the container was recreated and restarted once with nobody logged
in; it came back each time (`200` from the page, `users/me 401`). The laptop then slept: the log jumps from
`users/me 401 2026-10-02T06:56:17Z +0m` to `users/me 401 2026-10-03T16:50:10Z +2034m`.

**Stack's Duo login, 2026-10-03.** Stack opened `http://127.0.0.1:6080/vnc.html` in his Chrome, entered the
VNC password and signed in with NetID and Duo, answering yes to "Stay signed in?". The top frame passed
through one host besides Blackboard (`host login.microsoftonline.com 2026-10-03T16:50:54Z`); the Duo step
did not navigate the top frame to a host of its own. Stack's note at the login: the stay-signed-in
feature "tends to not work" for him (DECISIONS 2026-09-16 decision 6 says the same).

* `walk-14/01-novnc-duo-login.png`: the noVNC view of `http://127.0.0.1:6080/vnc.html`, taken right after
  the login with a headless viewer on the host (the address is in this row, not in an address bar). The
  container's Chromium shows `blackboard.syracuse.edu/ultra/course` with the heading "Courses" and Stack's
  courses under Fall 2026.
* `docker compose restart sync` at 2026-10-03T16:53:16Z. First probe of the new run:
  `users/me 200 2026-10-03T16:53:19.768Z +0m`. The `/proc` scan again counted `0` `--no-sandbox`.
* `walk-14/02-after-restart.png`: the same address after the restart. Chromium opened its start URL
  `/ultra/`, which lands signed in on `/ultra/institution-page` (Stack's name in the side bar, no sign-in
  form), not on "Courses"; the check's heading reads "Institution Page" for that reason. Chromium shows
  "Restore pages? Chromium didn't shut down correctly": the stop closed the browser but it still marked the
  profile as crashed. Not a login problem; a note for task 15 (the runner's launch dismisses or prevents it).

LOGIN_HOSTS: login.microsoftonline.com

The `Verdict:` line is written after the overnight log.

Reading the numbers into the phase (brief 100 open item 1): `KEEPALIVE_MINUTES` and B-45's hour stay at
their provisional values until the idle series has ended and the four reopen rows are filled; the
DECISIONS row that closes Task 0 names them and writes the `Idle lifetime:` line below.
