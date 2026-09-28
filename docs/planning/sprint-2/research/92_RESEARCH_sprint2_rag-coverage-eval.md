# 92 — Sprint 2 research: rag-coverage-eval

Date 2026-09-24 · Researcher: Sonnet (Stage B) · Scope: §3 S2-rag-1 plus R-61, R-62, R-74, R-77 and §2 P-23, P-24

## 0. Summary

Nothing in scope needs new infrastructure — every ask has a direct precedent already live in this
repo (`v_embedding_status`, `embed-corpus`'s own `dry_run`, `transform_tick`/`calendar_push_tick`'s
pg_cron-drain shape, 19 existing `db/tests` files). The work is wiring, not invention. The single
biggest risk found: `embed-corpus`'s chunker caps parts at 1600/1400 **characters**, a proxy for
gte-small's real 512-**token** ceiling — dense or short-word text could silently exceed the true
budget and get truncated by the model with no error surfaced anywhere. Second: `v_embedding_status`
and `embed-corpus`'s scan both operate at the **unit** level, not the **part** level, so a unit with
2 of 3 parts embedded already reads as "embedded" today — the coverage assertion R-61/P-24 ask for
does not exist at the granularity the requirement names. Third: P-23 (this sprint, R-60/R-61) and
P-37 (Phase 14, R-81) are the same undecided question — "who embeds pulled files, a drain or the
runner" — asked twice from the same three pieces of evidence; deciding it once now saves Phase 14
from re-litigating it. R-74 and P-24 are pure wiring (docs correction; one `db/tests` file in this
repo's own convention). R-77 stays a measure-first, build-only-if-needed item per the standing
2026-09-10 decision; nothing here changes that default. Total size: six S items, one S/M-conditional
(R-61's OCR/`.doc` automation), nothing over M; the cluster is a single small migration (only if
R-77's ceiling is crossed) plus a handful of scripts, an assertion, and a cron job or skill line.

## 1. S2-rag-1 · rag testing (all materials should be chunked and embedded)

**1. Standard practice.** A RAG pipeline's "coverage" is normally enforced as a pipeline-level data
test — an anti-join across the ingest → chunk → embed tables, run after every load, not a one-off
audit — paired with a small, hand-labeled golden-query set scored by hit@k/MRR and re-run on every
corpus or retrieval-code change so a regression is caught before it ships (`rag-eval-harness`
family, below). For a model with a hard token ceiling, chunking is done by a token-aware splitter
with roughly 10–20% overlap sized to that ceiling, not a character-count proxy.

**2. OSS examples (fetched).**
- **`github.com/matheusPavaneli/rag-eval`** (Python 3.13, Postgres + pgvector — the closest stack
  match found) stores its golden set as **character spans into source documents**, not chunk ids,
  and **re-resolves every span against the live corpus each time the set loads**, refusing to score
  "over a partial index or a corpus version it cannot resolve every span against." Borrow: don't
  trust `EVAL_EMBEDDING_POC.md`'s 2026-09-09 `text_id`/`file_id` ground truth as-is — re-validate
  each answer still lives where it says before re-scoring, the same way. It also freezes each run as
  `evals/reports/<timestamp>-<corpus-version>-<mode>.json` and keeps ADRs per decision
  (`docs/adr/000N-*.md`) — a pattern worth the frozen-report idea even without adopting ADRs wholesale.
- **`github.com/namanxdev/rag-eval-harness`** (found via search, not fetched) measures precision@k,
  recall@k, MRR **and "span coverage"** across fixed-width vs. clause-aware chunking on 114
  lawyer-annotated spans, reporting "fixed-width severs 57% of clauses; clause-aware keeps 99.1%
  intact." Borrow the *metric*, not the domain: whether a golden answer's span lands entirely inside
  one returned part matters here too, since `embed-corpus` chunks by character count, not by
  paragraph/clause guarantee, and `hybrid_search_file_text`'s snippet is cut from exactly one part.
- **Supabase's own "Processing large jobs with Edge Functions, Cron, and Queues"** (fetched) is the
  primary-vendor precedent for P-23's drain question — see §6 below.

**3. Known pitfalls (sourced).**
- gte-small's model card (`huggingface.co/thenlper/gte-small` and mirrors) states texts are
  truncated to **512 tokens**; `embed-corpus`'s `SINGLE_PART_MAX = 1600` / `PART_TARGET = 1400` are
  **characters**, a ~4-chars/token proxy that has no margin against dense or jargon-heavy text.
- A Jan 2026 chunking-overlap analysis (surfaced in a chunking-strategy roundup search) found
  overlap "provided no measurable benefit and only increased indexing cost" in at least one study —
  not a reason to touch `embed-corpus`'s existing 200-char overlap now, just a note that it is an
  unverified assumption on this corpus, should anyone later want to tune it.
- The anti-join coverage pattern (`LEFT JOIN … WHERE right.key IS NULL`) silently degrades into an
  inner join — and starts dropping the very rows it should be catching — the moment a `WHERE` clause
  touches any other column on the right-hand table (`datawise.dev/anti-joins-in-sql`, search result).
  Keep any coverage query's `WHERE` limited to the join key.

**4. Mapping onto this stack.** The chain is `bb_files` (current, `superseded_by is null`) →
`bb_file_text` (units) → `bb_text_embeddings` keyed `(text_id, model, part_no)`. `v_embedding_status`
(migration 010) already aggregates this **per course, per unit** (`units_embedded` = distinct
`text_id` with ≥1 embedding row) — it does not check that a unit's *every* part exists, so a
long unit missing part 3 of 3 still reads "embedded." `embed-corpus` already computes exactly the
per-part truth on every invocation (`missing_units_before`, `missing_parts_before`,
`remaining_units`, `remaining_parts`) and exposes it for free via `dry_run: true` with no writes —
that is the natural source for a part-level coverage check, not a hand-rolled SQL port of `chunk()`.
Both `v_embedding_status` and `embed-corpus`'s scan currently read **every** `bb_file_text` row,
including ones behind a superseded `bb_files` row (R-63's near-duplicates); "every *current* stored
file" (S2-rag-1, R-61) needs a `bb_files.superseded_by is null` (or `v_bb_files_current`) filter that
neither has today. The retrieval eval itself has no reproducible artifact: `EVAL_EMBEDDING_POC.md`
§6 is a hand-run `pg_net` SQL snippet with request ids 182–221 recorded by hand; nothing replays it.
`sync_runs` already has a precedent row for this exact purpose (`source='manual'`,
`scope='embedding-poc eval'`) that a repeatable runner could reuse for every future run, giving a
queryable hit@1/hit@3/MRR timeline instead of one frozen snapshot.

**5. Size and seams.** M in aggregate across the whole umbrella; each piece below is S. Seams: this
item is the parent of R-61 (coverage + exceptions), R-62 (notes check), R-74 (docs), R-77 (latency),
P-23 (embed trigger) and P-24 (the db/tests file); it shares its "who embeds" question with Phase
14's P-37/R-81 (§6 of P-23 below) and its "current files only" filter with R-63's supersession work.

**6. What the research changes.** Confirms the PM note's framing is right (2 image-only files +
the missing automatic check) but sharpens "the coverage check (every stored file → text units →
embeddings, per part)" to: reuse `embed-corpus dry_run` for the per-part truth rather than
reimplementing `chunk()` in SQL, and scope every piece of this cluster to current files only. Adds
that "what 'chunked' should mean for long units" has a concrete, checkable answer today (≤512
gte-small tokens per part) that the char-based proxy does not yet verify. Adds that "the retrieval
eval to re-run" needs to exist as a saved, re-runnable artifact (query set + scorer), not just a
recommendation to re-run something that today only exists as a paragraph of hand-typed SQL.

## 2. R-61 · Every current stored file has text and embeddings, or a named exception

**1. Standard practice.** Same anti-join / coverage-assertion practice as §1; the "named exception"
half (an OCR'd or otherwise legitimately textless file) is standard as an explicit allow-list or a
status column read by the test, not a silent skip — which this repo already has in
`bb_files.text_status` (`na`) and `bb_files.notes`.

**2. OSS examples.** Same `matheusPavaneli/rag-eval` and `rag-eval-harness` family as §1 — the
relevant borrow here is narrower: their golden-set loaders **fail loudly** rather than skip when a
referenced document has gone missing or changed shape, which is the shape a coverage test wants for
an *unnamed* gap (any current file with no exception recorded) versus a quiet pass for a *named* one.

**3. Known pitfalls.** The anti-join WHERE-clause trap (§1.3) applies directly: a coverage query for
"current files without text" must not filter on `bb_file_text` columns in the same `WHERE` that
tests the join, or it will start passing files that were never joined at all. Token-proxy truncation
(§1.3) applies to any *newly* extracted long file this check would wave through as "has text" while
silently losing content past token 512 in its longest part.

**4. Mapping onto this stack.** Two files carry `text_status = 'na'` today: 17 (a sha256 twin of 15
— already covered by 15's text, so "current with no text of its own" is a false positive a naive
count would raise) and 68 (a GEO.103 `.doc` — `extract_text.py`'s dispatch (`:38`) only handles
`.pdf/.docx/.pptx/.xlsx`, no `.doc`; CLAUDE.md's environment notes confirm `antiword` is on this
machine's Git Bash PATH but nothing invokes it). The assertion therefore needs a **twin exception**
(same sha256 as a covered file → not a gap) alongside the **named exception** (`text_status = 'na'`
with a reason in `notes`), or file 17 fails the check forever. `bb_text_embeddings` is already 100%
covered at the unit level (STATUS 2026-09-24: 784 units, 0 without an embedding) — the real gap is
at the part level, which nothing checks (§1.4).

**5. Size and seams.** S for the hand fix (file 68 converted + posted + embedded), the coverage
check itself, and a DECISIONS row closing R-16's stale OCR premise; M only if `.doc` handling and
OCR fallback are automated in `extract_text.py`/`pull_files.mjs` (optional, sources call this out
explicitly as not required). Seams: `ingest/extract_text.py` dispatch table; `bb_files.text_status`/
`notes`; `v_embedding_status`; `embed-corpus dry_run`; shares its post-embed moment with R-62's check
(both land in P-24's one `db/tests` file).

**6. What the research changes.** Nothing about scope — the entry's own "Still missing" list already
names the twin/OCR nuance. Sharpens the mechanism: the SQL assertion should special-case the sha256
twin (17) rather than trying to special-case every possible near-duplicate by id, and should read
part-level truth from `embed-corpus dry_run` rather than a hand-written re-chunk.

## 3. R-62 · Search never shows speaker-note text unlabelled

**1. Standard practice.** Presentation-derived RAG corpora standardly extract speaker notes as a
separately-labeled segment attached to its slide, either as its own chunk with the slide's context
or inline with an explicit marker so a downstream renderer (or a human) can distinguish "what the
slide says" from "what the presenter would say" — never silently merged into the visible text.

**2. OSS examples (search results).** `python-pptx`'s own docs
(`python-pptx.readthedocs.io/en/latest/user/notes.html`) show the exact API this repo already uses —
`slide.notes_slide.notes_text_frame.text` — confirming `extract_text.py`'s approach
(`s.has_notes_slide and s.notes_slide.notes_text_frame.text.strip()`, prefixed `"[notes] "`) is the
standard access path, not a workaround. A chunking write-up (`dri.es/extract-speaker-notes...`)
recommends keeping notes attached to their slide's chunk rather than splitting them into a separate
unit, which matches this repo's design (one unit per slide, notes appended after slide text within
the same unit) and explains *why* the label has to survive slicing: the notes text lives inside the
same unit `embed-corpus` may later cut into several parts.

**3. Known pitfalls.** The pitfall here is entirely internal, already found by the source verifier
and stated in the requirement: a slice that starts *after* the `[notes]` marker (a part ≥2 whose
`part_range` begins past the marker's character offset) headlines as unlabelled slide text, because
`hybrid_search_file_text` (025) only checks whether the marker **precedes** the slice, not whether
the slice's *content* is entirely past it. No external source is needed to describe this defect; it
is a straightforward off-by-boundary case in a hand-rolled label rule.

**4. Mapping onto this stack.** `extract_text.py` (`:25-26`) is the single writer of the `[notes] `
marker, at extraction time, into `bb_file_text.text`. `hybrid_search_file_text` and
`search_file_text` (migrations 011–025) are the readers that must re-derive the label at query time
from `part_range` vs. the marker's stored offset — today only `hybrid_search_file_text` tries, and
imperfectly (109 of 784 units carry `[notes]`; one is multi-part, unit 750). The fix is a migration
(091+, outside Phase 14's 091–099 block per the sprint-2 allocation rule) replacing both functions so
any snippet text sourced from after the marker carries the label, whichever side of a part boundary
it falls on. The check that proves it belongs in P-24's `db/tests` file, run after every
`embed-corpus` pass (since a re-chunk could move part boundaries relative to the marker).

**5. Size and seams.** M (a migration touching two SECURITY INVOKER functions with a `search_path`
pin, per S2-carry-8's mutable-search_path cleanup already in flight) + the `db/tests` check itself is
S. Seams: `hybrid_search_file_text`/`search_file_text`; `bb_text_embeddings.part_range`; web
`scrubSnippet` (`queries.search.ts:161-173`) and `mcp-server/format.ts:130`, which both currently only
scrub a marker *inside* the snippet and would keep working once the server-side label is correct;
shares its migration with R-74's docs update and, if built, R-77's stored `tsvector` (same function).

**6. What the research changes.** Nothing — this entry is already precisely scoped by the source
verifier's own live-defect finding, including the exact failing cases (`supplicant`/`subrequirements`
queries). Confirms the fix direction (label by content position relative to the stored marker offset,
not by "does the slice start before the marker") is the standard approach for notes-attached-to-slide
extraction, and that the check belongs at the same post-embed moment as R-61's coverage check.

## 4. R-74 · Search API docs state each mode's real result shape

**1. Standard practice.** API surface docs are standardly generated from or checked against the code
they describe (OpenAPI/JSDoc-style single source of truth) rather than hand-maintained prose that
drifts; where that is not practical, the convention is at minimum to fix drifted docs in the same PR
as the code change that caused the drift, which is already this repo's own rule ("If C-3's migration
changes snippet semantics, these docs change in the same PR" — R-74's own Seams line).

**2. OSS examples.** Not researched further — this is a documentation-accuracy task internal to the
repo (three files: `queries.search.ts` comments, `DATA_SYNTAX.md`, the `search` edge function's
header comment), not a pattern that benefits from an external example. The general practice above
(fix docs in the same PR as the behavior change) is the only transferable lesson, and it is already
named as the seam.

**3. Known pitfalls.** The entry's own "State today" already catches the concrete drift (mode-blind
comments claiming `part_no`/`score`/`snippet` apply "to every result row" when they are mode-specific
since migrations 021/024/025). One pitfall worth flagging from reading `EVAL_EMBEDDING_POC.md`
directly: its own "Known issue accounted for" section (line 48) and §5's "whole-unit snippets in
vector mode" pitfall describe **pre-024** behavior (vector mode returning the whole unit rather than
a matched slice) that 024/025 have since partly addressed via `hybrid`'s matched-passage snippet —
the POC doc itself is now one more stale-doc instance of the same class of drift R-74 is fixing
elsewhere, worth a one-line note when this ships, though it is outside R-74's own file list.

**4. Mapping onto this stack.** `web/src/lib/queries.search.ts` (`:19-21, :34-40, :53, :61-64,
:108-114`), `DATA_SYNTAX.md:78, :88-91`, and `supabase/functions/search/index.ts`'s header comment
(the deployed source can differ from the repo until the next deploy — call this out explicitly when
correcting the header, per the file's own existing caveat) are the three edit points. `mcp-server/
README.md:172-181` is already correct and used as the reference shape.

**5. Size and seams.** S, docs-only, no migration. Seams: rides along with any migration that changes
snippet semantics (shared with R-62); no other dependency.

**6. What the research changes.** Nothing about scope. Adds one optional, low-cost line item: note
`EVAL_EMBEDDING_POC.md`'s own now-stale "known issue" framing when this ships, since it describes
mechanics R-74's own fix touches, even though the POC doc is not on R-74's file list.

## 5. R-77 · Palette search stays under the 60 ms ceiling as the corpus grows

**1. Standard practice.** The standard move for a full-text query that recomputes `to_tsvector` per
candidate row at query time is a stored/generated `tsvector` column with a GIN index, so ranking and
covering-test both read a precomputed value instead of re-deriving it; the standard trade-off
decision is measure first, build only if the measured cost crosses the target — exactly this repo's
own 2026-09-10 decision (DECISIONS row 42: "the stored per-part tsvector... is backlog, not this
phase") and STATUS's "only when the palette feels slow, not before."

**2. OSS examples.** Not separately researched beyond the general Postgres pattern (§ below) — this
is a well-worn, single-mechanism Postgres feature choice (`GENERATED ALWAYS AS ... STORED` vs. a
`BEFORE INSERT` trigger), not one with meaningfully different open-source implementations worth
comparing case by case.

**3. Known pitfalls (sourced).** A Postgres-mailing-list thread and a `thoughtbot` write-up
(`thoughtbot.com/blog/optimizing-full-text-search-with-postgres-tsvector-columns-and-triggers`,
search result) both note the real choice is generated-column (cannot reference other tables; simpler)
vs. trigger (needed only if the tsvector must combine columns across a join or weight fields
differently) — for a single-table, single-column case like `bb_text_embeddings`'s per-part text, the
generated column is the simpler and sufficient choice, no trigger needed. Both approaches need the
GIN index; neither is free at write time, but this corpus's write volume (a handful of new files per
sync) makes that cost irrelevant next to the read-time saving.

**4. Mapping onto this stack.** `bb_text_embeddings` currently has no `tsvector` column;
`hybrid_search_file_text` (025:115-132) computes `to_tsvector` twice per candidate part (once for the
cover test, once for `ts_rank`). If the re-measure (item 1 of "Still missing") crosses ~60 ms, the
fix is a `tsvector generated always as (to_tsvector('english', text)) stored` column on the relevant
part text, backfilled, read at both `to_tsvector` call sites — shipped in the **same** migration as
R-62's fix, since both replace the same function body (already named as a seam in R-62 and R-77).

**5. Size and seams.** S for the re-measure (an `EXPLAIN (ANALYZE, BUFFERS)` re-run, no code change);
M only if the ceiling is crossed and the stored column is built. Seams: `hybrid_search_file_text`;
shares its migration with R-62 (S2-carry-8's `search_path` pin applies to whichever version ships).

**6. What the research changes.** Nothing about the default — confirms measure-first is still the
right call and that, if triggered, the generated-column approach (not a trigger) is the simpler
correct choice for this single-table case, closing the "column or trigger" question the requirement
left open.

## 6. P-23 · Embed step or drain so new text units get embeddings without a hand loop

**1. Standard practice.** Background embedding-after-ingest is standardly one of: (a) a step tacked
onto the ingest job itself (call the embed function synchronously right after the pull, simplest,
no new infra), or (b) a scheduled drain that polls for unembedded rows on a fixed cadence, used when
ingest and embedding need to be decoupled (rate limits, a slow embedder, or ingest running somewhere
that cannot also call the embedder). Supabase's own guidance (fetched) frames this as a three-layer
pattern (collect → distribute → process) for genuinely large fan-out jobs; for a handful of new files
per sync, that is more machinery than the job needs.

**2. OSS examples (fetched).** Supabase's **"Processing large jobs with Edge Functions, Cron, and
Queues"** post gives the concrete idempotency shape: mark a queue row processed in a `finally` block
so a mid-run failure can never double-process it, and cap each invocation to a small number of items
so it stays inside the edge runtime's execution window. `embed-corpus` already satisfies both
properties on its own — it inserts each part as soon as it is embedded (not batched at the end) and
already tolerates a re-run overlap via a `23505` duplicate-key catch (`index.ts:298-301`) — so the
drain side of this decision needs **no change to `embed-corpus` itself**, only a caller that invokes
it and checks `remaining_parts`/`remaining_units` in the response to decide whether to call again.

**3. Known pitfalls.** `embed-corpus` runs with `verify_jwt` **on** (CLAUDE.md environment note),
unlike `calendar-push`, which this repo's own team special-cased to `verify_jwt` **off** with its own
`x-push-secret` header from Vault specifically so a cron job could call it (migration 062). A pg_cron
drain calling `embed-corpus` cannot reuse that exact shape — it needs the **anon JWT** in the
`Authorization` header (not a push-secret), held in Vault the same way (precedent: `calendar_secret_
set`/`calendar_secrets`, two service_role-only RPCs, per R-78's must-respect quotes) unless
`embed-corpus` is also flipped to `verify_jwt = false` with its own header secret — a decision this
research does not make for the PM, since it changes the function's security posture. A pitfall found
by direct comparison, not a web source: conflating "no scheduled crawl, no reminders" (D-3, declined)
with this job would be wrong — D-3 is about triggering new **Blackboard crawls**, and an embed drain
touches only already-stored `bb_file_text` rows, so it does not reverse D-3.

**4. Mapping onto this stack.** Two concrete options, both wired to existing infra: (a) a skill-step
addition — `ingest/pull_files.mjs:35-36` (where the "hand embed-corpus loop" already lives per R-60's
own state note) gains a scripted call to `embed-corpus` at the end of a pull, and `skills/bb-sync/
SKILL.md` step 4b gets the same; or (b) a `bb2dash-embed-drain` pg_cron job on the `transform_tick`
(035) / `calendar_push_tick` (062) pattern — `cron.schedule('bb2dash-embed-drain', '<cadence>',
$cron$select public.embed_drain_tick()$cron$)`, a new SECURITY DEFINER function that reads the anon
JWT from Vault and POSTs to `embed-corpus` via `net.http_post`, exactly mirroring `calendar_push_tick`
's shape (open pg_net request → mark done → reap a stuck request after N minutes).

**5. Size and seams.** S either way — no new tables, `embed-corpus` unchanged. Seams: `ingest/
pull_files.mjs`; `skills/bb-sync/SKILL.md` step 4b; `CADENCE_RUNBOOK.md` step 4; if the cron path is
chosen, a new migration (numbered from the sprint-2 allocation, outside 091–099) plus a Vault secret
and the same reaper-lock pattern as `calendar_push_tick`. **Directly duplicates P-37** ("Decide who
embeds pulled files: the runner, or a pg_cron embed drain," `for R-81`, Phase 14) — same evidence
cited by both (`prod cron.job` listing, `pull_files.mjs:35-36`, "SKILL.md: no 'embed'"), same
either/or framing, different phase.

**6. What the research changes.** Adds the concrete mechanism gap the requirement's wording glosses
over: `embed-corpus`'s `verify_jwt = true` means the drain path is not a drop-in copy of
`calendar_push_tick`'s header trick, it needs its own Vault-held anon JWT (or a `verify_jwt = false`
change to `embed-corpus`, a separate call the PM should make deliberately, not as a side effect of
wiring a cron job). Flags that **P-23 and P-37 are the same decision asked twice** — recommends
deciding it once, here, since it is needed now (R-60/R-61 do not wait for containers), and having
Phase 14 inherit that decision for the container runner rather than re-deciding it, closing P-37 by
reference once P-23 ships. See Questions §2.

## 7. P-24 · Post-embed checks as one db/tests file

**1. Standard practice.** A "runs after every pipeline pass" data-quality check is standardly a small
set of assertions executed as part of (or immediately after) the job it is checking, failing loudly
(non-zero exit / raised exception) rather than reporting silently to a dashboard nobody watches —
this repo's own convention, "every task carries an executable check... a task without a check is not
a task" (DECISIONS 2026-09-14), already states the same principle.

**2. OSS examples.** dbt's data-test model (`docs.getdbt.com/docs/build/data-tests`, search result)
is the general reference: a test is a `select` that returns the **failing** rows, and zero rows means
pass — precisely the shape this repo's own `db/tests/*.sql` files already use (`RAISE EXCEPTION
'FAIL ...'` inside a `do $$ ... $$` block when an assertion's condition is violated). No dbt tooling
belongs in this stack (D-19/D-20 keep dependencies out); the pattern, not the tool, is the borrow.

**3. Known pitfalls.** The anti-join WHERE-clause trap (§1.3) again: the coverage half of this file
must not filter on `bb_text_embeddings` columns in the same clause that tests the join to
`bb_file_text`. Running inside `begin … rollback` (this repo's own `db/tests` convention, confirmed
by reading `phase12b_089_work_items_due_on.sql`) means the check is read-only and safe to run as
often as wanted — including after every `embed-corpus` invocation, not just after a full sync.

**4. Mapping onto this stack.** One new file, `db/tests/09X_rag_coverage_and_notes.sql` (number from
the sprint-2 allocation), following the existing convention exactly: `begin;` → `set local role
authenticated;` (or whatever role the checks need — the coverage query only reads) → `do $$ ... end
$$;` blocks, one per assertion, each `raise exception 'FAIL ...'` on violation → `rollback;`. Three
assertions, matching R-61 item 3, R-61's twin/exception carve-out, and R-62's live-defect finding:
(a) every current file (`bb_files.superseded_by is null`) with `text_status <> 'na'` has ≥1
`bb_file_text` row, and every such unit has zero rows in `embed-corpus`'s `dry_run` `missing_parts`
set (call the function from `db/tests` via `net.http_post` + poll `net._http_response`, the same
mechanism `EVAL_EMBEDDING_POC.md` §6 already uses, or port the count query directly — either is
S); (b) every `text_status = 'na'` row has a non-null `notes` reason or is a sha256 twin of a covered
file; (c) a dynamically chosen multi-part `[notes]`-carrying unit (query `bb_text_embeddings` for
`part_no > 1` joined to a unit whose `text` contains the marker before that part's `part_range`
start) round-trips through both `hybrid_search_file_text` and `search_file_text` with the label
present in both modes' snippet — reproducing the exact "supplicant"/"subrequirements" live-leak class
the source verifier found, so a regression re-introducing it fails loudly.

**5. Size and seams.** S. Seams: needs R-62's migration to exist first for assertion (c) to pass
(today it would legitimately fail, proving the bug); needs the "current files only" filter shared
with R-61/S2-rag-1; the embed-corpus `dry_run` call needs the same `net.http_post` + service-role (or
anon JWT) pattern `EVAL_EMBEDDING_POC.md` already used from SQL. Runs manually today (no `db/tests`
runner exists yet — R-79, a separate cluster, is building one); until R-79 ships, this file is pasted
into `execute_sql` like every other `db/tests` file, same as the convention it follows.

**6. What the research changes.** Sharpens "one db/tests file" into a concrete three-assertion shape
using this repo's own existing tools (`embed-corpus dry_run`, the `net.http_post`/`net._http_response`
SQL pattern already proven in `EVAL_EMBEDDING_POC.md`) rather than a new coverage mechanism. Ties
assertion (c) directly to the specific live cases the source verifier already found, so the check is
provably a regression test for a real bug, not a speculative one.

## Research-added requirements

1. **Token-budget check on `embed-corpus`'s chunker.** No current test confirms a chunked part's
   token count (not char count) stays under gte-small's 512-token ceiling. Size S, for R-61/S2-rag-1
   — add a token-count sanity check (even a rough `len(text)/3.5` floor comparison, or a real
   tokenizer call if one is cheaply available in Deno) to `embed-corpus`'s dry-run report or to
   P-24's `db/tests` file, flagging any part whose header + slice is close to or over budget.
2. **Part-level coverage via `embed-corpus dry_run`, not a hand-rolled SQL re-chunk.** R-61/P-24
   both ask for "a unit missing an embedding part" — the only place that logic already exists
   correctly is `embed-corpus` itself. Size S, for R-61/P-24 — call it with `dry_run: true` from the
   `db/tests` check instead of duplicating `chunk()`'s boundary rules in SQL, which would drift the
   moment the TS chunker changes.
3. **Scope every coverage/eval query to current files.** `v_embedding_status`, `embed-corpus`'s scan,
   and a naive eval re-run all currently read every `bb_file_text` row, including ones behind a
   superseded `bb_files` row. Size S, for R-61/P-24/S2-rag-1 — add `bb_files.superseded_by is null`
   (or join `v_bb_files_current`) to whichever query implements the coverage check, so R-63's
   near-duplicates don't produce false "gap" noise.
4. **A reproducible retrieval-eval runner.** `EVAL_EMBEDDING_POC.md` §6 is currently a hand-typed SQL
   snippet with manually recorded request ids; nothing replays the 10 golden queries. Size S, for
   S2-rag-1 — save the query set + expected `text_id`/`file_id` ground truth as a small script or
   `db/tests`-style file, POST each query in all three modes via the same `net.http_post` pattern,
   score hit@1/hit@3/MRR, and write the aggregate to `sync_runs` (reusing the existing
   `source='manual', scope='embedding-poc eval'` precedent row) so results are comparable over time.
5. **Re-validate golden-set ground truth before each eval re-run.** Files have been renumbered and
   superseded since the 2026-09-09 POC (R-63's near-duplicate work). Size S, for S2-rag-1 — before
   scoring, confirm each golden query's recorded `text_id`/`file_id` still exists and is current,
   the same defensive check `matheusPavaneli/rag-eval` does on every load, so a "regression" isn't
   actually just a file that moved.
6. **Resolve the P-23/P-37 duplication in one place.** Both ask the identical question from
   identical evidence. Size S, PM sequencing (not a build task) — decide the embed-trigger mechanism
   once under P-23 (needed now), and record in DECISIONS that Phase 14's sync-runner (P-37/R-81)
   inherits that same mechanism rather than re-deciding it when Phase 14 is built.

## Questions for Stack

1. **Embed-trigger mechanism: a new pg_cron drain (`bb2dash-embed-drain`, matching `transform_tick`/
   `calendar_push_tick`'s always-on shape), or a call tacked onto the existing skill/script steps
   (`pull_files.mjs`, `bb-sync` step 4b) that only fires right after a pull?** — default: the
   skill/script call. Why: it needs no new pg_cron job, no Vault secret, and no change to
   `embed-corpus`'s `verify_jwt` posture; it matches "Stack triggers, the app does the rest" (D-3)
   exactly, since embedding then only ever runs as a direct consequence of a pull Stack already
   triggered, not on an independent clock. A drain becomes worth it only once Phase 14's
   container runner is the one pulling files without a skill step to hang the call on — which is
   exactly what P-37 already asks, later, in that phase.
2. **Should an embedding-coverage gap (a current file past some grace period with missing text or
   parts) surface anywhere Stack sees it — Home's needs-attention row (alongside R-41's stale-sync
   naming) or an Inbox item — or stay a PM-run background check for this sprint, as R-61/P-24 are
   currently scoped?** — default: background check only this sprint (a `db/tests` file the PM runs
   after each corpus change), no UI surface. Why: neither R-61, R-62 nor S2-rag-1's own wording asks
   for a UI element — S2-rag-1's PM note frames the gap purely as "the absence of any automatic
   check," and R-41 is scoped to sync completeness, not corpus/embedding completeness; adding a UI
   surface would be new scope this record does not ask for.

## Sources

- `github.com/matheusPavaneli/rag-eval` — fetched 2026-09-24 (golden-set-as-spans, re-resolve-on-load,
  frozen eval reports, ADR pattern)
- `supabase.com/blog/processing-large-jobs-with-edge-functions` — fetched 2026-09-24 (three-layer
  cron/queue/edge-function pattern, `finally`-marks-done idempotency)
- `github.com/namanxdev/rag-eval-harness` — search result, 2026-09-24 (precision@k/recall@k/MRR +
  "span coverage" across chunking strategies; not fetched in full)
- `github.com/AbhishekRK41/rag-eval-system`, `github.com/riya0920/rag-eval-harness`,
  `github.com/darrshangovender/rag-eval-harness`, `github.com/rajashekarreddy4848/ai-eval-harness`,
  `github.com/vectara/open-rag-eval` — search results, 2026-09-24 (golden-set + hit@k/MRR/recall@k
  CI-gated eval-harness family; corroborate §1.1's standard-practice claim, not individually fetched)
- `huggingface.co/thenlper/gte-small` (and mirror model cards returned by the same search) — search
  result, 2026-09-24 (512-token truncation ceiling)
- `firecrawl.dev/blog/best-chunking-strategies-rag`, `weaviate.io/blog/chunking-strategies-for-rag`,
  `unstructured.io/blog/chunking-for-rag-best-practices` — search results, 2026-09-24 (chunk-size/
  overlap norms, the overlap-provides-no-benefit finding)
- `thoughtbot.com/blog/optimizing-full-text-search-with-postgres-tsvector-columns-and-triggers` —
  search result, 2026-09-24 (generated column vs. trigger for `tsvector`)
- `docs.getdbt.com/docs/build/data-tests` — search result, 2026-09-24 (data-test-as-failing-rows-query
  convention)
- `datawise.dev/anti-joins-in-sql` — search result, 2026-09-24 (anti-join WHERE-clause pitfall)
- `python-pptx.readthedocs.io/en/latest/user/notes.html` — search result, 2026-09-24 (`notes_slide`/
  `notes_text_frame` API, confirming this repo's existing extraction call)
- `dri.es/extract-speaker-notes-from-powerpoint-to-text` — search result, 2026-09-24 (keep notes
  attached to their slide's chunk rather than splitting them out)
- In-repo: `EVAL_EMBEDDING_POC.md`; `DATA_SYNTAX.md`; `db/migrations/010_search_layer.sql`,
  `035_transform_driver.sql`, `062_calendar_push_tick.sql`; `supabase/functions/embed-corpus/index.ts`;
  `supabase/functions/search/index.ts`; `ingest/extract_text.py`; `ingest/CADENCE_RUNBOOK.md`;
  `skills/bb-sync/SKILL.md`; `db/tests/phase12b_089_work_items_due_on.sql`;
  `project-state/STATUS.md`; `project-state/DECISIONS.md`; `project-state/ORCHESTRATOR.md`;
  `docs/planning/sprint-2/91_REQUIREMENTS_v3.md`
