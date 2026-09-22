# V-1 — Grading schema validation, course by course

Date: 2026-09-14. PM: the Fable session. Reviewer: Stack (this stream is **COLLABORATE** — the
session does the reading and the reconciliation, Stack makes every call). Runs as a **parallel
stream in the Phase 10 / 11 sprint**, and is a **prerequisite for R-12** (methodology model +
what-if): a grade model computed from a wrong scheme is worse than no model.

## Why

Phase 10 builds the gradebook mirror, the Grades screens and, last, the computed standing —
all on top of `grading_schemes`, `grade_components` and `assignments.component_id`. Those rows
were seeded on 2026-09-02/03 from syllabi and Blackboard and every one is marked
`confidence = confirmed`, but no pass has ever checked the stored rules against the collected
materials as a whole, and the export (`64_GRADING_SCHEMA_EXPORT_2026-09-14.md` §4) already
surfaces ten open questions: unlinked attendance rows in four courses, a 13-vs-11 point
mismatch in IST.323, two competing attendance columns in IST.466, a rubric that says 120 where
the syllabus says 100, a letter scale that stops at C-.

Stack's ask (2026-09-14): validate the grading schema by class through his review, in
collaboration with a session hooked up **only** to the materials we have collected, to ensure
everything has reconciled correctly.

## Contract

### What the session can see and touch

* **Reads:** `docs/planning/sprint-1-hub/briefs/63_GRADING_VALIDATION.md` (this file),
  `docs/planning/sprint-1-hub/briefs/64_GRADING_SCHEMA_EXPORT_2026-09-14.md` (the claim under test), and the
  materials corpus through the `bb2dash` MCP server only: `list_courses`, `search_materials`,
  `get_material_text`.
* **Writes:** one file per course, `docs/planning/sprint-1-hub/verification/65_GRADING_VALIDATION_<course_id>.md`.
* **Nothing else.** No Supabase MCP, no `rag` server, no shell, no edits to any other file. The
  launcher (`scripts/validate-grading.ps1`) enforces this with `--strict-mcp-config`,
  `--restricted` and an explicit tool allow-list. The session cannot change the database; the
  PM stream applies accepted corrections afterwards.

### Method, per course (order: IST.323, IST.466, IST.352, ECN.304, GEO.103.lecture +
recitation together, IST.471)

1. Read the course's rows in the export: scheme, components, assignment links, and the §4
   questions that name the course.
2. Pull the current syllabus unit(s) with `get_material_text` (the export names the `bb_file`
   ids) and search the corpus for every grading term the scheme uses: component names, point
   values, percentages, "drop", "lowest", "rank", "extra credit", "late", letter cut-offs,
   attendance, participation.
3. Build the reconciliation table (below). Quote the material for every non-match; cite
   `bb_file` id and unit. If the materials are silent, say **not in materials** — never fill
   the gap from general knowledge.
4. Walk the table with Stack. For each open row he picks one of: *keep as stored*, *change to
   (value)*, *ask the professor*, *mark ungraded*. Record his answer **and his one-line why**
   next to the row (the same rule as the Phase 9 Inbox: reasons are what let the seed rules be
   tuned later).
5. **Questions step (added 2026-09-14).** End the sitting with a `## Questions for Stack`
   block in the verdict file: every logic question the schema alone cannot settle for this
   course — how a course with no Blackboard calculated total should be shown, what to do with
   an image-only file the corpus could not read (OCR), how a file should be classified to a
   week or session, any component whose aggregation the materials describe ambiguously. One
   row each: question, what the materials say, the session's suggested answer, Stack's answer,
   his why. Stack answers inline; the summary collects them for DECISIONS rows.
6. Write the verdict file. Stop. Do not start the next course until Stack says so.

### Reconciliation table (one per course, in `65_GRADING_VALIDATION_<course_id>.md`)

| # | field | stored | materials say | source (bb_file/unit) | verdict | Stack's call | why |
|---|---|---|---|---|---|---|---|

`verdict` ∈ `matches` · `differs` · `not in materials` · `materials say more`. Rows cover:
every `grading_schemes` column, every component (weight/points, count, aggregation, drop rule,
rank weights, parent), every assignment's component link and points, and the arithmetic checks
(weights = 100, points = total, children = parent).

### Output of the stream

* Seven verdict files (GEO lecture + recitation may share one), each ending with its
  questions block.
* `65_GRADING_VALIDATION_SUMMARY.md`: counts per verdict, the list of accepted corrections in
  plain statements ("IST.323/participation → component `participation`"; "IST.466 component
  `ethics_presentations` stays 100, rubric deck is superseded — Stack confirmed with prof on
  <date>"), and the list of *ask the professor* items with their status. Rule (Stack,
  2026-09-14): **decide from the materials**; Stack may ask the professor himself and override
  the row later; an unresolved row stays `tentative`. The summary also collects every answered
  question from the per-course blocks for the PM to turn into DECISIONS rows.
* The PM stream turns accepted corrections into **one data migration**
  (`0NN_grading_reconciliation.sql`, number from the Phase 10 range) that updates the rows,
  sets `source = 'syllabus'` or `'blackboard'` as appropriate, `confidence = 'confirmed'`, and
  writes the citation into `notes`. Applied to prod before Phase 10b (R-12) starts. Rows Stack
  marked *ask the professor* stay `tentative` until answered.

### Acceptance

- [ ] Every course has a verdict file and every row has a verdict.
- [ ] No row remains `differs` without a Stack call.
- [ ] Arithmetic holds after corrections: weights sum to 100 for `weighted_pct` courses; points
      sum to `total_points` for `points` courses; child components sum to their parent.
- [ ] Every assignment with `points_possible > 0` is linked to a component or explicitly marked
      ungraded (Stack's call recorded).
- [ ] The ten §4 questions in the export each have an answer or an *ask the professor* status.
- [ ] `confidence = confirmed` on a row now means "checked against the materials on <date>",
      and the `notes` say where.

## Definition of done

Source: Stack's answers (`70_MVP_INDEX.md` §1.5) + research `../research/75_RESEARCH_v1_grading_validation.md` §5.
Supersedes the Acceptance list above where they overlap.

- [ ] **Stack's acceptance:** he has sat every course (seven verdict files; GEO lecture +
      recitation may share one), answered every open row and every question-block item, and the
      summary reads back to him correctly.
- [ ] Every row has a `verdict`; every non-`matches` row has `call`, `reason_code`, `why`,
      `decided_on`. `differs` rows with no Stack call = **0**.
- [ ] Every row not `not_in_materials` carries `bb_file` id + unit + verbatim quote; three rows
      per course spot-checked by the PM via `search_materials`.
- [ ] Each verdict file ends with a **machine block** (YAML with the same rows: target / stored /
      materials / citation / verdict / call / reason_code / why / decided_on / `recheck` SQL);
      it parses; row ids are unique. This is what lets a later automated pass re-check without
      re-reading prose.
- [ ] All ten §4 export questions answered or marked `PROF_TO_CONFIRM`.
- [ ] Questions block per course: each question has an answer or a recorded default, and a
      DECISIONS row where it sets policy (no-total courses, OCR files, classification).
- [ ] SQL invariants shipped as `db/tests/grading_invariants.sql` and run **before and after**
      the reconciliation migration (both outputs pasted in the PR): `weighted_pct` courses —
      top-level `sum(weight_pct) = 100`; `points` courses — `sum(points) = total_points`;
      children sum to their parent; no assignment with `points_possible > 0` and a null
      `component_id` unless marked ungraded; every `component_id` resolves to a component of
      the same course; `confidence = 'confirmed'` implies `notes` holds a `bb_file:` citation
      and a `verified_on` date.
- [ ] `0NN_grading_reconciliation.sql` applied to prod, repo file byte-identical; rows Stack
      answered from memory are `STACK_OVERRIDE` + `confirmed` with his why; `ask_professor`
      rows stay `tentative`.
- [ ] `65_GRADING_VALIDATION_SUMMARY.md`: verdict counts, corrections as plain statements, open
      professor questions with status, answered logic questions → DECISIONS rows.
- [ ] SOP gates for the closing PR: `/code-review` on the migration; STATUS + DECISIONS +
      ORCHESTRATOR updated.

## Task loops

| # | task | executable check | demo line (Stack) | owner |
|---|---|---|---|---|
| 1 | `db/tests/grading_invariants.sql` + baseline run on the export | SQL runs; failures listed (non-zero expected at start) | — | PM session |
| 2 | Verdict-file template with the machine block | a fixture verdict parses as YAML; row ids unique | — | PM session |
| 3–9 | One sitting per course (IST.323, IST.466, IST.352, ECN.304, GEO.103, IST.471) | verdict file complete; 0 undecided `differs`; questions block answered; three citations spot-checked | "I sat the course and made every call" | Stack + confined session |
| 10 | Summary | counts reconcile to the seven files; every correction is a plain statement | "the summary reads right" | PM session |
| 11 | Reconciliation migration | dry-run in rollback; applied; byte-identical | — | PM session |
| 12 | Invariants re-run after the migration | all green; pasted | — | PM session |
| 13 | DECISIONS rows from the questions blocks; closing PR | gates | — | PM session |

Open questions from the research, for Stack (also in `70_MVP_INDEX.md` §5): keep the YAML
machine block (recommended; it enables the automated re-check) or markdown only; `verified_on`
as a new column or inside `notes`; rows answered from memory as `STACK_OVERRIDE` + `confirmed`
or `tentative` until a document backs them; run the invariants by hand or wire them into the
sync so they re-check every term.

## Launching the session

```powershell
# from the repo root
.\scripts\validate-grading.ps1            # all courses, in the order above
.\scripts\validate-grading.ps1 IST.466    # one course
```

The script copies the `bb2dash` server entry from `~/.claude.json` into a temporary MCP config
(so the service key never enters the repo), then runs `claude` with only that server, the four
file tools, and the allow-list above. On first launch, run `/mcp` and `/permissions` inside the
session and confirm that only `bb2dash` is connected and nothing under `mcp__plugin_supabase`
or `mcp__rag` is available.

## Out of scope

Gradebook data (Phase 10 R-10 mirrors it later), Blackboard access of any kind, editing
`course context/` files, any schema change beyond the reconciliation data migration.
