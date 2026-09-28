# 92 — Sprint 2 research: sync-runner-login

Date 2026-09-24 · Researcher: Sonnet (Stage B) · Scope: R-81..R-87, R-108 (§1.6 and §1.9) and
§2 P-33..P-43, §6 questions 34–38, 47–48. Read-only on every repo except this file. Web research
fetched live 2026-09-24 (WebSearch/WebFetch); repo facts read from `docs/planning/sprint-2/`,
`project-state/`, and the six `82_RESEARCH_phase14_R*` files already on disk (not re-derived).

## 0. Summary

The brief and its six researchers (R1–R6) already converge on the right shape for this area: a
deterministic Node + Playwright `sync-runner`, browser and driver sharing one container, a
least-privilege DB role, and a templated (non-LLM) report. 2026 sources confirm every load-bearing
piece of that design and add three concrete corrections, none of which reopen an R-number:
(1) **R1's session-lifetime write-up is framed around Shibboleth**, but R-82's own "State today"
line says SU authenticates through **Microsoft Entra SAML** — Entra's controls (Conditional Access
sign-in frequency, KMSI) are a different, mostly-opaque-to-Stack model, and Task 0's probes should
be re-justified against it before he runs them. (2) **The brief's Chromium-sandbox default
(non-root + `--no-sandbox`)** is behind current practice: Playwright's own docs and 2026 write-ups
now recommend non-root **plus the shipped `seccomp_profile.json`**, never `--no-sandbox`, which
directly settles P-39. (3) **The VNC-stack choice R1 left open** (x11vnc+noVNC vs. KasmVNC) is
settled by the same sources: a custom `mcr.microsoft.com/playwright` + Xvfb + x11vnc/websockify
image, matching two fetched 2026 GitHub examples of exactly this shape, over KasmVNC's heavier
product surface — closing P-38's open item. The dead-letter and least-privilege designs (R-83,
R-84) match 2026 Postgres job-queue and least-privilege-role practice closely enough that the only
additions are an attempts counter and an explicit grant-list gap (queue read, raise path) the
brief's own text had already flagged as undercounted. **Biggest risk:** Entra's real governing
control (Conditional Access) is invisible to Stack (he is not a tenant admin), so Task 0 stays the
only ground truth — same probes as before, corrected justification. **Total size:** unchanged from
the brief — R-81/R-82 stay L, R-83/R-84/R-85/R-86 stay M, R-87/R-108 stay S; the corrections above
are all S additions layered onto existing tasks, not new phases of work.

## 1. R-81 · A queued sync crawls, pulls files and closes with no Claude session

**1. Standard practice.** A single-writer Postgres queue table with an atomic claim
(`UPDATE ... WHERE state = 'queued' RETURNING`) is the accepted 2026 shape for exactly this volume
— `agent_requests` already does this. Multi-worker designs add `SELECT ... FOR UPDATE SKIP LOCKED`;
bb2dash doesn't need it (one runner). Pin every subprocess dependency (a lockfile, not bare
`pip install`-style imports) so a Docker layer rebuild can't silently drift a PDF-extraction
version. [Prisma: Postgres job queue with SKIP LOCKED](https://www.prisma.io/blog/you-dont-need-a-job-queue-postgres-already-has-skip-locked)

**2. Examples (fetched).**
- [DmitriyG228/playwright-vnc](https://github.com/DmitriyG228/playwright-vnc) — headed Playwright
  in Docker with a volume-mounted profile; "restart containers while keeping cookies," with a
  separate fresh-start command that wipes cookies/sessions. Borrow: the restart-survives volume
  pattern and its explicit fresh-start reset as the template for a `storageState` bootstrap path.
- [wdj2613/playwright-mcp-novnc](https://github.com/wdj2613/playwright-mcp-novnc) — five supervised
  processes (xvfb → openbox → x11vnc → novnc/websockify → playwright-mcp), all logging to stdout so
  `docker logs` shows everything. Borrow: the "no separate log files, everything to stdout"
  convention for the runner's own healthcheck/`doctor` output.
- [dev.to: "The Queue Was a Table"](https://dev.to/romiteld/the-queue-was-a-table-how-i-built-claimunclaim-workers-with-skip-locked-stale-recovery-and-1ojm) —
  claim/unclaim workers with an `attempts` column and stale-claim recovery in one SQL statement.
  Borrow: the attempts-column shape for R-83's dead-letter sweep (below).

**3. Pitfalls.** A killed process leaves the row `claimed` forever — no built-in timeout in the
schema (already named in the requirement text; corroborated generically by every claim-pattern
source above, which all pair the claim with a *separate* staleness sweep, never a client-side
timeout). `extract_text.py` has zero pinned dependencies today (R5's own finding) — a Docker rebuild
with no lockfile can silently change PDF output. **New pitfall from this pass:** Node's
`fs.rename` throws `EXDEV` across filesystem/volume boundaries — if step 4b's download lands on a
container's tmpfs and the target is the separate `course-files` volume, a straight `rename` call
will fail; the fix is copy-then-unlink (or writing the download directly onto the target volume),
not a bare `fs.rename`.

**4. Maps onto this stack.** New `bb2dash/sync/` (TS): reuses `desktop/src/core/sync-command.ts`'s
`SYNC_ID_PATTERN`/`isValidSyncId` (extracted per P-42, since that file also holds `powershell.exe`),
`ingest/bb_crawler.js`'s `installCrawler`/`runAll` unchanged, `ingest/pull_files.mjs`'s pure
helpers (`filterManifest`, `bbFilesUpdateSql`, `storageKeyFor`, `bytesLookValid`) and
`bb_file_relpath()`. Writes through the new `sync_claim`/`sync_register_run`/`sync_close` DEFINER
RPCs (R-84, migration 091). The single riskiest unbuilt piece is P-36's authenticated byte-fetch —
the documented `download`-event path crashed the MCP browser on 2026-09-23 and the only proven
fallback today is a curl-against-the-signed-CDN-link workaround recorded in auto-memory, not code.
P-37's embed-after-pull decision (runner vs. a pg_cron drain) is still open; no embed cron exists.

**5. Size: L** (confirmed). **Seams:** gated by R-84's RPC signatures and R-82's spike; P-33
(migration renumber), P-35 (scrubbed fixture), P-36 (byte fetch), P-37 (embed decision), P-42 (id
check extraction) all attach here.

**6. What the research changes.** Confirms "no LLM in the common path" is correctly scoped — every
2026 job-queue source treats a claim→process→close loop as exactly the kind of thing a plain script
does better than an agent, reinforcing rather than revising the brief's own change 1. Adds one
concrete implementation pitfall (the `EXDEV` risk above) to fold into P-36's byte-fetch task. No
split, no drop.

## 2. R-82 · The sync container holds a Blackboard login Stack makes through noVNC

**1. Standard practice.** Browser and automation driver in one container, never split across a CDP
network hop — Chromium ≥ M113 still binds its debug port to `127.0.0.1` regardless of what flag
asks for otherwise, and every fetched 2026 example below is built the single-container way for
exactly that reason. noVNC/VNC binds loopback-only, treated as a real secret, matching C-6's
`novnc_password`. For the browser sandbox specifically: Playwright's own docs (fetched 2026-09-24)
say the hardened pattern is a **non-root user (`pwuser`) plus the image's shipped
`seccomp_profile.json`** (permits the `clone`/`setns`/`unshare` syscalls Chromium's user-namespace
sandbox needs) — the docs do not mention `--no-sandbox` at all. A 2026 write-up on running Chromium
in hardened containers describes the same shape in Kubernetes terms: `runAsNonRoot` + a real
non-root uid + `seccompProfile: RuntimeDefault` + all capabilities dropped, with only
`--disable-dev-shm-usage`/`--disable-gpu` as browser flags — `--no-sandbox` removes Chromium's
actual isolation boundary rather than working around a container limitation.
[Playwright Docker docs](https://playwright.dev/docs/docker) ·
[dev.to: Chromium in Docker without --no-sandbox](https://dev.to/pdfik/chromium-in-docker-without-no-sandbox-what-actually-breaks-437l)

**2. Examples (fetched).**
- [DmitriyG228/playwright-vnc](https://github.com/DmitriyG228/playwright-vnc) — exactly the "custom
  image" shape R1 recommended: Playwright + Xvfb + noVNC, one container, CDP reachable only inside
  it. Borrow: its restart-keeps-cookies compose file as a starting Dockerfile skeleton.
- [wdj2613/playwright-mcp-novnc](https://github.com/wdj2613/playwright-mcp-novnc) — the same
  five-process supervision shape, already proven working in 2026. Borrow: the process list and its
  stdout-only logging convention (§1 above) for the container's `doctor` check.
- [felixrieseberg/electron-windows-interactive-notifications](https://github.com/felixrieseberg/electron-windows-interactive-notifications) —
  not a VNC example, but its README's description of what a Windows shortcut needs is reused in
  R-108 below; noted here only because it shares the "one container, one boundary" instinct: never
  let a second process hold half of a credential.

**3. Pitfalls.**
- noVNC ships with no auth by default or one shared weak password — bind `127.0.0.1:6080` only,
  never `0.0.0.0`; matches the brief's own C-6/C-2 already.
- `--no-sandbox` as the brief's current default trades away Chromium's process isolation; the fix
  current sources converge on is the seccomp profile + non-root user, not disabling the sandbox —
  **this settles P-39**, which the brief had left unadopted and out of the `/security-review` list.
- KasmVNC's own product framing (per a 2026 Docker-browser survey) is "secure browser-based remote
  desktop access" that "doesn't inherently provide policy, identity, and lifecycle controls most
  teams need in production" — heavier product surface than a single-user login box needs, matching
  R1's own lean away from it. **This settles the VNC-stack half of P-38**: x11vnc+noVNC over
  KasmVNC. [Docker Browser 2026 guide](https://blog.send.win/docker-browser-browser-isolation-guide-2026/) ·
  [KasmVNC docs](https://docs.kasmvnc.com/docs/index.html)
- **Entra vs. Shibboleth (the headline correction):** R1's Step 3 write-up quotes Shibboleth SP/IdP
  default timeouts (SP inactivity 3600s/absolute 28800s; IdP ceiling 24h) as the framework for
  interpreting Task 0's probes. R-82's own "State today" line says **SU signs in through Microsoft
  Entra SAML, not Shibboleth** — a materially different control surface. Entra's actual levers are
  Conditional Access **sign-in frequency** (tenant default: a **90-day rolling window** — generous,
  session persists — configurable to "every time" or a periodic value per tenant) and **persistent
  browser session / KMSI** (the "Stay signed in?" persistent cookie; Microsoft's own docs do not
  publish its duration — it is institution-configured, and a non-KMSI cookie lasts 24h or until the
  browser closes). None of Entra's *defaults* are short-lived; a tenant has to actively narrow them.
  CLAUDE.md's own recorded fact — "SU's 'stay signed in' never works for him" — is therefore strong
  evidence SU has an active Conditional Access override (a short sign-in-frequency value, KMSI
  disabled, or both), not evidence of a generic Blackboard/browser timeout. Task 0's four probes
  (idle checks at +1/2/3/4h; profile-reopen checks at +1/3/7/14 days) are still the right *empirical*
  design — Entra's own controls are opaque from outside a tenant admin's console — but the write-up
  that justifies them needs to say "measuring an unknown Conditional Access policy," not "bracketing
  a Shibboleth SP/IdP ceiling." [Configurable token lifetimes](https://learn.microsoft.com/en-us/entra/identity-platform/configurable-token-lifetimes) ·
  [Conditional Access session lifetime](https://learn.microsoft.com/en-us/entra/identity/conditional-access/howto-conditional-access-session-lifetime) ·
  [Sign-in frequency discussion](https://techcommunity.microsoft.com/discussions/microsoft-entra/conditional-access-can-someone-please-explain-sign-in-frequency-and-persistent-b/3032109) ·
  [Stay signed in prompt](https://docs.azure.cn/en-us/entra/fundamentals/how-to-manage-stay-signed-in-prompt)

**4. Maps onto this stack.** `docker/sync/Dockerfile` (bb2dash), `bb-profile` volume (credential-
bearing, already excluded from vault/RAG sync), `novnc_password` secret (C-6), `127.0.0.1:6080`,
the runner's login-check reusing SKILL.md's `location.href` probe against the known SU/Blackboard
login hosts (now including `login.microsoftonline.com`-family Entra hosts, not a Shibboleth IdP
host). Duo/Entra numbers feed R-87's scheduled-sync hour and R-83's `login_required` branch.

**5. Size: L** (confirmed). **Seams:** the spike (task 2) gates R-81/R-83/R-85; P-38 (image tag,
VNC stack, secrets/gitignore, verification/ folder) and P-39 (sandbox choice) should land *before*
the spike runs, not after, since both change what the spike's own Dockerfile looks like.

**6. What the research changes.**
- **Sharpen:** replace R1's Shibboleth-framed session-lifetime write-up with an Entra ID
  Conditional Access framing before Stack runs Task 0 (research-added item below) — same probes,
  corrected justification, so he isn't primed to expect Shibboleth-shaped numbers.
- **Settle (P-39):** Chromium sandbox default is non-root (`pwuser`) + Playwright's own
  `seccomp_profile.json`, not `--no-sandbox`; add to the `/security-review` list per the brief's own
  gap note.
- **Settle (P-38, VNC half):** freeze x11vnc+noVNC/websockify (custom `mcr.microsoft.com/playwright`
  image) over KasmVNC, closing R1's explicitly-still-open item.

## 3. R-83 · Sync outcomes are reported from run data; failures raise one Inbox item

**1. Standard practice.** A dead-letter path with an **attempts counter** and a hard cap, never
silently auto-retried; a templated (non-LLM) status report built from structured fields for
anything that must be deterministic and auditable, not from free text.
[dev.to: The Dead Letter Queue Pattern](https://dev.to/gabrielanhaia/the-dead-letter-queue-pattern-200-lines-that-save-your-friday-4l37) ·
[dev.to: The Queue Was a Table](https://dev.to/romiteld/the-queue-was-a-table-how-i-built-claimunclaim-workers-with-skip-locked-stale-recovery-and-1ojm)

**2. Examples (fetched).**
- The Dead Letter Queue Pattern article — routes a job past its retry budget to a distinct terminal
  status with the original error preserved, never deleted or silently re-queued. Borrow: the
  "terminal status + preserved error, never deleted" shape, already the plan for the `login_required`
  and dead-letter Inbox items.
- The Queue Was a Table article — an `attempts` column plus a `claimed_at` staleness check done in
  one CTE-then-UPDATE statement. Borrow: this exact shape for the sweep RPC.
- [Prisma: you don't need a job queue](https://www.prisma.io/blog/you-dont-need-a-job-queue-postgres-already-has-skip-locked) —
  keep the whole state machine in one table with a small enumerated state set, rather than a second
  table for the sweep. Borrow: confirms the requirement's own "a state, not a table" instinct
  (matches the 090 `attention_archive` precedent already in this repo).

**3. Pitfalls.** Auto-retrying a "stale" claim risks racing a first crawl that's actually still
alive but slow — already named in the brief's R2 source, corroborated generically by every
dead-letter source above, which all treat auto-requeue as the wrong default. A report appended
*after* close (extra lines landing on `sync_runs.summary.changes` post-fold) is invisible to
anything that only reads at fold time — the desktop toast fires once and won't see later lines;
this is a known "write-once summary vs. late-arriving detail" logging antipattern, already flagged
in the requirement's own Notes, confirmed rather than new.

**4. Maps onto this stack.** `attention_items` (kind `stack_must_confirm`, reused under the
existing kind-check constraint), `attention_items_open_dedupe_idx` (041), `raise_attention()` (041),
`v_inbox_queue`, `sync_runs.summary`, the Sync button's open-request lookup, `transform_tick`'s
30-minute quarantine hold. The self-close mechanism shares one DECISIONS row with
`inbox-data-gap-auto-close` (cluster B2).

**5. Size: M** (confirmed). **Seams:** needs R-81 (runner) and R-84 (`sync_close` signature + raise
path). P-34's amending-DECISIONS-row requirement applies directly here (self-closing the login item
is a machine resolution SKILL.md currently forbids; the shared row must state the exception).

**6. What the research changes.** Confirms the existing design (templated report, one dead-letter
item, never auto-retried) against 2026 job-queue practice with no material gap. **Adds** an explicit
`attempts` counter alongside the time threshold, so a claim that repeatedly claims-and-dies is
distinguishable from one genuinely slow run — folded into the research-added list below rather than
resizing R-83.

## 4. R-84 · The container syncs with a database credential that can do nothing else

**1. Standard practice.** A dedicated Postgres role with SELECT/EXECUTE-only grants; SECURITY
DEFINER RPCs with a pinned `search_path`, granted to exactly that role, revoked from
`PUBLIC`/`anon`/`authenticated`; negative-grant tests committed alongside the migration. This is
R2's own "option 2" recommendation, and it's the shape every fetched 2026 least-privilege example
below independently converges on.

**2. Examples (fetched via search).**
- [Algorythmos-AI/wassup-secretary](https://github.com/Algorythmos-AI/wassup-secretary/pull/2) —
  restricts a tenancy boundary to exactly three SECURITY DEFINER functions, each pinned
  `search_path`, each granted to exactly one role. Borrow: "three functions, one role, pinned
  `search_path`" is close to a literal template for `sync_claim`/`sync_register_run`/`sync_close`.
- [JohnFattore/FattoreStreet](https://github.com/JohnFattore/FattoreStreet/issues/247) — a dedicated
  read-only role enforced at two independent layers (container-level *and* database-level) so
  neither depends on the other holding; calls out `ALTER DEFAULT PRIVILEGES` as the easy-to-forget
  piece of a read-only role. Borrow: the two-independent-layers framing (Docker secret scoping the
  DSN *and* Postgres GRANTs, both narrowing blast radius) plus the default-privileges reminder.
- [jposluns/secureconfig](https://github.com/jposluns/secureconfig/pull/233) — separates runtime
  privileges from object ownership and adds connection/DDL audit logging next to the grant
  narrowing. Borrow: logging every `sync_runner` connection (Postgres' own `log_connections` is
  enough) as a cheap DoD addition.

**3. Pitfalls.** A role that can call `sync_register_run` is a second principal that can authorize a
fold — already named in the requirement's own Notes; the two-layer least-privilege framing above
confirms this is an accepted, unavoidable residual (least privilege shrinks blast radius, it
doesn't remove the trust boundary). Forgetting `ALTER DEFAULT PRIVILEGES` for the new role is a
documented, easy-to-miss gap — a future migration that adds a table can silently grant `sync_runner`
broader access than intended without anyone touching a `GRANT` by hand.

**4. Maps onto this stack.** Migration 091: `create role sync_runner`, the three DEFINER RPCs, plus
— per the requirement's own gap note — a **queue read** and a **raise path for Inbox items** that
the brief's current grant list omits, and RLS/DEFINER wrappers for the `bb_files` step-4b updates
(the views are `security_invoker`, so a direct read is blocked without one). `sync_runner_db_url`
secret is a pooler connection string (C-6). Ties to P-33 (091/092 renumber) and P-34 (DECISIONS rows
amending "owner-claimed," 2026-09-10).

**5. Size: M**, but — as the requirement text itself already flags — only if the queue read, raise
path and `bb_files` wrappers are counted; without them the role cannot poll or report at all.

**6. What the research changes.** Sharpens the grant-list gap into a confirmed finding: every
fetched least-privilege example enumerates *every* entry point a role needs up front (not just the
obvious writes), which is exactly what the brief's "3 RPCs" list is missing (queue read, raise
path). **Adds** `ALTER DEFAULT PRIVILEGES` and connection logging to the DoD's negative-grant tests
(research-added item below).

## 5. R-85 · Container sync proven against the skill, then the Windows path retires

**1. Standard practice.** Freeze the exact comparison query set before either side is built (a
parity/regression baseline); never compare on a day nothing changed; gate a cut-over behind an
explicit runbook with a one-env-var rollback. This is standard operational practice, already the
shape the brief's own C-8 and the requirement text use; the job-queue sources above reinforce it
only indirectly (their "measure before automating" instinct for attempts/throughput applies here
too — a queue with zero activity looks healthy by a naive row count).

**2. Examples.** No external example is independently load-bearing here — this is a proof/process
step over bb2dash's own tables, not a pattern with meaningful open-source precedent. The closest
comparable is internal: Phase 12b's fine-tooth-comb review shape and Phase 11b's cut-over runbook
(push off → migrate → proof run with zero writes → push on), both already in this repo's own
history and both worth copying structurally.

**3. Pitfalls.** Equal counts on a day Blackboard didn't change prove little — already named in the
requirement's own Notes; confirmed as the same "measure the fold outcome, not just totals" caution
the attempts-counter pattern implies generically.

**4. Maps onto this stack.** `sync_runs` / `bb_attempts` / `bb_gradebook` / `bb_raw` per-run counts,
`desktop/src/core/config.ts` (`syncLauncher`), `sync-terminal.ts`, `wt.ts`, `sync-command.ts`,
`audit.test.ts`'s `ALLOWED` env list, the harness realm lock (R-B3; does not cross clones).

**5. Size: M** (confirmed). **Seams:** last in the phase — needs R-81 through R-84 plus the harness
scheduler; P-43 (syncLauncher owner) must merge before the acceptance sitting.

**6. What the research changes.** No material change to the requirement. Confirms P-40 (freeze the
parity query set) and P-41 (fix the `sync_runs` 63 mislabel — it's the iCal poll, not a pull) as
correctly scoped prerequisite housekeeping that belongs inside task 14, not as separate work.

## 6. R-86 · Nothing a container runs depends on Windows, OneDrive or a session

**1. Standard practice.** A single scoped grep-clean check (even without CI, a local test target),
bounded to exactly what a Dockerfile's `COPY` list touches, with comments/help text allowlisted —
standard "portability lint" practice. No exotic external pattern applies here; R5's own per-process
inventory table is itself the standard-practice artifact for this kind of audit and needs no
outside citation.

**2. Examples.** Skipped deliberately — this is an internal-audit requirement with no meaningful
external precedent to borrow from; the useful example is `core-portability.test.ts`, which already
exists in this repo and is the requirement's own named home for the new check.

**3. Pitfalls.** Scoping the grep too broadly (catching prose/comments) produces noise that gets
ignored — classic lint fatigue; too narrowly (matching only `C:\` and missing `C:/`) misses the
actual offender (`config.ts:27`'s `C:\` default, named in the requirement text). Both directions are
already named in the requirement's own "Still missing" line; this pass confirms both are the
standard two-sided tension in any portability lint, not a bb2dash-specific risk.

**4. Maps onto this stack.** `core-portability.test.ts`, `inbox-apply`'s vault-path indirection
(cluster G, an urgent host bug per the requirement text), `smoke.mjs:33`, the harness's
`DEFAULT_VAULT_SEGMENTS` and `.ps1` fallbacks, the `validate-grading` Node twin (task 13).

**5. Size: M** (confirmed). **Seams:** scope is only final once E-2/cluster F write the actual
Dockerfiles — their `COPY` lists define what "a container executes" means.

**6. What the research changes.** No material change. R-81/R-82's design (Node `fs` throughout, no
PowerShell in the runner, browser and driver co-located) confirms the sync path specifically will
already pass a grep-clean check once built — the requirement's own note that the sync-path
`Move-Item` risk is "already resolved" (0cdc093, 2a159cb) checks out, leaving `config.ts:27` and the
harness's OneDrive default as the two real remaining offenders.

## 7. R-87 · A morning sync queues itself while the Blackboard login lives

**1. Standard practice.** A scheduled job that inserts a queue row — never a second execution path
— guarded by a `NOT EXISTS` check against already-open rows, converting to the organization's own
wall-clock hour in SQL rather than assuming the cron schedule string is already local. Supabase's
own pg_cron docs describe exactly the "a single cron task that selects based on a time that has
passed" shape bb2dash needs, run through a SECURITY DEFINER wrapper (since `anon`/`authenticated`
cannot call cron functions directly and RLS blocks a bare insert).
[Supabase pg_cron docs](https://supabase.com/docs/guides/database/extensions/pg_cron) ·
[Supabase Cron](https://supabase.com/docs/guides/cron)

**2. Examples (fetched via search).**
- Supabase's own pg_cron/Cron docs — borrow: the documented pattern of a SECURITY DEFINER function
  as the *only* thing pg_cron calls, so the scheduled job itself needs no elevated grants beyond
  `EXECUTE` on that one function.
- [Supabase community: "cron jobs on inserting a new row"](https://github.com/orgs/supabase/discussions/17141) —
  borrow: the same NOT-EXISTS-then-INSERT shape this repo already uses for guard indexes elsewhere
  (matches the existing client-only one-open-sync-request rule, which migration 092 needs to move
  server-side — a partial unique index or an equivalent guard, per the requirement's own "Still
  missing" line).

**3. Pitfalls.** `cron.timezone` is GMT on this project (confirmed in the requirement's own "State
today") — the job must convert to America/New_York in SQL, not assume the schedule string itself is
New-York-local; this is `pg_cron`'s best-known gotcha (it always schedules in the database's
`cron.timezone`) and the requirement text already plans to reuse the repo's own correct precedents
(`ny-time.ts`'s `dueReminderTime`, `at time zone 'America/New_York'` in 060/089) — confirmed correct,
not a new risk.

**4. Maps onto this stack.** `app_settings.sync_schedule_hour` (new column), a DEFINER insert
function guarded by `NOT EXISTS` on open `kind = 'sync'` rows, an hourly `bb2dash-scheduled-sync`
pg_cron job checking the New York hour in SQL, migration 092 (after 091 takes the role, per P-33),
SQL tests across both DST changes. This requirement is the one place D-3 ("no scheduled crawl") and
D-10 ("sync reminders declined") from §4 are the live "still declined" rows it reverses — both note
that Phase 14's proposal is the one sanctioned exception, pending a DECISIONS row.

**5. Size: S** (confirmed). **Seams:** needs R-81 (something to claim the row), R-84 (091 before
092), R-85's cut-over before it's switched on; feeds R-83's `login_required` branch every morning
the login is dead.

**6. What the research changes.** The numeric default (07:00 New York, daily) is not contradicted by
anything found, but its justification needs correcting: R-87's own "Must respect" leans on the
brief's session-lifetime research, which (per R-82 above) was framed around Shibboleth, not SU's
actual Entra SAML path. Entra's *unmodified* defaults (90-day sign-in frequency, KMSI persistent
when enabled) are generous — a short observed session is near-certainly a deliberate SU tenant
policy, not a fixed institutional ceiling comparable to Shibboleth's stated 8-hour absolute SP
default. That means the "right" hour is not derivable from any public default either way — Task 0's
numbers are the only ground truth, more so than the Shibboleth-era write-up implied. This sharpens
Q36 below without changing its numeric default.

## 8. R-108 · Phase 12 live proofs complete: toasts seen and routed, Sync copy confirmed

**1. Standard practice.** Windows toast click-through for a packaged desktop app needs a Start Menu
shortcut carrying both an `AppUserModelID` and a `ToastActivatorCLSID`; without a registered COM
activator, an Action-Center click on a toast delivered while the app wasn't running (or has been
closed and reopened since) is a **documented no-op**, confirmed directly against Electron's own
notifications docs and the reference COM-activator library, not a guess specific to bb2dash.
[Electron notifications docs](https://www.electronjs.org/docs/latest/tutorial/notifications) ·
[Activating toast notifications from desktop apps](https://learn.microsoft.com/pl-pl/windows/uwp/design/shell/tiles-and-notifications/toast-desktop-apps)

**2. Examples (fetched via search).**
- [felixrieseberg/electron-windows-interactive-notifications](https://github.com/felixrieseberg/electron-windows-interactive-notifications) —
  the reference COM-activator implementation for Electron on Windows. Borrow: its README's checklist
  of what a shortcut needs (`AppUserModelID` + `ToastActivatorCLSID`, defined at compile time, unique
  per app) as the exact thing to verify on bb2dash's own shortcut, since the requirement's own
  evidence shows delivery works but no click has ever been logged.
- [electron/electron PR #51286](https://github.com/electron/electron/pull/51286) — a live, recent
  upstream fix ("dispatch toast action and reply events from WinRT activation path") in this exact
  area. Borrow: nothing to port directly (bb2dash doesn't use reply-action toasts), but it's evidence
  this activation path is still actively moving inside Electron itself — worth checking the pinned
  Electron 44.4.1 (DECISIONS 2026-09-17) against whichever version this landed in before assuming a
  click failure is bb2dash's own bug.

**3. Pitfalls.** "If the user clicks a notification in the Action Center when the app is not
running, it does nothing" is a **documented, known Electron/Windows limitation** — the requirement's
own planned fix (hold the toast on `close`, release only at expiry or quit) is the correct mitigation
shape for exactly that failure mode, confirmed rather than invented.

**4. Maps onto this stack.** `desktop/src/main/notify.ts` (release-on-`close` at :90), `deeplink.ts`
(:100 click log), `poller-wiring.ts`, `core/poller/reducer.ts` (score-line/coalesced-title wording,
frozen C-7 rule 2), `core/navigation-policy.ts`, web `SyncButton.tsx` / `InboxApplyButton.tsx` /
`queries.sync.ts`'s `copyToClipboard`. No migration.

**5. Size: S** (confirmed). **Seams:** none — one sitting with Stack; any wording change stays
inside electron-free `core/` and needs a DECISIONS row amending the frozen C-7 rule.

**6. What the research changes.** Confirms the requirement's own diagnosis (the Action-Center
no-click case is a real, documented platform limitation, not a guess) and adds one cheap
verification step to the same sitting: confirm the Start Menu shortcut actually carries a
`ToastActivatorCLSID` (Electron is supposed to set this automatically, per its own docs, but zero
logged clicks is also consistent with it never having been set) — folded into the existing "Still
missing" list, not a new item, since it's a one-command shortcut-property check.

## Research-added requirements

| Title | Why | Size | For |
|---|---|---|---|
| Re-ground R1's session-lifetime write-up in Entra ID Conditional Access, not Shibboleth | R-82's own "State today" says SU is Entra SAML; Task 0's probes stay the same but the justification Stack reads before running them is currently for the wrong protocol | S | R-82 |
| Adopt non-root + Playwright's `seccomp_profile.json` as the Chromium sandbox default (settles P-39) | Current brief default (`--no-sandbox`) is behind Playwright's own documented practice; add to the `/security-review` list the brief currently omits it from | S | R-82 |
| Freeze the VNC stack as x11vnc+noVNC/websockify over KasmVNC (settles the VNC half of P-38) | R1 left it explicitly open; two fetched 2026 examples and KasmVNC's own heavier product framing both point the same way | S | R-82 |
| Add an `attempts` counter to the dead-letter sweep, not a time threshold alone | Distinguishes a flapping claim (repeated claim-and-die) from one genuinely slow run; every fetched 2026 dead-letter example pairs a time check with an attempts cap | S | R-83 |
| Migration 091's grant list gains the queue read and the Inbox raise path explicitly, plus `ALTER DEFAULT PRIVILEGES` and connection logging in the DoD | The brief's "3 RPCs" list omits how the role reads the queue or raises an item at all; least-privilege examples all enumerate every entry point up front, and default-privilege drift is a documented easy-miss | S | R-84 |
| Name the `fs.rename` `EXDEV` risk explicitly in P-36's byte-fetch task | A download landing on container tmpfs and moved to a separate `course-files` volume can throw across filesystems; copy-then-unlink is the fix | S | R-81 |

## Questions for Stack

Only the two carried §6 questions whose research-grounding changes are repeated here; 34, 35, 37,
47 and 48 are confirmed unchanged by this pass (see their R-number sections above) and are not
repeated.

36. **Scheduled sync hour and cadence.** Default unchanged (07:00 New York, daily, switched off
    until cut-over), but pick the actual hour only after Task 0's numbers exist rather than
    committing to 07:00 now — Entra's real governing control (Conditional Access sign-in frequency
    + KMSI) is opaque from outside SU's tenant, so there is no public default to reason from either
    way, and the session could plausibly die earlier or later in the night than a Shibboleth-style
    8-hour absolute ceiling would have suggested. Why: R-82 §6 above.
38. **Task 0's probes.** Default unchanged (start now, since the Duo enrollment window takes 14
    days), but read the results against Entra ID's Conditional Access sign-in frequency and
    persistent-browser-session (KMSI) model, not Shibboleth's SP/IdP idle/absolute ceilings — same
    four probes (+1/2/3/4h idle; +1/3/7/14-day profile reopen), corrected interpretation, since SU
    authenticates through Entra SAML. Why: R-82 §6 above; this replaces R1's stated framework, not
    its methodology.

## Sources

- [Configurable token lifetimes — Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity-platform/configurable-token-lifetimes) — fetched 2026-09-24 (search)
- [Configure adaptive session lifetime policies — Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity/conditional-access/howto-conditional-access-session-lifetime) — fetched 2026-09-24 (search)
- [Concept: session lifetime — Microsoft Entra ID](https://learn.microsoft.com/en-us/entra/identity/conditional-access/concept-session-lifetime) — fetched 2026-09-24 (search)
- [Manage the "Stay signed in?" prompt in Microsoft Entra ID](https://docs.azure.cn/en-us/entra/fundamentals/how-to-manage-stay-signed-in-prompt) — fetched (WebFetch) 2026-09-24
- [Conditional Access: sign-in frequency and persistent browser session — Microsoft Community Hub](https://techcommunity.microsoft.com/discussions/microsoft-entra/conditional-access-can-someone-please-explain-sign-in-frequency-and-persistent-b/3032109) — fetched 2026-09-24 (search)
- [Playwright Docker documentation](https://playwright.dev/docs/docker) — fetched (WebFetch) 2026-09-24
- [dev.to: Chromium in Docker without --no-sandbox — what actually breaks](https://dev.to/pdfik/chromium-in-docker-without-no-sandbox-what-actually-breaks-437l) — fetched (WebFetch) 2026-09-24
- [DmitriyG228/playwright-vnc](https://github.com/DmitriyG228/playwright-vnc) — fetched 2026-09-24 (search)
- [wdj2613/playwright-mcp-novnc](https://github.com/wdj2613/playwright-mcp-novnc) — fetched 2026-09-24 (search)
- [Docker Browser 2026: Complete Guide](https://blog.send.win/docker-browser-browser-isolation-guide-2026/) — fetched 2026-09-24 (search)
- [KasmVNC docs](https://docs.kasmvnc.com/docs/index.html) — fetched 2026-09-24 (search)
- [Supabase pg_cron docs](https://supabase.com/docs/guides/database/extensions/pg_cron) — fetched 2026-09-24 (search)
- [Supabase Cron docs](https://supabase.com/docs/guides/cron) — fetched 2026-09-24 (search)
- [Supabase community: cron jobs on inserting a new row](https://github.com/orgs/supabase/discussions/17141) — fetched 2026-09-24 (search)
- [Prisma: you don't need a job queue — Postgres already has SKIP LOCKED](https://www.prisma.io/blog/you-dont-need-a-job-queue-postgres-already-has-skip-locked) — fetched 2026-09-24 (search)
- [dev.to: The Dead Letter Queue Pattern](https://dev.to/gabrielanhaia/the-dead-letter-queue-pattern-200-lines-that-save-your-friday-4l37) — fetched 2026-09-24 (search)
- [dev.to: The Queue Was a Table](https://dev.to/romiteld/the-queue-was-a-table-how-i-built-claimunclaim-workers-with-skip-locked-stale-recovery-and-1ojm) — fetched 2026-09-24 (search)
- [Algorythmos-AI/wassup-secretary PR #2](https://github.com/Algorythmos-AI/wassup-secretary/pull/2) — fetched 2026-09-24 (search)
- [JohnFattore/FattoreStreet issue #247](https://github.com/JohnFattore/FattoreStreet/issues/247) — fetched 2026-09-24 (search)
- [jposluns/secureconfig PR #233](https://github.com/jposluns/secureconfig/pull/233) — fetched 2026-09-24 (search)
- [Electron notifications docs](https://www.electronjs.org/docs/latest/tutorial/notifications) — fetched 2026-09-24 (search)
- [felixrieseberg/electron-windows-interactive-notifications](https://github.com/felixrieseberg/electron-windows-interactive-notifications) — fetched 2026-09-24 (search)
- [electron/electron PR #51286](https://github.com/electron/electron/pull/51286) — fetched 2026-09-24 (search)
- [Activating toast notifications from desktop apps — Microsoft Learn](https://learn.microsoft.com/pl-pl/windows/uwp/design/shell/tiles-and-notifications/toast-desktop-apps) — fetched 2026-09-24 (search)

Repo sources (read directly, not web): `docs/planning/sprint-2/91_REQUIREMENTS_v3.md` §1.6, §1.9,
§2 (P-33..P-43), §4, §6; `docs/planning/sprint-2/82_PHASE14_containers.md`; `docs/planning/sprint-2/research/82_RESEARCH_phase14_R1_blackboard_login.md`,
`_R2_claude_unattended.md`, `_R4_compose_architecture.md`, `_R5_bb2dash_inventory.md`;
`project-state/STATUS.md`; `project-state/ORCHESTRATOR.md`; `project-state/DECISIONS.md` (tail).
