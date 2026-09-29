# 109 — Sprint 3 research S3-R3: MCP architecture

Date 2026-09-29 · Researcher: Sonnet (S3-R3) · Charter `../108_SPRINT3_RESEARCH_CHARTER.md` §2 "S3-R3" · Intake `../107_SPRINT3_INTAKE.md`.
Egress: `modelcontextprotocol.io` was blocked from this sandbox; MCP facts come from `raw.githubusercontent.com/modelcontextprotocol/*`. Web fetches return model-summarised text, so an exact call signature below is marked "unverified" where the summary did not quote it. Nothing here touched Blackboard.

## 0. Summary

**Default: candidate (a).** One TypeScript package, `blackboard-mcp/` (107 Q9), with three layers: a client library, a `bb` CLI (`login`, `whoami`, `crawl`, `sync`, `pull`) and a stdio MCP server. The MCP server is a read-only question surface. It never runs the sync, so B-43 stands (107 §4).

- Candidate (c) is a packaging step on top of (a): the Phase 14 image copies the built package. It cannot be the default because Docker does not exist on the laptop until cut-over (CLAUDE.md, "Environment gotchas").
- Candidate (b) puts an LLM in the sync path and cannot serve the container runner or B-45.
- The session file is a trimmed Playwright `storageState` JSON under `%LOCALAPPDATA%\bb2dash\`. Only `bb login` uses a persistent browser profile. Registration passes paths, not secrets.
- The library sits behind a `Transport` port. If the live probe shows Node cannot use `/learn/api/v1` with a copied cookie, a Playwright `APIRequestContext` transport (already proven at `skills/bb-sync/SKILL.md:167`) drops in without changing anything above it.
- Under 107 §5 option (ii): Phase 14 tasks 4, 8, 9, 10, 12, 15, 18 and the launcher change, Phase 18 tasks 5, 18, 19, and Phase 19 task 17's grep. Migrations 091–094, 124–127 and 131–137 are untouched. Sprint 3 needs no migration; 150 is conditional.

## 1. Three candidate architectures

Scale: 2 = meets, 1 = partial or unproven, 0 = fails.

**(a) Library + `bb` CLI + stdio MCP, one package.** `bb crawl` and `bb sync` call the library. The MCP server calls the same library for reads. `bb-sync`, the Phase 14 runner and B-45's queued request call the CLI or import the library.

**(b) Library + MCP only; `bb-sync` drives it through Claude.** The sync is an MCP tool a Claude session calls.

**(c) Library inside Phase 14's runner image; MCP is a second container command.** The runner imports the library. Claude Code on Windows reaches the server through `docker run -i --rm`, as brief 100 task 17 plans for the materials server (`docs/planning/sprint-2/briefs/100_PHASE14_containers.md`, Files, W-56).

| Criterion | (a) | (b) | (c) |
|---|---|---|---|
| B-43: no LLM in sync, Claude away from the cookie | 2. The sync is CLI-only. The MCP process holds the cookie and returns none (107 §4). | 0. A model calls the sync. Claude is not shown the cookie, but B-43 also says "no LLM in the path". The container would need `claude_oauth_token` (brief 100, Stack's calls, B-43 row). | 2. The runner is deterministic. |
| R-28/R-86 portability | 2. Node plus `path`/env. Playwright is needed only for `login`, behind a dynamic import. | 1. Same code, but the scheduled sync cannot run without Claude. | 1. Correct target state, but the laptop has no Docker today (CLAUDE.md), so "Windows today" fails. |
| `bb_raw` envelope byte-compatible | 2. The envelope module is shared, and a differential test pins it (§5). | 2. Same. | 2. Same. |
| Cost $0 | 2. Local Node. | 2. Adds Claude turns per sync. | 2. Local Docker. |
| Tests without a tenant | 2. Transport and Sink ports plus recorded fixtures (§5). | 2. Same. | 1. Container tests need Docker. |
| Callers: `/bb-sync`, B-45, `sync_*` RPCs | 2. Skill step 3 runs `bb crawl --run-id`. The runner and `bb sync` share one function. B-45 reaches it through the queue. | 0. The runner and B-45 have no LLM to call it (brief 100, runner pass). | 2 in the container, 0 on Windows. |
| Total (max 12) | **12** | 7 | 8 |

Why (a) is a superset: the runner's loop, RPC client and report (brief 100 task list, tasks 9–11) wrap the library's `crawlAll()`. The image is a later `COPY`.

Precedent: campus-cli is one TypeScript package with a CLI and a stdio MCP (`npx campus-cli@2.0.0 mcp`), licence ISC (https://raw.githubusercontent.com/alejooroncoy/campus-cli/main/README.md). The CLI/MCP split is the same. Difference: campus-cli exposes mutations (upload, submit) from the same process.

Layout:
- `src/lib/` holds `session`, `transport`, `endpoints`, `mappers`, `envelope`, `raw-sink`, `files`.
- `src/cli.ts` and `src/mcp.ts` are the two entry points.
- `test/` and `scripts/smoke.mjs` follow `mcp-server/`.
- Ports: `Transport`, `SessionStore`, `RawSink` (publishable-key POST to `bb_raw`), `Registrar` (runner only).

## 2. Session store

**Standard practice.** campus-cli keeps a persistent Chromium profile at `~/.blackboard-cli/browser-profile`, chmod 0700, and reads cookies into a session (README; `login.ts`, https://raw.githubusercontent.com/alejooroncoy/campus-cli/main/src/providers/blackboard/auth/login.ts). Its session file is `~/.blackboard-cli/session.json` and holds plaintext cookies (README). `silentRelogin()` reopens the profile headlessly. Playwright's `storageState` is one JSON of cookies and storage, and Playwright warns it "may contain sensitive cookies … could be used to impersonate you" (https://raw.githubusercontent.com/microsoft/playwright/main/docs/src/auth.md).

**Options.**

| | Persistent profile | `storageState` JSON | Raw `Cookie` header |
|---|---|---|---|
| Node can read it without a browser | No. Chromium encrypts the cookie DB (unverified). | Yes | Yes |
| Carries per-cookie expiry | Yes, but only through the browser | Yes | No. The copied header has no expiry (107 §7 step 2). |
| Keeps Entra cookies for silent re-mint | Yes | Only if Entra cookies are exported too | No |
| Container hand-off | A volume (`bb-profile`) | A secret or volume file; this is R1's design (c) (`docs/planning/sprint-2/research/82_RESEARCH_phase14_R1_blackboard_login.md:121-146`) | Awkward |

**Verdict.** `bb login` opens a Playwright persistent profile at `%LOCALAPPDATA%\bb2dash\bb-profile\`. When Blackboard's `/ultra` loads, it writes `session.json`: a `storageState` reduced to the Blackboard host's cookies plus `{userId, capturedAt, expiresAt}`. Everything else reads only `session.json`. This keeps 107 Q5's profile and gives Node a file.

- **Path.** `%LOCALAPPDATA%\bb2dash\session.json` (107 Q6). `BB2DASH_SESSION_FILE` overrides it and follows brief 100's `X_FILE` shim convention. In a container it lives on the existing `bb-profile` volume, so the frozen volume list does not change (brief 100, Contract, Volumes).
- **Permissions.** Node's `chmod` on Windows changes only the write bit (Node docs, https://nodejs.org/api/fs.html, via summary). So the only protection there is the ACL of `%LOCALAPPDATA%` (unverified). The doctor row should check that the path is outside every git checkout. On Linux, create it mode 0600 and the directory 0700.
- **Rotation.** The store is written atomically (temp file, then rename). It needs a cookie jar, because a page's `fetch` lets the browser absorb `Set-Cookie`, while Node must persist rotated cookies itself. Whether `BbRouter` rotates is unverified (S3-R1). CLI and MCP processes may run at once, so use a lock file. This also enforces the sequential, one-request-at-a-time rule across processes (107 Q10).
- **Exclusion from vault and RAG.** The path is outside the repo and outside `course context/`. Add `**/session.json` and `bb-profile/` to `.gitignore`. The charter says the harness "excludes `bb-profile` already", but that repo is not readable here, so this is unverified.
- **No cookie value in output.** Follow the materials server: typed errors with a `Fix:` hint (`mcp-server/src/errors.ts:197-211`), and startup refusal for a wrong target (`mcp-server/src/config.ts:97-118`). The `Session` class has no `toString` or `toJSON` that reaches cookie values. Errors are built from status and path only. campus-cli's client does not log cookies and strips session headers on cross-origin redirects (https://raw.githubusercontent.com/alejooroncoy/campus-cli/main/src/providers/blackboard/api/client.ts). A test plants a sentinel cookie value and asserts it is absent from every tool result, thrown message and stderr line (§5).
- **Signed CDN URLs.** A signed CDN URL carries its own authorisation (`ingest/fetch_signed.mjs:20`; `ingest/pull_files.mjs:26-28`), so treat it as a credential. Tools never return one.

## 3. Transport and registration

**Default: stdio.** The spec says "Clients SHOULD support stdio whenever possible" and requires that a stdio server write nothing to stdout except MCP messages, with logging on stderr (https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/docs/specification/2025-06-18/basic/transports.mdx). `mcp-server/src/index.ts:5-8` already enforces this. The SDK README calls stdio right for "local, process-spawned integrations" and Streamable HTTP right for "remote servers" (https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/README.md).

**Why not HTTP now.** The process holds a bearer credential. HTTP adds Origin validation, localhost binding and authentication, all of which the spec says servers MUST or SHOULD do (transports.mdx above). It gains nothing on one laptop.

**Stay on SDK v1.x.** `mcp-server/package.json:29-30` pins `@modelcontextprotocol/sdk ^1.30.0` with `zod ^4.5.4`. The SDK's `main` README now describes v2, packaged as `@modelcontextprotocol/server` (https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/README.md, via summary). A v2 move is a separate decision.

**Registration.** Follow `mcp-server/README.md:82-101`:

```
claude mcp add-json blackboard '{"type":"stdio","command":"C:/Program Files/nodejs/node.exe",
  "args":["C:/Users/stack/projects/bb2dash/blackboard-mcp/dist/mcp.js"],
  "env":{"BB2DASH_SESSION_FILE":"%LOCALAPPDATA%/bb2dash/session.json"}}' -s user
```

- `add-json`, scopes and `env` are as in https://code.claude.com/docs/en/mcp. User scope is stored in `~/.claude.json`.
- The env block holds a path, not a secret. The materials server's block holds the service key. That is an improvement.
- Tools appear as `mcp__blackboard__<tool>` (same doc).

**Later, Phase 21.** The workspace container spawns the same binary as `docker run -i --rm` or `docker exec -i`, with the session file as a read-only mount plus a writable jar path (brief 100, Contract, Services and Volumes). Build the server as `createServer(deps)`, transport-agnostic, as `mcp-server/src/server.ts:21-38` does. If Claude and the server ever sit in separate long-lived containers, add an HTTP entry point then.

**Timeouts.** Claude Code's idle tool timeout is about 5 minutes for HTTP and 30 minutes for stdio, and the default output cap is 25,000 tokens with a warning at 10,000 (https://code.claude.com/docs/en/mcp). A crawl runs for minutes, which is a second reason it stays in the CLI.

## 4. Tool surface for sprint 3 (read-only)

Every tool returns both text and `structuredContent`. The spec says a tool returning structured content "SHOULD also return the serialized JSON in a TextContent block" (https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/docs/specification/2025-06-18/server/tools.mdx). Annotations are hints. Clients "MUST consider tool annotations to be untrusted unless they come from trusted servers" (same). The defaults are `readOnlyHint` false, `destructiveHint` true, `idempotentHint` false, `openWorldHint` true (https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/2025-06-18/schema.ts), so every tool sets all four explicitly. Ids must match `^_\d+_\d+$`, as campus-cli enforces against path injection (mcp-tools.ts, https://raw.githubusercontent.com/alejooroncoy/campus-cli/main/src/providers/blackboard/mcp-tools.ts).

All tools below carry `readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true` unless a row says otherwise. Bodies are cut at the crawler's limits (`ingest/bb_crawler.js:482`: 2000 description, 4000 body, 12000 for a full document, set at :490). Lists page with `limit` (default 25, max 50) and `cursor`, to stay under the 10,000-token warning.

| Tool | Input | Output | Endpoint (crawler line) |
|---|---|---|---|
| `bb_session_status` | `probe?: boolean` (default true) | `state` (`valid`, `expiring`, `expired`, `absent`), `userId`, `capturedAt`, `expiresAt`, `lastProbe {status, at}`. Never a cookie name or value. | `GET /learn/api/public/v1/users/me` (Task 0's probe; 107 Q15) |
| `bb_list_courses` | `term?` (default `Fall 2026`) | `[{id, courseId, name, term, role}]` | :597 |
| `bb_get_course` | `course_id` | course detail plus teachers | :582–583 |
| `bb_list_announcements` | `course_id`, `limit`, `cursor` | `[{id, title, body, created, modified, author?, authorUserId?}]` | :585 |
| `bb_list_content` | `course_id`, `parent_id='ROOT'`, `limit`, `cursor` | one level of children (the `slim` shape, :477) | :486 |
| `bb_get_content_item` | `course_id`, `content_id` | title, type, body, `embeddedFiles[{name,url,mime,sessionScoped}]` | :490 |
| `bb_get_gradebook` | `course_id` | Blackboard's own figures only (the `grades` mapper, :498-503). It computes nothing (CLAUDE.md, no what-if). | :498 |
| `bb_get_attempts` | `course_id`, `column_id`, `include_text=false` | attempt rows and file metadata. Stack's submitted prose stays off by default (`results[].text`, :68–70). | :520–555 |
| `bb_get_calendar` | `since`, `until`, `limit` | items | :598 |
| `bb_check_file` | `url` | `{outcome: ok, session_expired, gone, refused, hops}`. No bytes and no signed URL. Uses `resolveSignedUrl` (`fetch_signed.mjs:23-28`). | durable URL |

**Not exposed.** `bb_crawl` and `bb_sync` (B-43); `bb_fetch_file` (file staging stays in bb2dash, 107 Q7). CLI-only: `login`, `whoami`, `crawl`, `sync`, `pull`.

**A later downloader** would be `readOnlyHint: false, destructiveHint: false, idempotentHint: true`, as campus-cli marks its downloads (mcp-tools.ts, above).

**Mutations.** None in sprint 3. Later, use elicitation before anything that changes Blackboard. In MCP, elicitation is `elicitation/create` with `message` and `requestedSchema`, and the response is `accept`, `decline` or `cancel`. The client must declare the capability, and servers "MUST NOT use elicitation to request sensitive information" (https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/docs/specification/2025-06-18/client/elicitation.mdx). Claude Code handles elicitation dialogs (https://code.claude.com/docs/en/mcp, via summary). The v1.x SDK call is `server.server.elicitInput` (unverified: the README summary only points at `elicitationFormExample.ts`). campus-cli asks before uploads, submits and non-GET raw calls (mcp-tools.ts). Its read tools carry no annotations, so it does not set `readOnlyHint` at all.

**Data-trust note.** Announcement and content text is instructor-authored, so it reaches the model as untrusted text. Read-only tools limit what an injection can do; `readOnlyHint: true` on every tool keeps that true. The materials server flags speaker notes for the same reason (`mcp-server/README.md:193-197`).

## 5. Tests

`mcp-server/` shows the pattern: vitest with fakes and no network (`mcp-server/test/helpers.ts:1`), and `InMemoryTransport.createLinkedPair()` for protocol tests (`mcp-server/test/server.test.ts:4,18-20`; the class exists in SDK v1.x `src/inMemory.ts`, https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/src/inMemory.ts). Six layers:

1. **Mappers.** Pure functions ported from `ingest/bb_crawler.js` (exports at :626-631) with their existing cases.
2. **Recorded, scrubbed fixtures.** A `FakeTransport` replays `{method, path, status, body}` records per course. A new `bb record` mode (Stack's laptop only) writes them. A scrub step removes `SCRUB_FIELDS` (brief 100 task 8 names `studentSubmission`). Golden output is committed.
3. **Differential test, until the tab crawler retires.** Feed the same recorded responses to the legacy `installCrawler` through `createRequire` with a stubbed `fetch`, as `web/test/crawler.attempts.test.ts:76-78,191,521` already do. Deep-equal the two payloads.
4. **Envelope contract.** A zod schema of the keys each stage reads (`108_` §A.3), checked against the golden run. Then the golden run goes through the SQL path. Brief 100 task 8 already plans `db/fixtures/phase14/scrub_crawl.mjs` writing `db/tests/phase14_load_crawl_v4.sql`, generated like `db/fixtures/phase12b/build_load_sql.js` and run by `scripts/db-test.mjs`, whose units roll back (`db-test.mjs:2-4`; loader map :35-39). One change: task 8's source becomes the library's replay of scrubbed recordings, not scrubbed `bb_raw` rows. Until recordings exist, task 8 stands as written.
5. **MCP protocol.** Linked in-memory pair. Assert the tool list, that every annotation is explicit, and the sentinel cookie test over every failure path.
6. **Live.** `scripts/smoke.mjs`-style run and 107's `scripts/bb-probe.mjs` (not yet in the repo; 107 §6 Q16 says it rides that PR). After the probe, it becomes `bb probe`.

**Existing web tests.** `web/test/crawler.announcements.test.ts`, `crawler.attempts.test.ts` and `fixtures.phase12b.test.ts` all `require` `ingest/bb_crawler.js`. They stay unchanged while the tab crawler is the fallback (brief 100: the Windows path lives until acceptance, R-93). At retirement they port to `blackboard-mcp/test/` with the same expected values, and `fixtures.phase12b.test.ts`'s drift guard is repointed.

## 6. Seams to sprint 2 under 107 §5 option (ii)

**Phase 14 (brief 100).**

- **Task 1 (freeze).** One new DECISIONS row: the sync half rests on the library. The three runner entry points (`sync/dist/main.js`, `probe.js`, `enqueue.js`), the 11 RPC signatures and the 5 volume names stay frozen, because the session file goes on `bb-profile`.
- **Task 4 (noVNC spike, the gate).** The gate now covers only container login. Brief 100's open item 5 fallback, R1's `storageState` hand-off, becomes the default. "W-55 and W-56 are cut only after task 4's PASS" (task list preamble) is re-cut. The `chromiumSandbox`, seccomp and `--no-sandbox` checks apply only if a browser stays in the image.
- **Task 3 (Task 0).** Unchanged. `KEEPALIVE_MINUTES` becomes a Node `users/me` GET (`touch()`), default 0.
- **Tasks 6, 7, 7a.** Unchanged (091, 094).
- **Task 8.** Source changes as in §5 layer 4.
- **Tasks 9, 10, 12.**
  - `sync/src/crawl.ts` and `files.ts` import the library instead of `addScriptTag` and `page.context().request`.
  - `sync/src/login.ts` reads the probe result from Node. The 302 `Location` host is checked against `LOGIN_HOSTS` (task 4's 82b line).
  - `resolveSignedUrl(get, …)` takes an injected `get` (`fetch_signed.mjs:10-12`), so the library supplies a Node one and the file is unchanged. Whether Node `fetch` with `redirect: 'manual'` exposes a 302's headers is unverified. `node:https` is the fallback.
  - The call-order assertion `claim, register, crawl, wait, files, embed, close` and the `fetch_signed.mjs` grep stand. "Fake page" becomes "fake Transport".
- **Task 15.** A sync-only image can be `node:22-slim`, with no Xvfb, seccomp or `shm_size`, plus the Python set for `extract_text.py`.
- **Task 16.** `docker/grep-clean.test.mjs` scans the new package's COPY sources.
- **Task 17.** Same `node:22-slim` image pattern as `mcp-server/Dockerfile`. Add a second `docker run -i --rm` recipe.
- **Task 18 (launcher).** `syncInitCommand` (`desktop/src/core/sync-command.ts:52-56`) emits `claude '/bb-sync <id>'`. A third `syncLauncher` value could emit the CLI. The id check in `sync-id.ts` protects that command line.
- **Task 28.** Add a third run through the library. The `2 1` parity counts (`bb_gradebook`, `bb_attempts`, `bb_raw`) then compare Node against the tab.

**Phase 18 (brief 98).**

- **Task 5 (v5 probe, `CRAWLER_VERSION = 5`, `authorUserId`, `feedbackToUser`)** and **task 19 (key lists, fixtures `attempts_v4.json`, `RAW_DETAIL`, `phase12b_load_fixture.sql`)** land in `src/lib/mappers` and `envelope.ts`. The greps `grep -c "const CRAWLER_VERSION = 5;" ingest/bb_crawler.js` and `grep -cF "STILL UNVERIFIED" ingest/bb_crawler.js` are re-pointed.
- **Task 18 (author resolution).** At most one `GET /users/{id}` per distinct miss per run, failure counted in `probe.misses`. This becomes a library `getUser(id)` with a per-run cache. Its counting-fake test fits a `FakeTransport`.
- **Ordering risk.** Brief 100 says W-55 and W-56 are cut with Phases 15, 18 and 19 on `main`, so Phase 18 runs first. If the library is not ready, W-50 writes v5 in `bb_crawler.js` as planned and the library ports it. The differential test in §5 layer 3 then guards the port. The PM should make this call at the synthesis.

**Phase 19 (brief 99).**

- **Migrations 131–137 are unaffected.**
- **Task 17.** `grep -c "runAll({ termName: 'Fall 2026', runId })" skills/bb-sync/SKILL.md` → 1 breaks if step 3 switches to `bb crawl --run-id <uuid>`. Either keep the tab text as the documented fallback or amend the grep.
- **Task 18.** The comment greps on `ingest/bb_crawler.js` return 0 if the file is deleted, but `grep -c` on a missing file exits 2.
- **What the register-first tick needs from the client** (99 §Seams, Phase 14 bullet):
  1. A caller-supplied uuid, validated before any request, as `assertRunId` does (`bb_crawler.js:185`, comment at :97). The library never registers.
  2. POST order: `memberships`, each `course`, then `calendar` last. A registered run folds only on its `calendar` row after 136.
  3. Legacy `runAll` posts `calendar` even if a course POST failed (`bb_crawler.js:609-610`). The library should withhold it on any non-2xx course row, leaving 136's 30-minute rule to close the request. This differs from legacy, so the differential test excludes it.
  4. A retried POST hits the unique index `bb_raw_run_kind_shell_uidx (run_id, kind, coalesce(bb_course_id,''))` (`035_transform_driver.sql:63`) and gets a conflict. Treat a conflict as "already landed" for `--resume`, never as an overwrite. Insert-only cannot repair a bad row.
  5. Before 136, the tick folds a registered run once its newest `bb_raw` row is 3 minutes old (`044_ical_collect_and_drain.sql:235-241`). So register-first is deployed only after 136 (99 task 17: "lands only after 136 is applied"). Until then use register-after (SKILL.md:101-113).
  6. Envelope: keep `crawler.version` first. Adding `crawler.client` is safe because stages read `version` only (`bb_crawler.js:590`; migration 050 per the header, :36-37).

**Migrations.** Untouched: 091, 092, 093, 094 (Phase 14), 124–127 (Phase 18) and 131–137 (Phase 19). Sprint 3 needs none in its 150–159 block. If `--resume` is wanted, 150 could add a `sync_raw_progress(p_run_id)` read for `sync_runner`; the 409 rule above makes it unnecessary.

**B-45.** The queue-driven path is unchanged: `sync_enqueue('scheduled')` fills the queue and a runner consumes it (brief 100, RPC signatures). Only the consumer's crawl step changes.

## Questions for Stack

Only one item not in 107 §6:

- **Q12 leaves open where the `sync_runner` DSN lives on Windows.** `bb sync` needs it because the 11 RPCs are granted only to that role (brief 100, RPC signatures). Default: the laptop keeps `claude "/bb-sync"` as the fallback, which claims and registers through the Supabase MCP and calls `bb crawl --run-id`. Claude never sees the cookie. `bb sync` and its DSN exist only in the container.
