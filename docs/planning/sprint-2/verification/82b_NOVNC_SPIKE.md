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

### Reopen probes (same profile, browser closed in between)

| probe | plan | at (UTC) | elapsed since t0 | status | note |
|---|---|---|---|---|---|
| reopen-1 | about +1 d (2026-09-30) | pending | | | |
| reopen-2 | about +3 d (2026-10-02) | pending | | | |
| reopen-3 | about +7 d (2026-10-06) | pending | | | |
| reopen-4 | about +14 d (2026-10-13), the Duo remember-me window | pending | | | |

Reading the numbers into the phase (brief 100 open item 1): `KEEPALIVE_MINUTES` and B-45's hour stay at
their provisional values until the idle series has ended and the four reopen rows are filled; the
DECISIONS row that closes Task 0 names them and writes the `Idle lifetime:` line below.
