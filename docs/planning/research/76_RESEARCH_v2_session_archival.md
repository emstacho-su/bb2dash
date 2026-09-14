# R-V2 research — session archival, context tagging, RAG hand-off

Researcher R-V2, 2026-09-14. Brief: `66_SESSION_ARCHIVAL_RAG.md`. Index answers (§1): hook auto-tags
with manual additions allowed; existing notes moved + re-tagged from git; concluded after 24 h
without resume; DoD = the brief's acceptance list, PM-verified.

## 1. Comparables / references

1. **Obsidian Properties + Dataview** — typed YAML frontmatter *is* the query layer; the vault
   becomes "a queryable set of notes" read from frontmatter and inline fields
   ([Dataview](https://blacksmithgu.github.io/obsidian-dataview/annotation/add-metadata/)).
   Contrast **Dendron**, hierarchy-first, where "metadata is currently underutilized … there isn't a
   built-in way to easily query by it" ([Obsidian vs Dendron](https://wiki.dendron.so/notes/a84ff014-e871-445d-9366-d97f1ad882f1/)).
   Lesson: folders are navigation, frontmatter is retrieval. R-27.1 wants both.
2. **MADR / ADR lifecycle** — statuses *proposed, accepted, deprecated, superseded*; a record is
   immutable once accepted and a **new** record supersedes it via an explicit link
   ([MADR](https://adr.github.io/madr/decisions/)). Exactly R-27.2's `supersedes` chain.
3. **LlamaIndex `MetadataFilters` / LangChain `SelfQueryRetriever`** — filters translate to
   store-native predicates applied **at the storage layer, not post-hoc**; the classic failures are a
   type mismatch that silently returns zero rows and LLM-generated filter values naming categories
   that don't exist ([LlamaIndex](https://developers.llamaindex.ai/python/framework/optimizing/basic_strategies/basic_strategies/)).
4. **pgvector** — HNSW has no in-index filtering, so a `WHERE` clause lands after the ANN scan unless
   the planner pre-filters; large tables need `gin(metadata jsonb_path_ops)`, and 0.8.0 improved
   filter costing ([pgvector](https://github.com/pgvector/pgvector),
   [0.8.0 notes](https://www.postgresql.org/about/news/pgvector-080-released-2952)). Chroma by
   contrast can't filter list-valued metadata at all
   ([Chroma](https://docs.trychroma.com/docs/querying-collections/metadata-filtering)) — our `tags: []`
   design only works because the store is jsonb.
5. **Claude Code hooks reference** — `SessionEnd.reason` ∈ `clear|resume|logout|prompt_input_exit|other`;
   SessionStart `source` ∈ `startup|resume|clear|compact|fork`; "SessionEnd hooks share a 1.5-second
   budget; if your settings set a longer per-hook `timeout`, Claude Code raises the budget to match,
   up to 60 seconds" ([hooks](https://code.claude.com/docs/en/hooks)).

## 2. Patterns to copy

**Frontmatter schema.** Flat, lowercase-underscore, scalar-first, ISO dates, closed enums. Add
`schema_version: 1` — without it you cannot distinguish "field absent because old note" from "field
absent because unknown", and cannot target a partial re-ingest. `id: session-<uuid>` stays the only
key; harness `ingestion.md` already argues why a path key breaks on rename.

**Tag vocabulary governance.** Folksonomy's documented failure modes are synonyms, homonyms, low
precision; the fix is a **preferred-term list** with synonym mapping
([Webology](https://www.webology.org/2007/v4n2/editorial12.html)). So: a machine-readable vocabulary
(YAML list in `docs/tags.md`), hook maps signals → preferred terms, unknowns become `unclassified`
in the weekly list. Manual additions allowed, but the term must join the vocabulary file in the same
commit; ingest *warns* on an off-list tag, never rejects.

**Resume-chain modelling.** MADR's supersede link plus SCD-2's validity interval: a note is valid
from `started_at` to `concluded_at`, only the chain tail is `concluded`, and both `supersedes` and
`resumed_from` are stored so the chain walks either way. Status ratchets forward only
(`active → concluded → superseded`); a late `SessionEnd` must never demote a note.

**Per-note ingest trigger.** `--only` still runs the full `(source, external_id)` hash probe, so a
double fire is a provable no-op. Child detached; hook exits 0 inside its deadline regardless.

**Metadata filter design.** Push `filter_metadata` into *both* RRF arms (existing `rag.search`
policy — filtering after fusion starves `match_count`); GIN `jsonb_path_ops` on `documents.metadata`;
expose a **closed** parameter set (`repo`, `phase`, `tags`, `include_superseded`) on the MCP tool
rather than free-form jsonb, because the callers are models.

## 3. Anti-patterns

* **Over-tagging.** Ten tags per note is noise; cap ~5 (area + activity + phase).
* **Mutable ids.** `<date>-<id8>.md` is a mutable key — a resume changes the date and strands the old
  row. One note per full `session_id`, never renamed, never keyed on date.
* **Blocking hooks.** No network in `SessionEnd`: no `gh pr view`, no embedding, no Postgres. Local
  `git log`/`git config` only, everything else behind the deadline check.
* **Post-filtering after ANN** — returns fewer than `match_count` and reads as "nothing matched".
* **Type-sloppy filters.** `{"prs":[6]}` vs `{"prs":["6"]}` silently returns nothing; freeze one type
  per field in the W-H1/W-H2 seam.

## 4. Standard operating procedure

* **Fixture transcripts.** Commit 3–4 redacted real JSONL transcripts (plain end; resume chain;
  subagent with `parent_session`; cross-repo cwd). The hook has no tests today — this is the unit
  boundary.
* **Golden frontmatter (approval testing).** Render each fixture → note, diff against a committed
  golden `.md`; schema drift then fails loudly instead of quietly changing what ingest stores.
* **Idempotent re-ingest.** Run `ingest` twice over a fixture vault: identical row counts, identical
  `content_hash`, **zero embed invocations** on pass two — the harness's content-hash short-circuit
  is the thing under test ([Prefect on idempotency](https://www.prefect.io/blog/the-importance-of-idempotent-data-pipelines-for-resilience)).
* **Migration rehearsal.** Run the `bb2dash-retrieval` → `bb2dash` move on a copy; assert no duplicate
  `external_id` and the old folder gone.
* **Store-level assertions** (Great-Expectations style, plain SQL): every `type: session` doc has
  non-null `repo`; `status` in enum; `tags ⊆` vocabulary; no dangling `supersedes` target.
* **Scheduler health = staleness, not failure.** A job that never fires emits no error; the nightly
  run writes a last-success timestamp and the check asserts it is under 36 h old.

## 5. Proposed DoD checklist

- [ ] One note per session id for all Phase 7–9 sessions under `vault/projects/bb2dash/sessions/`;
      `bb2dash-retrieval/` gone. *Check:* file count == distinct `session_id` count.
- [ ] Every session note carries `repo`, `branch`, `phase`, `status`, `schema_version`. *Check:* SQL
      over `rag.documents` returns zero nulls for `metadata->>'type' = 'session'`.
- [ ] `collection` comes from the git remote; folder fallback is flagged. *Check:* worktree fixture
      test asserts `bb2dash` and no `collection_source`.
- [ ] Every tag is in `docs/tags.md` or exactly `unclassified`. *Check:* set-difference assertion in
      the suite plus the same query over the live store.
- [ ] No note exceeds 5 tags. *Check:* `jsonb_array_length(metadata->'tags') <= 5`.
- [ ] End → resume → end yields one `concluded` note, chain intact, earlier note `superseded`.
      *Check:* resume fixture's golden frontmatter.
- [ ] Status never regresses. *Check:* test replays a stale `SessionEnd` over a `concluded` note.
- [ ] Hook stays in budget on the largest fixture. *Check:* asserts < 1200 ms; log records ms.
- [ ] Hook never writes a credential. *Check:* redaction test over a fixture seeded with a JWT, an
      `sb_` key and a connection string.
- [ ] Ending a session updates `rag` within a minute, no manual step. *Check:* end a real session,
      `search_context` a phrase from it; log shows the `--only` run.
- [ ] `ingest --only` on an unchanged note performs zero embeddings. *Check:* second-run test.
- [ ] `filter_metadata` on `repo` + `phase` returns the Phase 7 PM session and both workers, workers
      carrying `parent_session`. *Check:* the brief's acceptance query, as a test.
- [ ] `include_superseded=false` is the MCP default and excludes superseded notes. *Check:* two calls
      differing only in the flag return different counts.
- [ ] GIN index on `documents.metadata` exists and is used. *Check:* `EXPLAIN` shows a bitmap index
      scan, not a seq scan.
- [ ] Nightly reconcile registered, last success < 36 h; docs updated; suite ≥ 261 green.
      *Check:* health query + `uv run pytest`.

## 6. Open questions for Stack

1. **Manual tags** — edited into the note (so the hook must *merge* frontmatter, not rewrite it), or
   added via a command? This changes the hook's write path.
2. **Cap of 5 tags** — accept, or uncapped with a weekly review?
3. **A session resumed on day 3**, after the sweep concluded it: reopen (status regression) or start
   a new note that `resumed_from` it? Recommendation: the latter — ids stay immutable.
4. **Class sessions** — same relational fields (no git remote), or a reduced schema flagged
   `collection_source: folder`?
5. **Cross-repo sessions (G4)** — collection by cwd repo, or split? Recommendation: one note plus
   `repos_touched: []` so the filter still finds it.
