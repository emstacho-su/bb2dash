# 94 — Sprint 2 phases

Date: 2026-09-24. Author: PM session (Fable), Stage C of the sprint 2 planning prompt. Product
manager: Stack. Inputs: `91_REQUIREMENTS_v3.md` (R-29..R-109, P-1..P-113, S2-*), `93_SPRINT2_RESEARCH_SYNTHESIS.md`
(§5 the question batch, §6 the defaults). Status: **PROVISIONAL — built on 93 §5's defaults;
Stack's answers to the batch and his approval of this plan freeze it** (DECISIONS 2026-09-23: the PM
proceeds on stated defaults and records every call when he answers).

One brief per phase under `briefs/`, in the sprint 1 shape, each with an explicit task list where
every task has a deterministic check. Phase numbers continue sprint 1's (Phase 14 keeps its number;
new phases are 15–22). Migration numbers: Phase 14 keeps 091–099; every other phase takes a block
from 100 upward, with slack.

## 1. The phases

| Phase | Name | Brief | Requirements | Migrations | Size | Depends on |
|---|---|---|---|---|---|---|
| 15 | Database hygiene and the SQL test runner | `briefs/95_PHASE15_db_hygiene.md` | R-78, R-79, R-80, R-54; P-2, P-8, P-18, P-30, P-31, P-99..P-101 | 100–104 | S/M | — (first) |
| 16 | Grades: V-1 validation sittings and the reconciliation migration | `briefs/96_PHASE16_grades_v1.md` | R-29..R-36; P-1, P-3, P-4, P-6, P-66..P-68, P-74, P-75 | 105–109 | L (Stack's six sittings) | 15 (runner for the invariants) |
| 17 | Web polish: Stack's quick fixes, carried screen bugs, Inbox and planner leftovers, live proofs | `briefs/97_PHASE17_web_polish.md` | R-37, R-39 (interim), R-40, R-42..R-45, R-47..R-52, R-55..R-59, R-108; S2-home-1, S2-home-2, S2-materials-1, S2-bugs-1; P-7, P-9..P-12, P-14, P-19, P-69..P-73, P-80 | 110–119 | L | 15 (tests); nothing else |
| 18 | Ingest and corpus: files pulled and embedded in the sync, attempts and announcements settled, search labels honest | `briefs/98_PHASE18_ingest_corpus.md` | R-60..R-63, R-66..R-70, R-72..R-75, R-77; S2-rag-1; P-22..P-24, P-26..P-28, P-36, P-81, P-82, P-89..P-92, P-96, P-97 | 120–129 | L | 15; one logged-in probe sitting (P-27) |
| 19 | Content identity, per-crawl history and sync honesty | `briefs/99_PHASE19_content_history.md` | R-38, R-41, R-64, R-65, R-71, R-76; P-25, P-94, P-95, P-98 | 130–139 | L | 17 (the Stream view migration), 18 (stage_files re-creation lands first; this phase owns stage_content) |
| 14 | Containers (R-28): sync-runner, Blackboard login in a container, images, secrets, dev container, harness jobs, acceptance | `briefs/100_PHASE14_containers.md` (supersedes 82's Contract) | R-81..R-96 (R-87 conditional); S2-containers-1; P-33..P-35, P-38..P-51, P-59, P-60, P-93, P-102..P-109 | 091–099 | L (three repos, one PR each) | the noVNC spike gate (R-82) before its sync half; 15 (test role); 18 (fetch + embed step); 19 (register-first semantics) |
| 20 | Harness closure: V-2 on record, note quality, checkpoint redaction, vault writers | `briefs/101_PHASE20_harness_closure.md` | R-97..R-104, R-106; P-52..P-58, P-61, P-110..P-113 | none in bb2dash | M | — (harness repo; R-97 first, it is a live bug) |
| 21 | Workspace: a chat surface routed by task complexity over the two stores, on the subscription | `briefs/102_PHASE21_workspace.md` | S2-workspace-1; P-83..P-88 | 140–149 | L | 14 (container, token, MCP image) |
| 22 | Styling: tokens, light and dark, the phone-width nav, Stack's direction | `briefs/103_PHASE22_styling.md` | R-53, R-46; S2-styling-1; P-15..P-17, P-76..P-79 | none | L | every screen above, 21 included |

Outside the phases: R-109 and the state-doc refresh steps (P-5, P-13, P-20, P-29, P-32, P-41,
P-62, P-64, P-65) land on this planning branch in Stage D; R-105 and R-107 are harness-owned; R-96
is Phase 14's deferred list; R-87 stays declined until Stack adopts the reversal (B-45); P-37 is
decided under P-92; P-21 folds into P-18; P-63 rides Phase 17's desktop touch.

## 2. Dependency graph and what runs in parallel

```
 15 (db hygiene, runner) ──┬──► 16 (grades / V-1: Stack's sittings, own calendar)
                           ├──► 17 (web polish) ──────────────► 19 (content identity + history) ──┐
                           ├──► 18 (ingest + corpus) ─────────► 19                                │
                           └──► 14 (containers; spike gate first) ──► 21 (workspace) ──► 22 (styling, last)
 20 (harness closure) runs beside everything in the harness repo; R-97 lands first.
```

Rules that fall out of the graph:

1. **15 first and short.** Its runner, test role and search_path pin are what every later SQL check
   runs through; its trigger (R-54) is one migration. Nothing else waits on more than that.
2. **16, 17, 18 run in parallel** on disjoint files: 16 is Stack's sittings plus `db/`, `scripts/` and
   the grades engine's `manual.ts`; 17 is `web/` screens, views 027/063-shaped migrations and the
   Inbox; 18 is `ingest/`, `skills/bb-sync`, `stage_files`, the search RPCs and `db/tests`. Frozen
   seams: 17 owns the `v_course_stream` / `v_content_tree` migrations (P-9, P-10); 18 owns
   `stage_files` and the search functions; neither touches `stage_content` (19's, DECISIONS 2026-09-17).
3. **19 after 17 and 18** because it re-creates `stage_content`, adds the history table the Stream
   reads (R-38 wires the view 17 migrated) and redefines the transform driver (R-65); its
   register-first semantics are frozen before 14's `sync_register_run` is written.
4. **14 is the long pole** and can start with 15: the spike (R-82) gates only its sync half; its
   infrastructure half (images, secrets, umbrella repo, harness jobs, dev container) needs nothing
   from 16–19. It inherits 18's scripted fetch and embed step (P-36) rather than rebuilding them.
5. **21 after 14**, **22 last** (Stack's "cleaning" placement; the Workspace page is in 22's inventory).
6. **Migration ranges with slack**: 091–099 (14), 100–104 (15), 105–109 (16), 110–119 (17),
   120–129 (18), 130–139 (19), 140–149 (21). A phase that runs out takes the next free block of ten
   and records it in DECISIONS, never a number inside another phase's block.

Term calendar (unchanged from sprint 1): weeks 9 (Oct 19–25) and 11 (Nov 2–8) are exam-heavy; week
14 is Thanksgiving; Nov 30 – Dec 13 is a code freeze. 16's IST.323 sitting must precede 2026-12-03.

## 3. What each phase hands to the next

| From | To | The seam |
|---|---|---|
| 15 | all | `scripts/db-test.mjs` (or the name the brief freezes) runs every `db/tests/*.sql` inside begin…rollback with a non-zero exit on FAIL; the `db_test_runner` role; `search_path` pinned on the seven functions |
| 17 | 19 | one `v_course_stream` migration (unread predicate, my_submissions and missing filters) and one `v_content_tree` migration (`missing_since`, `notes`); 19 adds the history-fed material arm on top |
| 18 | 14 | `ingest/pull_files.mjs --fetch` (signed-CDN route) and the embed step; the settled attempt/announcement key names in `bb_crawler.js` v5 |
| 18 | 19 | `stage_files` re-created once (auto-supersession, week/session pass); 19's `stage_content` re-creation does not touch it |
| 19 | 14 | register-first: the tick folds a registered run only on its calendar row; `sync_register_run` refuses unclaimed or quarantined runs |
| 14 | 21 | the `bb2dash-stack` umbrella, `secrets/`, the subscription-token pattern, the `bb2dash-mcp` image, the `workspace_runner` role on `sync_runner`'s shape |
| 16, 17, 18, 21 | 22 | every screen exists; the token audit baseline is already in `npm test` |

## 4. Coverage

Every R-29..R-109, P-1..P-113 and S2 id is assigned exactly once: to a phase above, to Stage D, or
to the unscheduled list in §1. The map is `stageC-phases.json` in the PM's session; the check is
rerun before Stage D.

## 5. Sessions (sketched here, written as prompts in Stage D)

* **Session A — 15 then 16:** the db phase is a morning; the grades phase is Stack's sittings with the
  PM in between (launcher, export, migration).
* **Session B — 17 and 18 in parallel worktrees**, then 19 on their seams.
* **Session C — 14 across three repos**, spike first; **21** follows in the same session shape.
* **Session D — 20** in the harness repo (may run first of all: R-97 is live).
* **Session E — 22**, last.

## 6. Open at this stage

Stack's answers to 93 §5 (59 items, defaults taken meanwhile), his placement of Phase 14 (default:
starts with 15), and his approval of this plan. Every product call above is provisional until then.
