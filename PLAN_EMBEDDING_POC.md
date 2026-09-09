# Plan — Embedding proof of concept (open source, $0)

Status: **awaiting Stack's go-ahead before development begins.** Written 2026-09-09.
Constraints set by Stack: open-source model, no paid services, no Docker.

## Model decision: `gte-small` inside Supabase Edge Functions

Supabase's Edge Runtime bundles the open-source `gte-small` embedding model
(`Supabase.ai.Session('gte-small')`) — MIT-licensed, 384 dimensions, runs natively in the edge
function with **no external dependency, no API key, no cost** beyond the free tier we already use.

Why this beats running a bigger OSS model (bge-m3, nomic-embed) in a batch script:

* **It solves query time, not just batch time.** Vector search needs the *user's query* embedded
  by the same model at the moment of search. A batch-only script leaves the hub with no way to
  embed queries; an edge function embeds corpus and queries through one code path.
* Zero infra: no model weights to host, nothing to keep warm, no Docker (per constraint 3).
* Trade-offs, eyes open: English-only (fine — corpus is English coursework); truncates at 512
  tokens (handled by chunking below); retrieval quality below larger OSS models. Acceptable for
  POC. Upgrade path is cheap because `bb_text_embeddings` is keyed by `model` — a better model
  later is a re-embed of ~600 rows, not a schema change.

## Development items (in order, once approved)

1. **Migration `011_gte_small.sql`** — resize `bb_text_embeddings.embedding` and
   `match_file_text()` from `vector(1024)` (sized for the Voyage path we didn't take) to
   `vector(384)`. Table is empty, so this is free. Add a hybrid-search function
   (`rrf` merge of FTS rank + cosine rank) so the hub gets one entry point.
2. **Edge function `embed-corpus`** — reads un-embedded `bb_file_text` units (service role,
   inside the function only), chunks, embeds, inserts into `bb_text_embeddings`
   (`model='gte-small'`). Processes ~50 units per invocation to respect edge CPU limits;
   invoked repeatedly until `v_embedding_status` shows full coverage (~534 units → ~700 rows
   with splits).
3. **Edge function `search`** — takes `{q, course?}`, embeds the query with the same session,
   calls `match_file_text` / hybrid RPC, returns ranked hits. This is the hub's retrieval API.
4. **Eval pass** — ~10 known-answer queries against the corpus ("when is the IST 323 FP proposal
   due", "GEO 103 quiz drop rule", "IST 466 ethics case schedule"), compare top-3 hit rate for
   FTS alone vs vector alone vs hybrid. Written into the run's `sync_runs` row.

## Chunking policy (embed time — bb_file_text stays untouched)

* Every part is embedded with a context header prefix: `"{course} {bucket} — {file_name}: "`.
  Cheap, large retrieval win for slides that say little on their own ("Agenda", "Questions?").
* Unit ≤ ~1,600 chars → one part (`part_no=1`). Covers 522 of 534 units.
* Longer units (the 12 syllabus/doc monsters, up to 24.8k chars) → ~1,400-char parts split on
  paragraph boundaries with ~200-char overlap; `part_range` records the char offsets.
* Sub-200-char slides embed as-is for the POC (header carries most of the signal); merging
  consecutive slides is a later refinement if slide retrieval underperforms in the eval.

## Not doing (and why)

* **Docker** — nothing to containerize; Postgres+pgvector are managed, the model lives in the
  edge runtime. Revisit only if a local dev stack (`supabase start`) is ever wanted.
* **Paid embedding APIs** (Voyage/OpenAI) — deferred until the POC proves the retrieval loop;
  the `model` column keeps the door open.
* **Embedding `bb_content` bodies / announcements** — FTS already covers them; add to the embed
  job in a follow-up if the eval shows file-only retrieval missing answers that live in Ultra
  page bodies.

## Workflow

Development happens on a fresh branch off `claude/audit-data-extracts-sql-shk9x5` once Stack
gives the go; migrations applied to the live project via MCP as before (additive only), edge
functions deployed via MCP. No PR / no prod push without an explicit ask.
