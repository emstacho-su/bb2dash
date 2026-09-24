# Planning docs — index

Every brief, research report, verification note and walk bb2dash has produced, filed by the
sprint that produced it. Filenames never change: a doc keeps its number and name for life, so
`68_PHASE10B_grade_model.md` means the same file whatever folder it sits in, and STATUS,
DECISIONS and the briefs can keep citing each other by number. Only the folder moves.

Live project state is **not** here — it lives in `project-state/STATUS.md` (where the product
is) and `project-state/DECISIONS.md` (why). This folder is the record behind them.

## The sprints

| Folder | When | Phases | PRs |
|---|---|---|---|
| `sprint-0-foundation/` | Sep 2 – 10, 2026 | 1–7: data syntax, Blackboard capture, search schema, embedding POC, retrieval MCP, GUI v1, retrieval polish | #1–#6 |
| `sprint-1-hub/` | Sep 10 – 22, 2026 | 8–12b plus the V-1 and V-2 streams: course dimension, sync loop, grades (10a/10b), planner + calendar (11/11b), Electron shell (12), the page pass (12b) | #7–#23 |
| `sprint-2/` | being planned (from 2026-09-22) | `91_REQUIREMENTS_v3.md` in progress: sprint 1's leftovers as requirements, Stack's list, Phase 14 (containers, R-28); Phase 13 parked | #26 (the prompt); the planning PR to come |

**Sprint 0** predates Requirements v2. Its Sep 8 research-and-direction round
(`10_`–`31_`) was superseded wholesale and sits under `superseded/` with a note saying so.

**Sprint 1** is the hub sprint: `60_REQUIREMENTS_v2.md` (R-01..R-26) is the scope it was built
against and `70_MVP_INDEX.md` holds Stack's MVP/DoD answers per phase. Both sit at the sprint
root because every subfolder cites them.

**Sprint 2** holds `82_PHASE14_containers.md` and its six research reports. `parked/` holds
`81_PHASE13_styling.md` — Phase 13 was **skipped by Stack on 2026-09-22**; the brief stays
because its carry-ins C-1..C-3 (phone-width overflow, rank weights per exam, favicon) are
still open and still listed inside it.

## The subfolder convention

| Subfolder | What goes in it |
|---|---|
| `briefs/` | A phase contract: why, the frozen contract, worker list, seams, out-of-scope, migration range. What a worker is handed. |
| `research/` | The comparables report written before a brief is frozen; each brief's DoD cites its own. |
| `verification/` | What a worker wrote when its stream finished: before/after evidence, applied-migration hashes, advisor diffs. Also the PM's integration notes. |
| `evidence/` | A measurement or investigation that decided something, standing apart from any one worker — the grade-method comparison, the attempts-endpoint chain. |
| `walks/` | A browser walk of the built product against its acceptance script, with its screenshot folder beside it. |
| `parked/` | A brief that is written but not being built. |

A sprint root holds only the documents the whole sprint answers to (its requirements, its MVP
index). Everything else goes in a subfolder.

## Starting a new sprint

A new sprint is a new `sprint-N-<name>/` folder with the same subfolders (create only the ones
you need). **The numbering inside a sprint continues the repo-wide sequence** — it does not
restart at 00. Sprint 1 ended at `82_`, so Sprint 2's next new document is `83_` or higher,
whatever folder it lands in. That way a number alone identifies a document forever, and the
map below never needs a disambiguating column.

## Not here

* `docs/inbox-decisions/` — the log of Stack's answered Inbox items and what each one changed
  in the data. It is an operating record, not a planning doc, and it stays where it is.
* `db/migrations/` — byte-frozen against what was applied to prod. Several migration comments
  still cite the **old** planning paths on purpose; the map below is how you follow them.
* `project-state/` — STATUS, DECISIONS and ORCHESTRATOR. Live state, not record.

## Old → new path map

Every path below is relative to `docs/planning/`. Moves were made with `git mv`, so
`git log --follow` works on every file.

| Old | New |
|---|---|
| `00_AGENT_BRIEF.md` | `sprint-0-foundation/00_AGENT_BRIEF.md` |
| `10_R1_gui_binding_audit.md` | `sprint-0-foundation/superseded/10_R1_gui_binding_audit.md` |
| `11_R2_data_inventory.md` | `sprint-0-foundation/superseded/11_R2_data_inventory.md` |
| `12_R3_pipeline_and_runtime.md` | `sprint-0-foundation/superseded/12_R3_pipeline_and_runtime.md` |
| `20_D1_gui_direction.md` | `sprint-0-foundation/superseded/20_D1_gui_direction.md` |
| `21_D2_architecture_direction.md` | `sprint-0-foundation/superseded/21_D2_architecture_direction.md` |
| `22_D3_risk_and_scope_review.md` | `sprint-0-foundation/superseded/22_D3_risk_and_scope_review.md` |
| `30_PHASED_PLAN.md` | `sprint-0-foundation/superseded/30_PHASED_PLAN.md` |
| `31_PLAN_REVIEW.md` | `sprint-0-foundation/superseded/31_PLAN_REVIEW.md` |
| `40_RECONCILIATION_2026-09-09.md` | `sprint-0-foundation/40_RECONCILIATION_2026-09-09.md` |
| `41_RECONCILIATION_gui_vs_retrieval-mcp.md` | `sprint-0-foundation/41_RECONCILIATION_gui_vs_retrieval-mcp.md` |
| `50_PHASE7_retrieval_polish.md` | `sprint-0-foundation/50_PHASE7_retrieval_polish.md` |
| `51_W10_VERIFICATION.md` | `sprint-0-foundation/51_W10_VERIFICATION.md` |
| `DB_PROFILE_2026-09-08.json` | `sprint-0-foundation/DB_PROFILE_2026-09-08.json` |
| `DB_VIEWS_2026-09-08.sql` | `sprint-0-foundation/DB_VIEWS_2026-09-08.sql` |
| `60_REQUIREMENTS_v2.md` | `sprint-1-hub/60_REQUIREMENTS_v2.md` |
| `70_MVP_INDEX.md` | `sprint-1-hub/70_MVP_INDEX.md` |
| `61_PHASE8_course_dimension.md` | `sprint-1-hub/briefs/61_PHASE8_course_dimension.md` |
| `62_PHASE9_sync_loop.md` | `sprint-1-hub/briefs/62_PHASE9_sync_loop.md` |
| `63_GRADING_VALIDATION.md` | `sprint-1-hub/briefs/63_GRADING_VALIDATION.md` |
| `64_GRADING_SCHEMA_EXPORT_2026-09-14.md` | `sprint-1-hub/briefs/64_GRADING_SCHEMA_EXPORT_2026-09-14.md` |
| `66_SESSION_ARCHIVAL_RAG.md` | `sprint-1-hub/briefs/66_SESSION_ARCHIVAL_RAG.md` |
| `67_PHASE10A_grades.md` | `sprint-1-hub/briefs/67_PHASE10A_grades.md` |
| `68_PHASE10B_grade_model.md` | `sprint-1-hub/briefs/68_PHASE10B_grade_model.md` |
| `69_PHASE11_planner.md` | `sprint-1-hub/briefs/69_PHASE11_planner.md` |
| `69b_PHASE11B_planner_events.md` | `sprint-1-hub/briefs/69b_PHASE11B_planner_events.md` |
| `80_PHASE12_electron.md` | `sprint-1-hub/briefs/80_PHASE12_electron.md` |
| `80c_PHASE12B_page_pass.md` | `sprint-1-hub/briefs/80c_PHASE12B_page_pass.md` |
| `research/72_RESEARCH_phase10a_grades.md` | `sprint-1-hub/research/72_RESEARCH_phase10a_grades.md` |
| `research/73_RESEARCH_phase10b_grade_model.md` | `sprint-1-hub/research/73_RESEARCH_phase10b_grade_model.md` |
| `research/74_RESEARCH_phase11_planner.md` | `sprint-1-hub/research/74_RESEARCH_phase11_planner.md` |
| `research/75_RESEARCH_v1_grading_validation.md` | `sprint-1-hub/research/75_RESEARCH_v1_grading_validation.md` |
| `research/76_RESEARCH_v2_session_archival.md` | `sprint-1-hub/research/76_RESEARCH_v2_session_archival.md` |
| `research/77_RESEARCH_phase12_electron.md` | `sprint-1-hub/research/77_RESEARCH_phase12_electron.md` |
| `research/79_RESEARCH_phase9_sync_loop.md` | `sprint-1-hub/research/79_RESEARCH_phase9_sync_loop.md` |
| `research/80c_RESEARCH_phase12b_findings.md` | `sprint-1-hub/research/80c_RESEARCH_phase12b_findings.md` |
| `63_W12_VERIFICATION.md` | `sprint-1-hub/verification/63_W12_VERIFICATION.md` |
| `64_W15_VERIFICATION.md` | `sprint-1-hub/verification/64_W15_VERIFICATION.md` |
| `65_W18_VERIFICATION.md` | `sprint-1-hub/verification/65_W18_VERIFICATION.md` |
| `66_W17_VERIFICATION.md` | `sprint-1-hub/verification/66_W17_VERIFICATION.md` |
| `68a_W20_VERIFICATION.md` | `sprint-1-hub/verification/68a_W20_VERIFICATION.md` |
| `69a_W21_VERIFICATION.md` | `sprint-1-hub/verification/69a_W21_VERIFICATION.md` |
| `69c_W23_VERIFICATION.md` | `sprint-1-hub/verification/69c_W23_VERIFICATION.md` |
| `80a_W25_VERIFICATION.md` | `sprint-1-hub/verification/80a_W25_VERIFICATION.md` |
| `80b_W26_VERIFICATION.md` | `sprint-1-hub/verification/80b_W26_VERIFICATION.md` |
| `80d_INTEGRATION_VERIFICATION.md` | `sprint-1-hub/verification/80d_INTEGRATION_VERIFICATION.md` |
| `80g_W30_VERIFICATION.md` | `sprint-1-hub/verification/80g_W30_VERIFICATION.md` |
| `80h_W31_VERIFICATION.md` | `sprint-1-hub/verification/80h_W31_VERIFICATION.md` |
| `80i_W32_VERIFICATION.md` | `sprint-1-hub/verification/80i_W32_VERIFICATION.md` |
| `80j_W33_VERIFICATION.md` | `sprint-1-hub/verification/80j_W33_VERIFICATION.md` |
| `80k_W34_VERIFICATION.md` | `sprint-1-hub/verification/80k_W34_VERIFICATION.md` |
| `80l_W35_VERIFICATION.md` | `sprint-1-hub/verification/80l_W35_VERIFICATION.md` |
| `80m_W36_NOTES.md` | `sprint-1-hub/verification/80m_W36_NOTES.md` |
| `80n_W37_NOTES.md` | `sprint-1-hub/verification/80n_W37_NOTES.md` |
| `80e_GRADE_METHOD_COMPARISON.md` | `sprint-1-hub/evidence/80e_GRADE_METHOD_COMPARISON.md` |
| `80f_ATTEMPTS_ENDPOINT.md` | `sprint-1-hub/evidence/80f_ATTEMPTS_ENDPOINT.md` |
| `80d_PHASE12B_WALK.md` | `sprint-1-hub/walks/80d_PHASE12B_WALK.md` |
| `walk-12b/` (8 screenshots) | `sprint-1-hub/walks/walk-12b/` |
| `80o_PHASE12B_TAIL_WALK.md` | `sprint-1-hub/walks/80o_PHASE12B_TAIL_WALK.md` |
| `walk-12b-tail/` (6 screenshots) | `sprint-1-hub/walks/walk-12b-tail/` |
| `82_PHASE14_containers.md` | `sprint-2/82_PHASE14_containers.md` |
| `research/82_RESEARCH_phase14_R1_blackboard_login.md` | `sprint-2/research/82_RESEARCH_phase14_R1_blackboard_login.md` |
| `research/82_RESEARCH_phase14_R2_claude_unattended.md` | `sprint-2/research/82_RESEARCH_phase14_R2_claude_unattended.md` |
| `research/82_RESEARCH_phase14_R3_devcontainer.md` | `sprint-2/research/82_RESEARCH_phase14_R3_devcontainer.md` |
| `research/82_RESEARCH_phase14_R4_compose_architecture.md` | `sprint-2/research/82_RESEARCH_phase14_R4_compose_architecture.md` |
| `research/82_RESEARCH_phase14_R5_bb2dash_inventory.md` | `sprint-2/research/82_RESEARCH_phase14_R5_bb2dash_inventory.md` |
| `research/82_RESEARCH_phase14_R6_harness_and_vault.md` | `sprint-2/research/82_RESEARCH_phase14_R6_harness_and_vault.md` |
| `81_PHASE13_styling.md` | `sprint-2/parked/81_PHASE13_styling.md` |

80 files moved. Nothing was renamed, deleted or merged.
