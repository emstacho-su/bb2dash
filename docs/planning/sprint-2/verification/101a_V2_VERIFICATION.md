# 101a — V-2 verification: brief 66 walked on live data (Phase 20)

Date 2026-09-30 · PM: Phase 20, Session A · Brief: `../briefs/101_PHASE20_harness_closure.md` (task 27, P-58, R-99) ·
Walks: `../../sprint-1-hub/briefs/66_SESSION_ARCHIVAL_RAG.md` §Acceptance (A1–A6) and §Definition of done (D1–D15).
Raw record: `101a-evidence-log.md` (the PM's evidence log, kept beside this note). Every figure below comes from that log,
or from a command the PM re-ran on 2026-09-30, marked "re-run".

**SHAs.** Harness `<H>` = `9cffe90` at the start (C-H, 2026-09-29); `ea0e199` after PR-B (agentic-harness #36, merged
2026-09-30 16:37Z on Stack's word); `00539be` after harness PR #37 (`fix/backfill-former-home`, merged 2026-09-30 17:21Z).
bb2dash PR-A is #39, merged 2026-09-30 as `2904b20`. The harness main checkout was pulled `--ff-only` to `ea0e199`, then
to `00539be` (105 §3 note 2).

**C-H at `9cffe90` (2026-09-29):** eval cases `67`; migration files `N = 9`; labels figure `1`.

`<B>` = `C:/Users/stack/.claude-archive/2026-09-30/phase20-backfill`. `hm` = harness-memory (`hqkytnyiiuxovnnyixye`), read-only.

## The 21 lines

| Line | 66's wording (short) | State | Evidence | Closed by |
|---|---|---|---|---|
| A1 | Every Phase 7–9 session under `projects/bb2dash/sessions/`, one note per session id, `repo`, `branch`, `phase`, `prs`, `status` populated; `bb2dash-retrieval` gone | **Met as restated** (B-53: fields where derivable; `phase` and `branch` stay `''` where underivable; re-filing the misfiled notes is R-H3's, harness) | C-18 at 17:33:33Z: `top_level 194 = distinct 194`, `repo_empty_underivable 0 (repo_empty 0)`, `phase_body_mismatch 0`, `changes 0`. Task 19 hm SQL at 17:48:52.710Z: `repo`/`status`/`schema_version` empty = `0`; `phase ''` = `534` (= `phase_underivable_indexed` 534); `branch ''` = `1` (= `branch_empty` 1). Re-run: `ls C:/Users/stack/vault/projects/bb2dash-retrieval` → "No such file or directory" | Task 18 (L20-b), task 19 |
| A2 | `search_context(repo, phase-7)` returns the Phase 7 PM session and its workers, workers carrying `parent_session` | **Met as restated** (B-53: the family is Phase 12's, because no bb2dash PM session had started after L20-a; Phase 7 keeps what the back-fill derives, and its PM note `ac1f5264` now reads `phase: ''`) | Task 26 family SQL on PM `17eb4995-2504-4d28-b240-5a912de4cfdc` (`feat/electron-12-shell`): `family 5`, `matched 5`; ids `session-17eb4995…`, `--a305843dc956f35e4`, `--a31e3cc7f815d4449`, `--a4b841f554a6e70dc`, `--a7db2d00f38186fc0` (the four workers enter the family by `parent_session` = the PM id). Smoke: `search_context(query="Phase 12 desktop shell Electron", repo, phase="phase-12", limit 50, min_similarity 0, include_superseded true)` → 21 chunks from 7 distinct docs, all inside the 7 `phase-12` docs (outside = 0) | Task 26 |
| A3 | End, resume, end: one `concluded` note, `supersedes` chain intact, earlier note `superseded` | **Met live** | Stack's interactive chain, 2026-09-30 17:59Z, token `v2resume20260930b`, session `5e968395-6703-48b3-9b38-fa4b3af37c76` (origin `cli`). C-23: `1`, then `  - 'session-5e968395-6703-48b3-9b38-fa4b3af37c76'`. Store: `session-5e968395…` status `superseded`, `…-r2` `concluded`. (The PM's headless chain first, session `af3dc123-5942-4aa4-a5bd-be4f41380997`, also printed `1` and `  - 'session-af3dc123-…'`.) | Task 23, acceptance step 6 |
| A4 | Ending a session updates `rag` within a minute; the log shows the per-note ingest | **Met on record** | 91 R-99 "Met on record (closed items): acceptance bullets 4-6" (harness PRs #1–#4, 2026-09-16). Not re-walked in Phase 20 | Cited (harness PRs #1–#4) |
| A5 | Nightly run registered; its last run time visible in the log | **Met on record; seen live** | 91 R-99 (acceptance bullets 4-6). Task re-registered by Stack 2026-09-29 with `-RealmSync Apply` (confirmed by `Get-ScheduledTask`). Night 1 log, 2026-09-30T07:02Z: projects `committed->pulled->pushed`, classes `clean->pulled->up-to-date`, harness `committed->pulled->pushed`, realms-push `0` | Cited; night 1 |
| A6 | `docs/ingestion.md` and `docs/retrieval.md` describe fields, vocabulary, scheduler; ingest tests cover the fields and `--only` (≥ 261) | **Met on record; re-checked** | 91 R-99 (acceptance bullets 4-6). Task 15: C-15 `0 / 3 / 1`, `readme-fields.test.mjs` 4/4. Task 16: ingest `1706 passed, 3 skipped` | Cited; tasks 15, 16 |
| D1 | One note per session id; `bb2dash-retrieval/` gone; check: file count == distinct `session_id` | **Met as restated**: top-level notes (a file named `<session_id>.md`) == distinct top-level session ids, since worker notes share the parent's id | C-18 at 17:33:33Z: `top_level 194 = distinct 194`. Final dry run at `00539be`: `top_level 194 = distinct 194`, `bb2dash_notes 805`. `bb2dash-retrieval` absent (A1, re-run) | Task 18 |
| D2 | Every session note carries `repo`, `branch`, `phase`, `status`, `schema_version`; SQL returns zero nulls | **Met as restated**: `''` counted as empty as well as null; `phase ''` and `branch ''` allowed where underivable | Task 19 hm SQL at 17:48:52.710Z: `repo`/`status`/`schema_version` empty = `0`; `phase ''` = `534` (equals `phase_underivable_indexed` 534); `branch ''` = `1` (equals `branch_empty` 1); indexed bb2dash sessions `636`. Before (2026-09-29 17:24:20Z): `91` / `543` / `1` of `598` | Task 19 |
| D3 | `collection` from the git remote; folder fallback flagged; worktree fixture test | **Met on record** | 91 R-99 "Met on record … DoD 3" (harness PRs #1–#4, 2026-09-16) | Cited |
| D4 | Every tag in `docs/tags.md` or exactly `unclassified`; manual tags survive a rewrite (merge) | **Met** | C-18: `unknown_hook_tags 0`. Task 7: after `4fa6aef`, hook-tags, merge, golden, checkpoint-build and frontmatter tests 82/82. Task 25's hand tags: vocabulary checked mechanically, 0 invalid; back-fill report after it `unknown_hook_tags 0` | Tasks 7, 18, 25 |
| D5 | No note exceeds 5 hook-applied tags (manual tags uncapped); array-length SQL | **Met** (per note through `hook_tags`, a PM sub-default under B-52) | Task 19 hm `jsonb_array_length(coalesce(metadata->'hook_tags','[]')) > 5` → `0` (before: `0`). C-18 `hook_tags_over_cap 0`. Task 7 RED at `be4dcbc` exit 1 (8/11 fail), then 82/82. The six-tag worker notes with no transcript here keep their tags with `hook_tags: []` (sub-default "no transcript, no repair") | Tasks 7, 18, 19 |
| D6 | End, resume, end fixture: one `concluded` note, chain intact; status never regresses; a resume after the sweep starts a new note | **Met on record (fixture); met live** | 91 R-99 "DoD 6 (fixture)" on record. Live: the chain of A3 (C-23 `1`, then `  - 'session-5e968395-…'`) | Cited; task 23 |
| D7 | Hook in budget on the largest fixture (< 1,200 ms) and never writes a credential | **Met on record; re-run with extras** | 91 R-99 (DoD 7). Task 10: redact-extra, redaction and budget 36/36; budget 677 ms, 1188 ms with a 20-rule extras file. Task 12: `cmp skills/checkpoint/redact.mjs hooks/lib/redact.mjs` exit 0 | Cited; tasks 10, 12 |
| D8 | Ending a session updates `rag` within a minute, no manual step; the log shows the `--only` run | **Met on record** | 91 R-99 (DoD 8). Note: `sdk-*` notes are not indexed by design (the loader's `SDK_SESSION_REASON`), so task 23's headless notes never reached the store | Cited |
| D9 | `ingest --only` on an unchanged note performs zero embeddings | **Met on record** | 91 R-99 (DoD 9) | Cited |
| D10 | `filter_metadata` on `repo` + `phase` returns the PM session and both workers, workers carrying `parent_session` | **Met as restated** (B-53: Phase 12's family, as A2) | Task 26: `family 5`, `matched 5` on the store's rows (containment `metadata @> {"repo":"emstacho-su/bb2dash","phase":"phase-12"}`, the one `rag.search` applies in both arms); smoke outside = 0 | Task 26 |
| D11 | `include_superseded=false` is the MCP default; two calls differing only in the flag return different counts | **Met live** | `search_context(query="v2resume20260930b", repo="emstacho-su/bb2dash", limit=50, include_superseded=true)` → 5 chunks (`…-r2` x3, `session-5e968395…` x2); `include_superseded=false` → 3 chunks, all `…-r2`; `session-5e968395…` absent | Task 23 |
| D12 | GIN index on `documents.metadata` used by both RRF arms; filtered results still reach `match_count` | **Met** (re-taken 2026-09-30; last run had been 2026-09-16) | Task 24, phase-12, `<E>` = first chunk of `session-17eb4995…`. vec arm: Nested Loop driven by Bitmap Heap Scan on `documents d` from Bitmap Index Scan on `documents_metadata_idx` (Index Cond `metadata @> {repo, phase-12}`), chunk Index Scan nested inside. txt arm: same driving node (actual rows 9, 7 docs), chunk scan nested with `tsv @@ 'phase'`. `rag.search(E, 'phase', 5, min_similarity null, filter)` → 5 rows; phase-12 docs = 7 (≥ 5) | Task 24 |
| D13 | Back-fill: moved notes carry git-derived `branch` / `commits` / `prs` where derivable; underivable empty, not guessed | **Met on record; extended** | 91 R-99 (DoD 13). Task 14: backfill-fields 21/21. Final dry run at `00539be`: 71 `commits` and 45 `prs` change lines among 1695. C-18 re-run `changes 0`; `0e3b3d00` and `ac1f5264` both `phase ''` (the wrong `phase-7` / `phase-10` cleared) | Cited; tasks 14, 18 |
| D14 | Nightly reconcile registered, last success < 36 h; docs updated; `uv run pytest` ≥ 261 green | **Met** | 91 R-99 (DoD 14) on record. Night 1, 2026-09-30T07:02Z, realms-push `0`. Task 16: ingest `1706 passed, 3 skipped`; hooks 1079 pass / 1 fail (the self-copy, closed in `a4f6268`: 1080 pass, 0 fail) / 3 skip; mcp typecheck ok, 196/196. Task 15: C-15 `0 / 3 / 1` | Task 16; cited |
| D15 | Both harness PRs pass `/code-review` and `/security-review`; the migration to harness-memory is byte-identical | **Met** | Task 24 ledger at `00539be`: `ingest db migrate --dry-run` → "9 already applied, 0 pending"; N = 9 files (C-H read 9); `rag_meta.schema_migrations` 9 rows, same versions and order. `supabase_migrations` 6 rows: md5 equal for `20260915144257` (0d221c15…), `20260921223446` (42d24118…), `20260921223612` (5ba7a36d…); the three 2026-09-09 rows equal once the file's final newline is dropped (5833c115…, 97c12d07…, 246035e1…). `20260924201225`, `20260927200342`, `20260927214500` proved by their `rag_meta` rows alone. PR-B #36: `/security-review` no findings; `/code-review` high 1 high (stale in-repo `/checkpoint` copy, closed in `a4f6268`), 1 medium, 2 low. PR #37: 1 low fixed (`589792f`, `2454f9e`) | Task 24; PR-B and PR #37 gates |

## Before and after (task 3 vs task 19)

Both taken with hm SQL on `rag.documents`, `source = 'obsidian'`, `collection = 'bb2dash'`, `type = session`.

| Count | Before (2026-09-29 17:24:20Z) | After (2026-09-30 17:48:52.710Z) |
|---|---|---|
| `hook_tags` longer than 5 | 0 | 0 |
| `repo`, `status` or `schema_version` empty | 91 | 0 |
| `phase` empty | 543 | 534 (= `phase_underivable_indexed`) |
| `branch` empty | 1 | 1 (= `branch_empty`) |
| indexed bb2dash session notes | 598 | 636 |

The task 19 report and SQL were taken back to back (105 §3 note 3): C-18 report 17:47:52Z to 17:48:52Z (`changes 0`,
`phase_underivable_indexed 534`, `branch_empty 1`, `bb2dash_notes 806`), SQL at 17:48:52.710Z.

L20-b itself: apply at `00539be` with `--relocate ca25962a/22581e0d=classes/ist466`, 804 notes written, 804 originals in
`<B>`, `<B>/backfill-apply.txt` 1699 lines; `sync-realms --push` exit 0 (projects and classes pushed, harness
up-to-date); ingest exit 0 (463 metadata-updated, 388 unchanged, 1010 chunks written). `classes/ist466` holds the 2
relocated notes; `projects` holds 0.

## Eval

`uv run ingest eval --json`, 67 cases each time.

* Before (task 3, P-61, harness commit `7dbec66`, `ingest/eval/baseline-pre-phase20.json`): hit_rate `0.9193548387096774`
  (0.9194). Re-read before L20-a (at `ea0e199`) and before L20-b (17:28Z): 0.9194.
* After (task 19): hit_rate **0.9355**. `hit_rate >= baseline` prints `true`. File `<B>/baseline-post-phase20.json`,
  not committed to the harness.

## Untagged review (task 25)

On Stack's instruction of 2026-09-30 ("I would like an agent to mark the 339 notes but not for review ... multiple ways
to verify a proposed tag"). 341 notes were `unclassified` at the time.

* Method: one evidence file per note (prompts, cwd, collection, branch, files, commands, parent tags); **two blind Opus
  taggers**, each tag needing at least two independent sources; only tags both proposed were applied. Vocabulary and
  phase-field checks were mechanical.
* Tagger A tagged 311 notes, tagger B 308; they agreed on 347 tags across 303 notes. Disagreements were dropped (A-only
  54, mostly `review`; B-only 13). 0 invalid tags.
* Applied as hand tags (`hook_tags` untouched); `unclassified` removed only where tags were added; the body's Tags row
  updated; 303 originals in `C:/Users/stack/.claude-archive/2026-09-30/phase20-tagging`.
* **Unclassified 341 → 38.** The 38 stay on purpose (the taggers did not agree). Back-fill report after:
  `phase_body_mismatch 0`, `hook_tags_over_cap 0`, `unknown_hook_tags 0`. Realms pushed.
* `--due` before: "due: no review recorded", exit 3. `--mark-reviewed` at 2026-09-30T18:12:51Z; `--due` then exit 0
  ("not due"); `--json` lists 0 since the review.

## Other checks walked

* **R-97, task 2 (first half):** PR-A merged; the merged blob written over `~/.claude/skills/inbox-apply/SKILL.md`; C-2
  `cmp` `0`; OneDrive stub `.md` count `0`; installed Step 0 prints
  `vault=C:/Users/stack/vault ingest=C:/Users/stack/agentic-harness/ingest realm=projects ok`. 541–544 archived = 4
  (checked 2026-09-29), `v_inbox_queue` = 0.
* **L20-a (task 17):** Stack ran `install.mjs` at 16:51Z: 14 files installed, all 35 verified byte-identical, backup
  `~/.claude/hooks/backup-2026-09-30T16-51-58-190Z`. C-17: `same` x6 (harness `ea0e199`).
* **Task 20 (B-55):** gitleaks 8.30.1, `gitleaks git <V>/<realm> --redact`, 2026-09-29 ~18:14Z: projects 6 commits /
  5.50 MB, classes 2 commits / 1.09 MB, harness 4 commits / 1.55 MB; each exit 0, no leaks.
* **Task 21 (PR-C skills):** `install-checkpoint --repo` from harness `ea0e199`; C-21 `equal / equal / equal / 1 / 1`;
  Step 0 through `resolve-config.mjs` checked in six cases (live ok; classes realm STOP; BOM and space ok; missing vault
  STOP; missing machine file STOP; a quote in the path STOP as unsafe).
* **Task 22 (R-B4 credential test):** exit 2 in 2064 ms; all three realms "error (credential missing or rejected for
  origin: fatal: could not read Username for 'https://github.com': terminal prompts disabled)". A normal push right
  after: projects `clean->pulled->pushed`, classes and harness up-to-date, exit 0.

## Deviations from the brief

1. **Three-night live-lane prerequisite waived by Stack** (2026-09-30: "I don't want to wait 3 nights. If last night
   worked fine we are good to go."). Night 1 (2026-09-30T07:02Z) was clean for all three realms. L20-a and L20-b ran
   after one night.
2. **The nightly is no longer a gate to close the phase** (Stack, 2026-09-30, the same message as the credential test).
   Task 22's three consecutive nights (C-22's twelve `1`s) are not collected.
3. **Acceptance step 7 (cloud `/checkpoint`) struck** by Stack (2026-09-30: "Leave the cloud checkpoint (feature is not
   that important)"). R-98 rests on tasks 12, 13 and 21.
4. **Credential test run by the PM, non-destructively** (task 22, on Stack's "lets do the credential test"): the stored
   GitHub credential was not removed; git ran the one command with an empty `credential.helper`
   (`GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0=`, in bash). A first attempt from
   PowerShell was invalid (PowerShell drops an empty env value, so git failed on config parse before any network call)
   and was discarded.
5. **Task 23's search half needed Stack's interactive session.** The PM's headless chain (`claude -p`) passed C-23, but
   its notes carry origin `sdk-cli`, which the loader skips by design, so neither was in `rag.documents` and D11 could
   not be proven from it. Stack's interactive chain at 17:59Z closed A3, D6 and D11.
6. **Tasks 26 and 24 used Phase 12's family** (PM change 2026-09-30 on Stack's "complete tasks 24 and 26" now): no
   bb2dash PM session had started after L20-a, so the family is Phase 12's PM `17eb4995…`, the most recent phase PM
   whose whole family carries its phase and whose phase holds ≥ 5 docs.
7. **`absolute_files_modified` is 6, not 0, left on purpose** (PM call 2026-09-30). The paths sit outside any repo:
   Temp scratch (3 notes), the old OneDrive vault (1), a cloud `/home/user` path (1), and `bbc5feeb` (today's Phase 16 PM
   session, Temp scratch paths). C-18's check is restated as "0 absolute paths inside a known repo".
8. **Task 24's three 2026-09-09 migrations** differ from the stored statement only by the file's trailing newline:
   md5 of the file without its last byte equals the stored statement's md5 exactly; `length()` differences are the em
   dash (1 character, 3 bytes). No SQL drift.
9. **Known gap: note `b46dd7f8-419f-4146-bfda-c9c1af6cb0ed`** (`projects/bb2dash/sessions/`) is 0 bytes on disk since
   2026-09-29 09:48, first committed empty in `3728ab6` (night 1), not in `rag.documents`; its transcript is only on the
   retired laptop, so it cannot be rebuilt here. Its 21 workflow agents take `bb2dash` through the project-folder rule.
10. **Task 2's final real Apply run is pending** an Inbox item to apply. Its first step (installed copy, `cmp` 0, the
    Step 0 line, stub count 0) is done; `inbox-541..544` were archived before PR-A merged.
11. **Stale phase tags kept** (PM call 2026-09-30, Stack silent for two messages): where a wrong `phase` was cleared on a
    note with no transcript, its `phase-N` tag stays, since under H-3 a note with no `hook_tags` treats every tag as
    hand and hand tags are never removed. The phase filter reads the `phase` field, not tags.
12. **Idempotency defect found and repaired by hand:** `cp-cse_012fboK5z1h7BKejm8ct6NNv` (a cloud checkpoint note whose
    body had no trailing newline) had "## Session facts" glued to its last line, so a re-run kept re-rendering it
    (`changes 1`). The only note affected (grep); the PM inserted the line break (original in `<B>`).
13. **Former-home fix (harness PR #37):** dry run #1 found `repo_empty_underivable 182` and `absolute_files_modified 20`
    because old notes carry `C:/Users/estac/...` paths from the retired machine. PR #37 taught the back-fill that home;
    dry run #2 read `repo_empty_underivable 0`.

**Harness follow-ups (not Phase 20 blockers):** (1) `rerenderFacts` appends "## Session facts" without a leading newline
when the body lacks a trailing one (deviation 12); (2) marking a note `superseded` does not re-render the body's Status
row (`af3dc123`, `5e968395` read "concluded" in the body while frontmatter and store say `superseded`).

V-2 closed: pending Stack's word
