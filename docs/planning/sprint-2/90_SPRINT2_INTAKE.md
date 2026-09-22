# Sprint 2 — intake

Opened 2026-09-22 at sprint 1's close. Product manager: Stack. Method: the Phase 12b one
(`../sprint-1-hub/briefs/80c_PHASE12B_page_pass.md` §Method) — his list → one id per item → triage
→ one Sonnet researcher per area → ONE batch of questions with a default each → briefs → workers.
Migration range starts at **091**. Planning docs for this sprint live in this folder
(`briefs/`, `research/`, `verification/`, `evidence/`, `walks/`, `parked/`).

## Carried in from sprint 1 (PM's list; Stack adds his own below)

| id | area | item | source | size |
|---|---|---|---|---|
| S2-carry-1 | ingest | ~~Submission bytes are not pulled~~ **Fixed in the close-out PR (#25)**: `bb-sync` step 4b now runs `ingest/pull_files.mjs --bucket my_submissions`; rows 140 and 141 pulled, stored, extracted and embedded on 2026-09-22 | sprint 1 close-out | done |
| S2-carry-2 | grades | V-1 grading validation still stubbed: 21 placeholders without points, IST.323's 13-point proposal column counts toward two parts, migration 059 held | `sprint-1-hub/briefs/63_GRADING_VALIDATION.md` | Stack's sittings + one data migration |
| S2-carry-3 | harness | V-2 session archival / RAG hand-off (R-27) — stream in `~/agentic-harness`; may already be underway there | `sprint-1-hub/briefs/66_SESSION_ARCHIVAL_RAG.md` | — |
| S2-carry-4 | containers | Phase 14 (R-28): brief + six research files ready; Stack places it in this sprint or after | `82_PHASE14_containers.md` | L |
| S2-carry-5 | planner | Deleting a series' last detached occurrence plainly leaves an empty `planner_event_series` row | `sprint-1-hub/walks/80o_PHASE12B_TAIL_WALK.md` W-3 | S (trigger) |
| S2-carry-6 | data | IST.466 publishes two content branches with identical paths; `bb_content` keeps one (P-data-1) | sprint 1 known issues | L (key change in `stage_content`) |
| S2-carry-7 | styling | Phase 13 skipped; C-1 phone-width overflow, C-2 rank weights invisible, C-3 favicon | `parked/81_PHASE13_styling.md` | — |
| S2-carry-8 | db | 7 functions with a mutable `search_path` (advisor, pre-existing) | advisors | S |

## Stack's list (verbatim, filled by the PM session)

_Pending. Paste the list grouped however you like; the PM assigns ids `S2-<area>-<n>`._

## Triage → phases

_Filled after the list: each id gets a phase, a size (S/M/L), a research owner, and an MVP line in
Stack's words. Then the question batch, then one brief per phase under `briefs/`._
