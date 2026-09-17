# R1 — Blackboard login (NetID + Duo) from a container

Researcher: R1. Phase 14 (containerization). Read-only on all repos; no state-changing git commands.

## Step 1 — How the crawl is driven today (read-only findings)

Sources: `skills/bb-sync/SKILL.md`, `ingest/bb_crawler.js`, `ingest/CADENCE_RUNBOOK.md`,
memory note `bb-sync-live-lessons.md`.

- **Browser:** the skill's documented default is "built-in browser, Claude in Chrome as fallback,"
  but the live-lessons memory (2026-09-14 first real run) overrides that: the built-in browser
  and the Chrome extension were both unreliable ("may not exist," "no connected browsers").
  **The Playwright MCP is what actually works**, and specifically because *its profile persists on
  disk* — Stack does the NetID + Duo push once by hand in that profile, and every later session
  reuses the same cookies without a new MFA prompt (until the session or Duo "remember me" cookie
  expires). This is the single most load-bearing fact for Phase 14: the thing being containerized
  is not "a browser," it's *a specific already-authenticated browser profile directory*.
- **Login check, always first:** the skill probes `location.href` in page context. If it's on
  `login.microsoftonline.com` or any Blackboard/NetID login page, it stops immediately — no retry,
  no guessing, no credential entry — updates `agent_requests` to `failed`, raises a
  `stack_must_confirm` attention_item ("Blackboard session expired; log in and re-run the sync"),
  and reports "SESSION EXPIRED" in one line. This check is the seam any container design must
  preserve exactly: whatever replaces the tab must be able to tell "logged in" from "on a login
  page" and must never attempt to fill in NetID credentials or push Duo itself.
- **Crawler injection:** `ingest/bb_crawler.js` is pasted into the page as a script tag
  (`page.addScriptTag({ path: 'ingest/bb_crawler.js' })` via Playwright's
  `browser_run_code_unsafe`, no `require`/`import` allowed in that sandbox) and exposes
  `window.__bb = installCrawler({ userId, supabaseUrl, anonKey })`. `bb.runAll({ termName })` is
  started **detached** in the page and polled via `window.__bbRun` so a multi-minute crawl doesn't
  hit an MCP tool timeout. The crawler calls Blackboard's own internal/public JSON endpoints
  (`/learn/api/v1/...`, `/learn/api/public/v1/...`) using the page's own session cookie — it never
  handles credentials — and POSTs raw payloads straight to Supabase `bb_raw` with the anon/
  publishable key (insert-only RLS), bypassing chat entirely.
- **File pulls:** because `bbcswebdav` file URLs 302 to a cross-origin CDN with no CORS, bytes
  can't be fetched from page JS. Course files stay a manual step until Electron. Submission files
  (Phase 10a, step 4b) are pulled live in the same tab because only the logged-in session can reach
  them: `page.waitForEvent('download')` + `download.saveAs(path)`, appending
  `?xythos-download=true` to the durable URL. Bytes go to `course context/<relpath>` locally and
  `POST /storage/v1/object/bb-files/<relpath>` (anon key, no `x-upsert`) in Supabase Storage.
- **Where the session lives:** entirely in the Playwright MCP's persistent browser profile
  (on-disk user-data-dir with cookies + the Duo "remember me" cookie, if any). There is no
  separate credential store — the profile *is* the credential. Nothing in today's flow writes or
  reads a NetID password or a Duo secret; MFA is a human action performed once per profile
  lifetime.

**Implication for Phase 14:** containerizing this crawl means containerizing (1) a Chromium
process that can be pointed at a **persistent, volume-backed profile directory**, (2) some way for
Stack to see that browser's screen and click through NetID + Duo when the profile isn't yet
authenticated or has expired, and (3) an automation driver (Playwright, or Playwright MCP itself)
that can attach to that same browser to inject `bb_crawler.js` and run `bb.runAll`. It does **not**
need Blackboard credentials or a Duo secret inside the container at all — the whole point of the
persistent profile is to avoid ever having application code touch either.

## Step 2 — Container designs compared

### (a) Headful Chromium container + persistent profile volume, exposed via noVNC/KasmVNC for Duo login

**Candidates checked:**

| Image | CDP endpoint Playwright can attach to | Multi-arch (amd64+arm64) | Notes |
|---|---|---|---|
| `linuxserver/chromium` | In principle yes (`--remote-debugging-port`), but **broken on modern Chromium**: since Chromium M113, `--remote-debugging-address=0.0.0.0` is silently forced back to `127.0.0.1` — a Chromium team "WontFix" (workaround is a `socat` sidecar forwarding an external port to `127.0.0.1:9222` inside the same container). [github.com/linuxserver/docker-chromium#30](https://github.com/linuxserver/docker-chromium/issues/30), [ytyng.com writeup](https://www.ytyng.com/en/blog/docker-chromium-cdp-port) | Yes — linuxserver publishes multi-platform manifests (amd64+arm64) for this image. [docs.linuxserver.io/images/docker-chromium](https://docs.linuxserver.io/images/docker-chromium/) | Chromium (not Chrome) — correct choice since Google ships no official Chrome build for linux/arm64. Needs the socat trick or "driver runs in the same container" (see below) to get CDP working at all. |
| `kasmweb/chrome` / `kasmweb/chromium` | KasmVNC images are built as a remote-desktop product, not an automation target; no first-class documented CDP passthrough port in the public docs found. Community forks exist for "chrome + noVNC + CDP" specifically because Kasm's own images don't expose this cleanly. [hub.docker.com/r/kasmweb/chrome](https://hub.docker.com/r/kasmweb/chrome), [igolaizola/chromote](https://github.com/igolaizola/chromote) | `kasmweb/chromium` exists as the arm64-friendly variant; could not verify amd64+arm64 in one manifest from public docs — **flagged unverified**, check `docker manifest inspect` before committing. | Heavier (full desktop environment, KasmVNC daemon, Kasm's own auth model). Good UX for "log in through a web view" but more moving parts than needed for a single-user, single-purpose crawl box. |
| `selenium/standalone-chromium` (+ noVNC on 7900) | Selenium Grid exposes port 4444 (WebDriver) and a Selenium-brokered CDP *proxy* for its own BiDi/CDP test features — not a raw `9222`-style endpoint Playwright's `connectOverCDP()` can dial directly. Multiple open GitHub issues report `connectOverCDP` failing against Selenium images because the browser's own debug port isn't exposed. [microsoft/playwright#21022](https://github.com/microsoft/playwright/issues/21022) | Yes — `selenium/node-chromium`/`standalone-chromium` (the Chromium-not-Chrome variant, since ChromeDriver has no official arm64 build either) are published multi-arch via `seleniumhq-community/docker-seleniarm`. [github.com/seleniumhq-community/docker-seleniarm](https://github.com/seleniumhq-community/docker-seleniarm) | Built for WebDriver test grids, not Playwright. Wrong tool for this job even though the noVNC pattern (port 7900, `--shm-size=2g`) it popularized is exactly the UX we want. |
| `browserless` (ghcr.io/browserless/chromium) | Yes, this is its entire purpose — REST/WebSocket CDP endpoints per browser (`/chromium`, `/chrome` amd64-only, `/firefox`, `/webkit`). [docs.browserless.io/enterprise/open-source](https://docs.browserless.io/enterprise/open-source) | Yes for the `chromium`/`multi`/`firefox`/`webkit` images (amd64+arm64); Chrome and Edge stay amd64-only because Google/Microsoft don't ship Linux/arm64 builds. Reported ARM64 timeout bug on Raspberry Pi 5 in the v2 image — worth a smoke test before relying on it. [browserless/browserless#4946](https://github.com/browserless/browserless/issues/4946) | Browserless is designed to run **headless, ephemeral, ad-hoc** sessions for scraping fleets — it actively fights persistent profiles and long-lived logged-in state (session reuse across requests is not its model), and it has no built-in noVNC/visual login story. Wrong shape for "one profile, log in once, reuse for months." |
| **Custom image: `mcr.microsoft.com/playwright` (Node/Playwright preinstalled, Ubuntu-based) + Xvfb + a VNC/noVNC layer** | Yes by construction — you launch Chromium yourself via Playwright (`launchPersistentContext`, `headless: false`, `DISPLAY=:99`), so the automation driver and the browser share the **same container and the same localhost**, sidestepping the M113 127.0.0.1 problem entirely (no cross-container CDP hop needed). [Playwright Docker docs](https://playwright.dev/docs/docker) | Officially published with arm64 variants ("official images have ARM64 variants... good browser support on ARM64 for Chromium and Firefox"), but the exact tag's manifest should be checked at build time — multi-arch completeness has been an open ask historically. [microsoft/playwright#29819](https://github.com/microsoft/playwright/issues/29819) — **flagged: verify with `docker manifest inspect mcr.microsoft.com/playwright:<pinned-tag>` before relying on it.** | Most setup effort (you assemble Xvfb + a VNC server + noVNC/websockify yourself, e.g. following the OddBird/Medium patterns found), but it's the only option built to have Playwright *and* a visible display *and* a persistent profile all in one place, which is exactly the requirement. |

**Setup effort:** custom image (most, ~1 Dockerfile with Xvfb/x11vnc/noVNC layered on) >
linuxserver/chromium+socat > kasmweb (least Dockerfile work, most product surface to secure) >
selenium (wrong tool, skip) > browserless (wrong shape, skip).

**Security, all of (a):**
- noVNC/KasmVNC **must** bind to `127.0.0.1` on the host, never `0.0.0.0`, and be reached only via
  an SSH tunnel or Docker's published-port-to-loopback trick
  (`-p 127.0.0.1:6901:6901`) — every source found says the same thing: these images ship with
  **no auth by default** or a weak single shared VNC password, and are only safe on a local
  network or behind a reverse proxy with real auth. [kasm.com/docs security/docker](https://kasm.com/docs/1.16.0/security/docker.html), [info.linuxserver.io "Securing KasmVNC-Based Containers"](https://info.linuxserver.io/issues/2024-10-06-securing-kasm/)
- The profile volume is, in effect, a bearer credential for Stack's SU account: anyone with read
  access to it can impersonate his live Blackboard (and Duo "remembered device") session with no
  further MFA. It must be treated like a secrets file — not committed, not backed up unencrypted,
  restricted file permissions, excluded from any vault/RAG sync.
- If a raw CDP port is ever exposed off-loopback (design (a) with linuxserver+socat, or design (b)
  below), that port has **no authentication at all** — "anyone who can reach port 9222 can read
  cookies, execute JS, and navigate to file:// URLs" is Chromium's own stated threat model for
  `--remote-debugging-port`. [Chromium issue 1425667 discussion, via ytyng.com](https://www.ytyng.com/en/blog/docker-chromium-cdp-port) This is a strong argument for **never exposing CDP outside a container's own loopback** — keep the browser and its driver in the same container (the custom-image approach) rather than trying to expose CDP across the Docker network.

**Session-expiry detection, all of (a):** identical to today — a driver inside the container
(Playwright script or Playwright MCP) navigates/probes and checks `location.href` for
`login.microsoftonline.com` or a Blackboard login page, exactly like `bb-sync` step 1 does now.
Nothing about containerizing changes this check.

**Telling Stack "log in again":** the app already has `attention_items` / the Inbox and desktop
notifications (per CLAUDE.md and the bb-sync skill). The container-side change is just *where* the
"go log in" action happens: today he clicks into the Playwright MCP's browser tab in his own
session; in a container he'd open `http://127.0.0.1:<novnc-port>/vnc.html` (or an SSH-tunneled
equivalent) to see the same Chromium and click through NetID + Duo himself. The existing
`stack_must_confirm` attention item plus a URL to that noVNC page is a complete UX — no new
notification channel is needed, just a URL to put in the existing message.

### (b) Crawl stays on the host browser; container connects to the host's CDP via `host.docker.internal`

- **Windows Docker Desktop mechanics:** `host.docker.internal` is a real DNS name Docker Desktop
  provides inside every container, resolving to the host. [dash0.com FAQ](https://www.dash0.com/faq/how-to-access-a-host-port-from-inside-a-docker-container)
- **Why this design is fragile, not just "more setup":** it collides directly with the same
  Chromium M113+ restriction from (a) — Chrome/Chromium forces its debug listener to `127.0.0.1`
  regardless of what `--remote-debugging-address` is asked for, so a container reaching in via
  `host.docker.internal:9222` is not talking to `127.0.0.1` from Chrome's point of view and can be
  refused outright; getting this working needs the same `socat` (or equivalent Windows-side relay,
  which has no native `socat` — WSL2's or a small netcat/ncat shim would be needed) forwarding a
  0.0.0.0-bound port to the host browser's loopback port, run **on the host, not in a container**,
  which is an extra always-on host-side process Phase 14 is explicitly trying to eliminate (goal:
  move *every* local process into containers). Given the memory note that Stack's actual working
  setup today is the **Playwright MCP's own managed browser** (not a bare Chrome launched with
  debug flags), this design would also require replacing that MCP-managed launch with a manually
  launched Chrome — a regression from what's proven to work.
- **Verdict:** technically possible but adds a host-resident relay process, re-introduces the
  "Chrome refuses non-127.0.0.1 debug clients" problem this phase is trying to design around, and
  works against the portability goal (a host-side dependency that has to be re-created identically
  on the ARM Mac / VPS later). Not recommended even as a fallback.

### (c) Cookie/storage-state hand-off: log in anywhere, export Playwright `storageState`, container runs headless with it

- **Mechanism:** `browserContext.storageState()` serializes cookies + localStorage (+ IndexedDB /
  OPFS snapshots in newer Playwright) to a JSON file; a headless `browserContext` elsewhere can be
  constructed from that file (`storageState: 'auth.json'`) with no display, no noVNC, no CDP
  exposure at all. [playwright.dev storage & auth docs](https://playwright.dev/agent-cli/commands/storage)
- **Setup effort:** lowest of the three by far — the container just needs Playwright headless
  (any of `mcr.microsoft.com/playwright` in `--headless` mode, no Xvfb, no VNC layer) plus a
  mounted `storageState.json`. No new UI surface.
- **Security:** the exported file is the same bearer-credential risk as the profile volume in
  (a), concentrated into one JSON file instead of a whole profile directory — arguably *easier*
  to protect (one file, can be Docker-secret-mounted read-only, never baked into an image) but
  also easier to accidentally leak (a stray `cat`, log line, or git add would fully expose it, and
  unlike a profile directory it's small enough to paste into chat by mistake — flag this
  explicitly in any tooling that touches it).
- **Session-expiry detection:** identical check, run headless against a real Blackboard endpoint
  before crawling; on failure there is *no in-container way to fix it* — headless has no display
  for Duo, so failure must terminate the run and message Stack to re-export a fresh
  `storageState.json` from wherever he can complete Duo (a local Playwright MCP browser, or
  design (a)'s noVNC box) and drop it back into the mounted volume/secret. This is a real UX
  regression versus (a): (a) lets Stack fix an expired session *from the same container's noVNC
  URL*, closing the loop entirely inside Docker; (c) always requires a *separate*, non-containerized
  (or separately-containerized-with-a-display) place to redo the Duo login, then a manual file
  hand-off step.
- **Best fit:** as a **fallback / bootstrap path**, not the primary design — e.g., the very first
  container build on a brand-new host (ARM Mac, VPS) can be seeded with a `storageState.json`
  exported from the Windows laptop's already-authenticated profile, rather than doing a fresh
  Duo enrollment on every new machine. This directly serves Stack's portability goal (frozen
  answer #1) as a **migration** mechanism even if (a) is the steady-state design.

## Step 3 — What can be said about session lifetime (Shibboleth + Duo + Blackboard Ultra)

Being honest about what's verifiable vs. institution-specific:

- **Blackboard/Anthology's own idle timeout is documented and generic:** default inactivity
  timeout is 180 minutes (3 hours), administrator-configurable between 15 and 480 minutes, with an
  in-app warning at least 6 minutes before expiry that, if dismissed, resets the clock for another
  full window. [help.blackboard.com Session_Timeout](https://help.blackboard.com/Learn/Administrator/SaaS/Authentication/Session_Timeout) **This is the Blackboard *application* session, not the SSO session** — even if this timer is generous, Blackboard can still bounce a request to Shibboleth if the *IdP* session underneath has expired.
- **Shibboleth has two independently configurable layers**, and public docs only give *defaults*,
  not SU's actual values:
  - SP (service provider, i.e., the Blackboard side of the trust): default inactivity timeout
    3600s (1 hour), default absolute session lifetime 28800s (8 hours). [Shibboleth SessionConfiguration docs](https://shibboleth.atlassian.net/wiki/spaces/IDP4/pages/1265631620/SessionConfiguration)
  - IdP (Syracuse's login.syr.edu / NetID side): default overall IdP session ceiling PT24H (24h),
    with individual authentication results (e.g., "you did Duo at 9am") separately capped by a
    default 60-minute idle timeout and a configurable absolute lifetime, subject to a sliding
    window up to an absolute limit. [Shibboleth IDP5 SessionConfiguration](https://shibboleth.atlassian.net/wiki/spaces/IDP5/pages/3199506072/SessionConfiguration)
  - **None of these numbers are SU's actual configured values** — every one of them is an
    administrator-tunable default in the Shibboleth/Blackboard software, and Syracuse's ITS could
    have set any of them differently. This is squarely "institution-specific and unverifiable"
    from outside; CLAUDE.md's own note that "SU's 'stay signed in' never works for him" is the
    only ground-truth data point available, and it's consistent with an idle timeout well under a
    day, possibly the Blackboard-side 180-minute default or a shorter IdP idle window.
- **Duo's "remember me" device cookie:** feature exists and is real, but its duration is an
  admin-configured policy per institution — publicly reported examples range from 7 days to 30
  days across different schools, and it's tied to the *browser* (specifically, to a cookie in that
  browser's profile) rather than to the OS or device as a whole. [Duo help article](https://help.duo.com/s/article/1012?language=en_US), [various university IT KBs found in search] **Whether Syracuse's Duo policy has "remember me" enabled at all, and for how long, is unverified** — some institutions disable it outright for security posture. If SU has it enabled, this is actually good news for the persistent-profile design: it means the profile volume (which *is* the browser) may carry a Duo bypass for days-to-weeks even after the Blackboard/Shibboleth session itself has expired and needs a fresh login — reducing re-Duo frequency to whatever the SP/IdP session limits allow, not a Duo push every time.
- **Whether a kept-alive tab extends the session:** Blackboard's own docs describe an in-app
  warning dialog that resets the *Blackboard-side* idle timer if dismissed before expiry — so an
  open, occasionally-interacted-with tab plausibly keeps Blackboard's own session alive
  indefinitely. But that says nothing about the Shibboleth SP/IdP session ceiling underneath,
  which (per the SP default above) has an **absolute** lifetime independent of activity — a
  kept-alive tab cannot outlast that ceiling if SU enforces one. **Unverifiable without a live
  test against SU's actual config.**

**Cheap experiment Stack can run himself** (no container work needed, ~15 minutes of his time
spread over a day or two):
1. Log in fresh (NetID + Duo) in the Playwright MCP profile, note the timestamp.
2. Leave the tab open and idle (no clicks, no requests) and probe `bb.runAll()` (or just refresh
   the tab) at, say, +1h, +2h, +3h, +4h to find where it first bounces to a login page — this
   brackets the *effective* idle timeout (whichever of Blackboard/SP/IdP fires first).
3. Separately, log in, close the browser entirely, wait 24h, and reopen the same profile — this
   tests the Duo "remember me" cookie (does it skip the push?) independent of any session/idle
   question, and tests whether the profile's *cookies* alone (no active session) still avoid a
   fresh Duo challenge.
4. Repeat step 3 at day 3, 7, 14 to bracket the actual "remember me" window if one exists.
This turns three unverifiable "institution-specific" unknowns into three measured numbers with
under half an hour of total active effort, spread out.

## Step 4 — Recommendation

### MVP: design (a), custom image — Playwright's official base + Xvfb + a minimal noVNC layer, browser and driver in one container

Rationale: it's the only option that (1) matches what Stack already asked for (frozen answer #4:
"browser in a container with persistent profile, log in through a web view, IF research confirms
workable" — confirmed workable), (2) keeps the automation driver and the browser in the *same*
container so the Chromium M113+ localhost-only CDP restriction is a non-issue (no cross-container
or cross-host CDP hop is ever attempted), (3) reuses the exact profile-persistence model that's
already proven in production (Playwright's persistent-profile pattern is literally what the
Playwright MCP already does locally — a `--user-data-dir` mounted from a volume is the same idea,
containerized), and (4) closes the "please log in again" loop entirely inside the container: the
same noVNC URL that showed Stack the expired-login page is where he re-authenticates.

### Fallback: design (c), storageState hand-off — for first-boot on a new host and for a same-day dev/test loop

Use case: seeding a brand-new host (the future ARM Mac, a VPS) without repeating Duo enrollment
from scratch, and as an escape hatch if the noVNC container ever won't come up but a working
Playwright session exists elsewhere. Not the steady-state design because it has no self-contained
recovery path when the session expires (Step 2's honest downside above).

Design (b) is **not recommended even as a fallback** — see Step 2's verdict: it fights the same
Chromium restriction (a) sidesteps for free, needs a host-resident relay process Phase 14 is
trying to eliminate, and regresses from the already-working Playwright-MCP-managed browser to a
bare Chrome launch.

### Compose sketch (MVP)

```yaml
# docker-compose.yml (bb-browser service — sketch only, not yet built/tested)
services:
  bb-browser:
    build:
      context: ./bb-browser
      dockerfile: Dockerfile
      # Dockerfile: FROM mcr.microsoft.com/playwright:v1.5x.0-noble (PIN an exact tag;
      # verify its manifest has linux/arm64 with `docker manifest inspect` before relying on it —
      # see Step 2 table, flagged unverified)
      # + apt-get install -y xvfb x11vnc novnc websockify (or a KasmVNC layer instead of x11vnc/novnc)
      # + a small Node/Playwright entrypoint script that:
      #     - starts Xvfb on :99, x11vnc on :99, websockify/noVNC on 6901 -> x11vnc
      #     - launches `chromium.launchPersistentContext(PROFILE_DIR, { headless: false })`
      #     - probes location.href for a login page (same check as bb-sync step 1) and writes a
      #       liveness/status file the healthcheck reads
      #     - on demand (HTTP trigger from the watcher, or a mounted request file), injects
      #       ingest/bb_crawler.js via addScriptTag and runs bb.runAll(), posting straight to
      #       Supabase bb_raw with the anon key exactly as today
    image: bb2dash/bb-browser:latest   # built locally first; GHCR mirror is a Phase 14 packaging
                                        # decision for another researcher, not decided here
    platform: linux/amd64              # Windows laptop today; drop/parameterize for the ARM Mac later
    ports:
      - "127.0.0.1:6901:6901"          # noVNC — loopback ONLY, never 0.0.0.0 (Step 2 security note)
    volumes:
      - bb-browser-profile:/home/pwuser/profile   # the persistent, credential-bearing profile
      - ./course context:/course-context          # only if this container also does file pulls
    environment:
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}    # publishable/anon only — never the service key
      - NOVNC_PASSWORD_FILE=/run/secrets/novnc_password   # Docker secret, not an env value
      - DISPLAY=:99
    secrets:
      - novnc_password
    shm_size: "2g"                      # Chromium needs real /dev/shm headroom (Selenium docs note)
    healthcheck:
      # calls into the container's own status endpoint/file: "authenticated" | "login_required" | "error"
      test: ["CMD", "node", "/app/healthcheck.js"]
      interval: 60s
      timeout: 10s
      retries: 3
    restart: unless-stopped

secrets:
  novnc_password:
    file: ./secrets/novnc_password.txt   # gitignored, per CLAUDE.md secrets rule
volumes:
  bb-browser-profile:
```

**Not yet decided here (belongs to other Phase 14 researchers per 00_CONTEXT.md):** how the
watcher container triggers a crawl on this container (HTTP call vs. shared queue vs. exec), the
image registry/build strategy (local vs. GHCR Actions), and exactly which noVNC stack
(x11vnc+novnc+websockify vs. KasmVNC) to standardize on — flagged as an open question for
whichever researcher owns the Dockerfile itself.

## Open questions / could-not-verify list

- Syracuse's actual Shibboleth SP/IdP idle and absolute timeout values (institution-specific,
  unverifiable from outside — see Step 3 experiment).
- Whether SU's Duo policy has "remember me" enabled, and for how many days, if so.
- Whether `mcr.microsoft.com/playwright`'s specific pinned tag ships a working linux/arm64 image
  (historically an open ask on the Playwright repo) — verify with `docker manifest inspect`
  before the build researcher commits to this base.
- `kasmweb/chromium`'s exact multi-arch manifest coverage — not confirmed from public docs in this
  pass.
