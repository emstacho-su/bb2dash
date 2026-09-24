# 92 — Sprint 2 research: grades-validation

Date 2026-09-24 · Researcher: Sonnet (Stage B) · Scope: R-29..R-36 (§1.1) and their §2 steps
(P-1..P-6), §6 questions 1–7

## 0. Summary

R-29/R-30/R-35 are data-fact and freshness problems, not engineering problems — the record
already names what is missing; this note adds nothing beyond confirming the pattern (Inbox-style
reconciliation queue) that already exists in-repo. R-31/R-32/R-33 are one exercise — validate,
correct, prove — and sprint-1's own research (`../research/75_RESEARCH_v1_grading_validation.md`)
already picked the right comparables (Great Expectations suite-as-data, dbt singular tests,
accounting preparer/reviewer sign-off); this note deepens that with fetched, concrete examples and
sharpens three open calls (machine-block re-check, invariant tolerance, where citations live).
**Biggest risk, newly found:** `scripts/validate-grading.ps1` cannot be trusted to "stay confined"
even once its JSON-parse crash is fixed — two of its four confinement mechanisms are either
non-existent CLI flags or silently-ignored permission rules (§6 below), so the session today would
run with an unscoped `Write` tool if launched as written. **Second risk:** R-32's arithmetic
invariants ("weights sum to 100", "children sum to parent") currently hold only because nobody has
corrected a row yet — an untested invariant is not an invariant, and a real open-source example
(fetched below) shows the exact bug class this misses. **Total size:** the R-31..R-35 cluster is
one L effort (six Stack sittings plus a migration plus a rewritten launcher); R-29/R-30/R-36 are
S/M and mostly wait on Stack's answers, not new engineering. Nothing here should slip Stage C.

## 1. R-29 · Stack's own presentation dates confirmed on the planner and Google Calendar

1. **Standard practice:** this is not a validation problem, it is a reconciliation queue — an
   ambiguous fact (which date is whose) with an owner, an aging clock and a recorded resolution.
   The accounting *reconciling-items* pattern (itemised discrepancy, cause, preparer, reviewer,
   dated) is the right shape, and bb2dash already implements a version of it: `attention_items`
   with `decision->'flagged'` and `apply_resolutions()`.
2. **Comparables to borrow:** none external — the repo's own pattern is the correct one to reuse,
   not a new one to import. Borrow `apply_resolutions()`'s shape (042: `conflict {accept}`,
   `stack_must_confirm`/`missing {value, value_type}`) exactly as R-29's "Still missing" already
   proposes, and `skills/inbox-apply/SKILL.md`'s citation rule (see R-33 §4) for the "why" field.
3. **Pitfalls:** flag rows filed as *archived* (state today: seven rows carry `FLAG for Stack` but
   the open Inbox shows 0) are invisible to Stack unless he is told to look; a resolved-but-wrong
   answer (the SITN-date/individual-slot ambiguity, Notes ¶) then propagates to Google silently.
   This is the same "silent overrides" anti-pattern research 75 already names for V-1 — it applies
   here too, one calendar push at a time.
4. **Maps onto the stack:** `attention_items` (archived flag rows 2/4/7/8/9/142/163),
   `apply_resolutions()` (042), `assignments.due_date/due_at/confidence`, `courses.group_notes`,
   `v_calendar_push_items` (a date change re-patches Google, a confidence change does not — R-29
   seams), `grade_components` id 24 notes (outside `/inbox-apply`'s write set; hand SQL or folded
   into A-4's R-32 migration).
5. **Size & seams:** S. Seams: shares `assignments.confidence` with A-2 on
   major-project-2-su-it/individual-presentation; the Google push outage (2026-09-23–24, R-52) is
   already resolved and unrelated.
6. **What research changes:** nothing about the requirement itself — it is unchanged. It confirms
   the seven flagged rows should surface through the **same open-Inbox UI**, not stay
   archived-only, so §6 Q1's answer is visible to Stack without a document hunt; that's a UI note
   for cluster B1, not a change to R-29's own scope.

## 2. R-30 · Known grading-row defects settled from the materials or Stack's recorded call

1. **Standard practice:** this is V-1's method (§3 below) applied to specific rows already known
   to be wrong. No separate practice; it is the general reconciliation SOP with the "which rows"
   question pre-answered by the record (shared column, three unlinked attendance rows, eight
   tentative links, 18 unpointed placeholders).
2. **Comparables:** Canvas/registrar gradebook QA's standing instruction — verify assignment-group
   weights and the Total column against the syllabus every term — is the closest LMS-world analog,
   already cited in research 75 §1 item 6; nothing new to add per-row, since these are specific
   facts (IST.323's 13-vs-11 split, IST.466's three attendance columns) that only Stack's sittings
   settle, not a pattern a codebase teaches.
3. **Pitfalls:** the arithmetic-holds check (`data-v1-arithmetic-holds`, done today) is a *false
   negative in waiting* — see R-32 §3 for the concrete open-source bug class this exact shape
   misses (two numbers computed from the same source agreeing by construction, not because they're
   correct).
4. **Maps onto the stack:** `grade_components` 18/19 (fp_proposal/fp_log re-cut, §6 Q4),
   `assignments.component_id/points_possible/confidence/source_ref`, `grade_column_links`
   (PK `course_id+column_id`, FK `component_id … on delete cascade` — change components by
   `UPDATE`, never delete/recreate, per R-30's own seams), `v_grade_model_items` (081),
   `web/src/lib/grade-model/aggregations/manual.ts` (P-1's GEO 0.0% bug: two 0/100 columns read as
   graded attendance because `manual.ts` has no "not yet scored" state distinct from "scored
   zero" — confirmed by reading the file: manual aggregation takes any linked score, including 0,
   as a real value).
5. **Size & seams:** M. Seams: IST.323 is Stack sitting 1 (due 2026-12-03, the hard deadline);
   IST.466 is sitting 2. Tests `aggregation.sum.test.ts:40-41,66-100` and
   `parent-links.test.ts:18-19,32` need relabelling only under a re-cut (already named).
6. **What research changes:** sharpens P-1: the GEO fix should not be a one-off SQL row (mark
   "Not graded"); it should also make `manual.ts` (or the picker) distinguish *no linked
   assignment* from *linked, not yet posted* so the next 0/100-looking column doesn't repeat the
   bug silently. Research-added below.

## 3. R-31 · Every course's grading rules checked against its materials, differences carrying Stack's call

1. **Standard practice:** a *checkpoint*, not a conversation (research 75 §4). Freeze the claim
   (R-35's export), express acceptance as named assertions, preparer proposes / reviewer decides,
   corrections become one migration, then the **identical assertion set re-runs against prod**.
   Confirmed again this round against the same four families — Great Expectations (suite +
   checkpoint + Data Docs), dbt (generic + singular tests), account-reconciliation sign-off, and
   dual-extraction adjudication — nothing in a fresh search surfaced a fifth pattern; these are
   still the right four.
2. **Fetched this round, what to borrow:**
   - **pgTAP** (Supabase's own extension: `supabase.com/docs/guides/database/extensions/pgtap`,
     fetched 2026-09-24) wraps each check in `begin; select plan(n); ... select * from finish();
     rollback;` and asserts with `results_eq()`. bb2dash's `db/tests/*.sql` already uses a
     different, working convention — plain PL/pgSQL `DO $$ ... raise exception 'FAIL ...' ... $$`
     blocks (confirmed by reading `db/tests/phase10b_grade_model.sql`) — so the borrow is *not*
     "adopt pgTAP," it's "keep the house style and don't fork it": `grading_invariants.sql` should
     be one more `DO` block, not a second test framework, so R-79's "whole suite runs from disk in
     one command" stays one command.
   - **dbt cross-model reconciliation test**, `JB-Analytica/reference-architecture` PR #3
     (github.com/JB-Analytica/reference-architecture/pull/3, fetched 2026-09-24): file
     `dbt/tests/assert_marts_reconcile.sql` compares two numbers computed *independently* from the
     same source (an order total vs. the sum of its line items) with a half-cent tolerance chosen
     from the storage precision, not an arbitrary epsilon — and the PR's own text says why that
     matters: "nothing inside a single model can make those agree by accident, which is the
     property that makes the test worth having." Borrow exactly that framing for R-32's invariants
     (§4 below).
   - **dbt anti-pattern**, `TEAMSchools/teamster` PR #5530 (found via search, 2026-09-24): removes
     54 tests that "can never fail unless someone edits the model they test" — i.e., a test that
     re-derives its expectation from the same query it's checking. Direct warning for
     `grading_invariants.sql`: derive each check's expected side from `grading_schemes` /
     `grade_components`, never from re-summing `v_grade_model_items` against itself.
3. **Known pitfalls (sourced):** rubber-stamping (every export row already says
   `confidence = confirmed` and none was ever checked — research 75 §3); unverifiable citations
   (paraphrase without a `search_materials`-round-trippable quote); sign-off drift (chat decision
   never written back to the row — "happened once" per research 75, a real prior incident in this
   project, not a hypothetical). The teamster and reference-architecture examples above are the
   same family applied to SQL rather than prose: a check that agrees with itself by construction.
4. **Maps onto the stack:** `docs/planning/sprint-2/verification/92_GRADING_VALIDATION_<course>.md`
   (new numbering; sprint-1's `65_` files never got written — `git log --all` is empty per R-31
   state), the YAML machine block shape research 75 §2 already specified (id/target/stored/
   materials/citation/verdict/call/reason_code/why/decided_by/decided_on/confidence_after/
   `recheck` SQL), `mcp__bb2dash__{list_courses,search_materials,get_material_text}` as the only
   reads, `scripts/validate-grading.ps1` (R-34) as the only way in.
5. **Size & seams:** L. Seams: blocked on A-6 (R-34, launcher), A-7 (R-35, export), A-5 (R-33,
   citation field) before sitting 1. Six sittings, Stack's calendar sets the pace, not PM effort.
6. **What research changes:** the machine block's `recheck` field (research 75 §2) is specified
   but nothing today runs it — see Research-added #1. Otherwise unchanged; R-31 is already the
   best-designed entry in scope.

## 4. R-32 · Accepted grading corrections reach prod through one reviewed migration with invariants

1. **Standard practice:** invariants run **before and after** the migration, both outputs pasted
   in the PR (already in brief 63's DoD); this is the dbt/GE "checkpoint" idea applied to a
   one-time migration instead of a recurring pipeline, and it is also literally how a bank
   reconciliation closes a period — a pre-close and a post-close trial balance, both filed.
2. **Fetched this round:** the same `assert_marts_reconcile.sql` example (§3 above) is the direct
   template for R-32's six invariants (§Acceptance: top-level sums, parent-course rollup, ungraded
   read from excluded links, qualitative courses out of scope). Its **tolerance choice is the
   transferable idea**: bb2dash stores scores as `numeric(9,3)` (D-14: widening declined) and
   `grading_schemes.total_points`/`grade_components.points`/`weight_pct` as exact `numeric`, so
   `sum(weight_pct) = 100` and `sum(points) = total_points` should be **exact equality**, not
   `abs(... ) < epsilon` — the PR's finding was that a widened tolerance is itself a sign of a
   modeling bug, and R-32's four numeric-column arithmetic (ECN.304 100, IST.323 104, IST.466
   1020, IST.323 final-project 20) is already exact today per the requirement's own "State today."
   Any invariant that needs slack to pass is telling on a real defect, not a rounding fact.
3. **Known pitfalls:** the same "test agrees with itself" failure (§3.2) applies directly here: a
   literal same-course check already fails 4 GEO recitation rows unless it uses `057`'s
   `coalesce(parent_course_id, id)` (R-32 state) — that coalesce *is* the independently-derived
   side the teamster anti-pattern says a real check needs; without it the "same course" check
   would just restate the join it's supposed to be testing.
4. **Maps onto the stack:** `db/tests/grading_invariants.sql` (new, slot TBD — see Research-added
   #2 re: migration numbering), `db/tests/phase10b_grade_model.sql` (P-2 rewrites it first — two
   concrete breaks found by reading it: lines 171-172 insert an excluded link that already exists
   on prod, §4f lines 251-255 expects `_3569973_1` unlinked when it is now IST.323's only bound
   shared column), `grading_schemes`, `grade_components`, `assignments` (component_id,
   points_possible, source, source_ref, confidence), `grade_column_links` (057, same-course
   trigger confirmed by reading `057_grade_scenarios_and_links.sql`: SECURITY INVOKER, RLS
   owner-only, FK `component_id … on delete cascade`), `v_grade_model_items` (081, `latest as not
   materialized` CTE per 081's own header — a view change here needs 036's `security_invoker`
   guard re-run, which raises the size to L per R-32's own note).
5. **Size & seams:** M (L if a view/column changes). Seams: depends on A-3 (verdict summary), A-2
   (data calls), A-5 (citation field), and P-3's DECISIONS row (migration number + "Not graded"
   marker) before the migration can be written at all.
6. **What research changes:** confirms the exact-equality choice for the numeric invariants
   (nothing here should ever need a tolerance given `numeric(9,3)`/exact `numeric` storage and
   D-14's stand); and sharpens P-2 with the two concrete line numbers above, saving A-3/A-4 a
   re-discovery pass.

## 5. R-33 · Confirmed grading rows trace to a cited document, date, or Stack's override

1. **Standard practice:** "confirmed" must be a *dated, cited claim*, never a trusted enum — this
   is research 75's core finding (§3, "rubber-stamping") and remains correct; the closest general
   pattern is the audit trail requirement in reconciliation practice (who/when/why against
   original evidence, already cited in research 75 §1 item 4) and Great Expectations' `meta` field
   on an expectation, which is exactly this: an arbitrary, versioned annotation block riding beside
   the assertion so "why we believe this" travels with "what we assert," not in a separate doc.
2. **Comparables to borrow:** GE's suite-JSON-plus-Data-Docs split (research 75 §1 item 1, still
   the right citation — `docs.greatexpectations.io/docs/0.18/reference/learn/terms/checkpoint` /
   `.../data_docs`) is the shape for where the citation lives: a machine field (`notes` for schemes
   and components, `source_ref` for assignments — R-33's own default for §6 Q6(a)) plus a rendered
   view (the verdict file's prose table) generated from the same source, never hand-kept twice.
3. **Known pitfalls:** `assignments.confidence` today does three unrelated jobs at once — the
   sync's overwrite switch (084), the "Keep mine" stop (042), and the grade model's sure-link flag
   (`items.ts:51-52`) — confirmed by reading R-33's own seams. Demoting an uncited row to
   `tentative` (§6 Q6(b)'s losing option) would let Blackboard silently overwrite a date or point
   value the next sync — a live, specific instance of the "silent overrides" anti-pattern, not a
   hypothetical one.
4. **Maps onto the stack:** no `notes` column on `assignments` today (R-33 state); `source_ref` is
   set on 88/88 rows but 20 confirmed rows cite only "type inferred from the column name," which
   is not a citation. `skills/inbox-apply/SKILL.md` already gathers citation material during
   `/inbox-apply` runs (lines 101-102 per R-33) but has no rule to write it — the one-line skill
   fix R-33 already names.
5. **Size & seams:** S. Seams: must be settled (DECISIONS rows for §6 Q6 a/b/c) before sitting 1,
   since it sets the field every verdict-file row writes into.
6. **What research changes:** confirms R-33's own proposed defaults (notes/source_ref split,
   STACK_OVERRIDE + confirmed) rather than changing them — GE's `meta`-field precedent is evidence
   *for* the existing plan, not a reason to redesign it. One addition: recommend the citation
   string follow research 75's exact format (`bb_file:<id>#unit:<n>` + quote) in `source_ref` too,
   not just in the verdict file, so the two "citation lives here" answers in §6 Q6(a) actually
   agree on syntax.

## 6. R-34 · V-1's grading session starts on this machine and stays confined

1. **Standard practice:** least-privilege agent sandboxing — scope the tools, scope the
   filesystem, scope the network, and treat CLI/settings-level scoping as advisory unless it is
   backed by an OS-level boundary. This is Anthropic's own stated design (fetched below), not an
   external analog: Claude Code ships **two separate mechanisms** for this and R-34's launcher
   currently uses neither correctly.
2. **Fetched this round, and this is the requirement's real finding:**
   - `code.claude.com/docs/en/cli-reference` (fetched 2026-09-24): **`--restricted` and `--tools`
     are not documented CLI flags.** `scripts/validate-grading.ps1` line ~55 passes
     `--restricted --tools "Read,Write,Glob,Grep"` — these do nothing today (or error); they are
     not a second confinement layer, they're dead text. `--strict-mcp-config` and `--mcp-config`
     *are* real and current (confirmed via `code.claude.com/docs/en/mcp`, search-returned
     2026-09-24: "starts a Claude Code session using only the MCP servers you pass with
     `--mcp-config`" and exits at startup if a managed MCP config is also deployed) — those two
     flags in the script are correct and should stay. `--allowedTools`/`--disallowedTools` are also
     current, syntax unchanged from the script's usage.
   - `code.claude.com/docs/en/permissions` (fetched 2026-09-24), file-tool section: **"Claude Code
     checks file permissions against `Edit(path)` and `Read(path)` rules only. If you write a path
     rule for `Write` … Claude Code accepts the rule but never consults it … Use `Edit(docs/**)` in
     place of `Write(docs/**)`."** The launcher's confinement rule —
     `Write(docs/planning/sprint-1-hub/verification/65_GRADING_VALIDATION_*)` — is exactly the
     pattern the docs say is silently ignored. As written, once the JSON-parse bug (R-34's other,
     already-known defect) is fixed, the session's `Write` tool would be unscoped to any
     Read-reachable path, not confined to the verification folder. This is a second, independent
     defect in the launcher that R-34's "Still missing" does not currently name.
   - `code.claude.com/docs/en/sandboxing` (fetched 2026-09-24): the OS-level Bash sandbox "runs on
     macOS, Linux, and WSL2. **Native Windows is not supported.**" It's moot here anyway (the
     launcher denies `Bash` entirely), but it means "stays confined" on this machine, today, is a
     **Claude-Code-enforced** boundary (permission rules), never an **OS-enforced** one — the
     stronger guarantee only exists once the session runs inside Phase 14's Linux dev container
     (already named as a seam in R-34; this confirms *why* that seam matters, not just that it
     exists).
3. **Known pitfalls:** deny rules matching a tool name remove it from context (`Bash`, `Edit`
   fully gone, not just refused per-call) — good, matches the brief's intent — but a *path-scoped*
   deny rule (`Read(./.env)`, `Read(course context/**)`) is the only mechanism that actually blocks
   a specific read; an *allow*-only list (what the script has today, per R-34's "allow entries deny
   nothing") never subtracts anything. The fix is additive: keep the allow list, add explicit
   `deny` entries for `.env*` and `course context/**`, exactly the two paths R-34's "Still missing"
   already names — the research just confirms the correct rule syntax to use.
4. **Maps onto the stack:** `scripts/validate-grading.ps1` → a Node twin (R-34's own plan, to dodge
   `~/.claude.json`'s `ConvertFrom-Json` DuplicateKeysInJsonString crash under Windows PowerShell
   5.1), `mcp-server/dist` (stale since src commit `57f1e2e`, needs a rebuild before first launch),
   the Phase 14 dev container (`82_PHASE14_containers.md` task 13, "validate-grading Node twin …
   W-29" — already the same task, confirming R-34 and Phase 14's task 13 are one seam, not two).
5. **Size & seams:** M. Blocks A-3 sitting 1. The service-role key still passing through a copied
   `~/.claude.json` entry into a temp file is a `/security-review` item regardless of the flag
   fixes (R-34's own note).
6. **What research changes:** **adds two concrete fixes** to R-34's "Still missing" that the
   requirement as written does not name: (a) drop `--restricted --tools "..."` (non-existent,
   inert) from the launcher; (b) replace the `Write(...)` scoping rule with an `Edit(...)` rule
   covering the same glob, since `Write` path rules are documented as never consulted. Both are
   Research-added #3 below. Everything else in R-34 (Node twin, deny rules, container seam) is
   already correctly scoped by the requirement.

## 7. R-35 · The grading export V-1 tests matches prod on the first sitting day

1. **Standard practice:** freeze the claim under test, and regenerate it from the same committed
   query every time — this is the "freeze the claim" half of research 75's SOP (§4a), applied
   literally: an export that drifts from prod between generation and the sitting invalidates every
   row decided against it.
2. **Comparables:** none new — this is the same "baseline, regenerable by the same query" idea
   research 75 already gives (§4a); the one operational lesson worth carrying from dbt/GE practice
   is that the *query* itself should be a committed artifact (a `.sql` file checked in beside the
   export), not a one-off SELECT run by hand and pasted — otherwise the second export (this sprint)
   drifts from the first (`64_`) the same way `64_` already drifted from prod (§4's ten questions
   were stale within days; the due-date column used UTC and showed "—" for date-only rows).
3. **Known pitfalls:** the 2026-09-14 export already shows the failure mode: 73 of 88 assignment
   rows matched, `grade_column_links` (4 rows) and gradebook columns were omitted entirely, and it
   cited the wrong syllabus version (IST.323 V1.3.1, bb_file 2, where v1.4/bb_file 151 is current)
   — an uncommitted, hand-run export cannot be trusted to be complete on the next sitting day either
   unless the query itself is fixed and versioned.
4. **Maps onto the stack:** next free number under `docs/planning/sprint-2/` (this file is 92_;
   the export would be the next one after it, e.g. 93_ or 94_ per R-35's "92_-94_ earmarked on
   branch 8e9ba24"), `scripts/validate-grading.ps1`'s `$export` variable, `ai_policy`,
   `bb_column_id`, gradebook columns (`possible`, `linked_assignments`, `counts_toward_grade`),
   089's New-York-day due-date rule (already the fix for the UTC bug).
5. **Size & seams:** S. Seams: PM-side SELECTs on prod only, generated on sitting day (R-35's own
   rule — "every sync moves the counts").
6. **What research changes:** one addition — commit the generating query as a tracked `.sql` file
   (e.g. `scripts/export-grading-schema.sql`) alongside the dated export markdown, so the *next*
   regeneration (sitting 2 onward, or a future term) is the same query re-run, not a new hand
   query that can silently omit a table the way `64_` omitted `grade_column_links`.

## 8. R-36 · Rank-weighted ECN.304 exams state their 30/25/20 rule on the Grades screen

1. **Standard practice:** show the weighting rule as a visible subtotal or note beside the computed
   figure, always, not only once every input is graded. Confirmed against Canvas's own weighted-
   grading documentation (search-returned 2026-09-24, `instructionaldev.umassd.edu` and related
   Canvas-admin pages): "Weighted Assignment Groups are visible for students when they view their
   course grades," with the rule shown via a hover/label beside the group subtotal — the same
   shape R-36's size-S option already proposes (one sentence under the figure).
2. **Comparables:** none needed beyond the LMS convention above — this is a copy/plumbing change,
   not a new component, and the code already carries what the sentence needs:
   `NodeOutcome` (`evaluate.ts:20-33`) has the component and its state; the gap is only that
   `GradedSoFarResult` exposes part *names*, not weights, confirmed by reading `graded-so-far.ts`.
3. **Known pitfalls:** the size-M option (each exam's own weight, once all three are graded) has no
   real data to render against before Exam 3 posts (2026-12-08), which sits inside the Nov 30–Dec
   13 freeze named elsewhere in STATUS — showing a would-be weight before every exam is graded
   would silently become a projection, which CLAUDE.md and D-11 both forbid. This is R-36's own
   "Notes" finding, confirmed correct — not a new pitfall this research adds.
4. **Maps onto the stack:** `web/src/lib/grade-model/aggregations/rank-weighted.ts` (confirmed:
   `rankWeightedAggregate` already reads `context.component.rankWeights`, so the sentence can pull
   the same array — `[30, 25, 20]` — with zero engine change), `graded-so-far.ts`, `evaluate.ts`,
   `web/src/components/grades/GradedSoFarFigure.tsx` (confirmed: currently renders `FIGURE_LABEL`,
   `NOT_COMPUTABLE_TEXT`, counted/left-out part lists — a new constant string here is additive and
   in the same file's existing pattern), `web/test/graded-so-far.test.ts`,
   `web/test/grade-model/aggregation.rank-weighted.test.ts`.
5. **Size & seams:** S for the rule-line-only option (matches §6 Q7's default); M only if the
   per-exam-weight half is also built. Seams: real-data walk needs Exam 1's Blackboard column
   linked to `ECN.304/exam-1` first (A-2/A-3, 084's exact-title-match risk already named in R-36).
6. **What research changes:** nothing to the scope call itself — the Canvas precedent supports the
   S default rather than arguing for more. One phrasing fix: the sentence should read the weights
   from `grade_components.rank_weights` (R-36's own instruction) formatted as *ranked order*
   ("highest exam 30%, median 25%, lowest 20%"), matching how `rankWeightedLevel` actually consumes
   them (`descending(values)` before applying weights, confirmed in `rank-weighted.ts`) — labelling
   them by exam number instead would misdescribe the rule.

## Research-added requirements

1. **Fix the GEO/ECN "0 read as scored" gap in `manual.ts`, not just the two rows P-1 names.**
   *Why:* `manual.ts`'s aggregation cannot distinguish "linked, Blackboard posted 0" from "linked,
   nothing posted yet" — the second is what's actually happening on all four attendance rows named
   in R-30/§4 Q2, and the next unlinked 0/100 column (any future course) hits the same bug. *Size:*
   S, engine-only. *For:* R-30, P-1.
2. **A tiny script that extracts and runs each verdict file's `recheck` SQL.** *Why:* research 75's
   machine block already specifies a `recheck` field per row ("what lets a later automated pass
   re-check without re-reading prose") but no step in R-31 or P-1..P-6 builds the reader; without
   it the machine block is inert YAML, the exact "sign-off drift" risk research 75 warns about,
   just deferred to the next term instead of the next PR. *Size:* S (parse YAML, run each
   `recheck` SELECT, diff against `stored`). *For:* R-31, R-33.
3. **Launcher fix: drop `--restricted --tools "..."`, replace the `Write(...)` scoping rule with
   `Edit(...)`.** *Why:* §6.2 above — both are concrete, sourced defects in
   `scripts/validate-grading.ps1` beyond the already-known JSON-parse crash; R-34's "Still missing"
   says "keeps the same flags and prompt," which would carry both bugs into the Node twin
   unchanged. *Size:* S (a few lines in the twin). *For:* R-34.
4. **Commit the grading-schema export's generating query as a tracked `.sql` file.** *Why:* R-35
   §6 above — `64_`'s omissions (no `grade_column_links`, wrong syllabus version, UTC due dates)
   were possible because the query itself was never versioned, only its output. *Size:* S.
   *For:* R-35.
5. **A DECISIONS row on citation-string format parity between `source_ref` and the verdict file.**
   *Why:* R-33 §6 above — §6 Q6(a)'s default puts the citation in two different places (`notes`,
   `source_ref`) without saying they must use the same `bb_file:<id>#unit:<n>` syntax research 75
   already defined for the verdict file; without that row, A-3's sittings could write two citation
   dialects. *Size:* S (a sentence in the DECISIONS row A-3 already needs). *For:* R-33.

## Questions for Stack

Only where this research changes a §6 default; the other §1.1-scope questions (1, 2, 4, 5, 7)
stand as recorded in §6 with no change.

1. **§6 Q3, refined default.** *Un-stub V-1 now, or keep it stubbed?* The recorded default is
   "un-stub it inside the sprint-2 grades phase; sitting 1 (IST.323) runs once the launcher works
   and the export is regenerated." This research does not change that call, but sharpens what
   "the launcher works" must mean before sitting 1: not just "the JSON bug is fixed," but "the
   `--restricted/--tools` no-op flags are gone and the write-scope rule is `Edit(...)`, not
   `Write(...)`" (§6.2 above) — otherwise "confined" is not true even though the launcher runs
   without error. **Default (refined):** same as recorded (un-stub, sitting 1 after the launcher
   works), with "the launcher works" now including both fixes in Research-added #3. *Why:* a
   silently-unscoped `Write` tool during a live sitting with Stack watching is a correctness risk
   (a stray write into `course context/` or outside `verification/`), not just a tidiness one, and
   costs a few lines to close before, not after, the first sitting.
2. **New: should `grading_invariants.sql` be added to whichever cluster owns R-79's "whole
   `db/tests` suite runs from disk in one command," rather than run only by hand at the V-1 PR (§6
   Q6(c)'s losing option) or wired into every sync (its winning option)?** **Default:** yes — file
   it as one more `db/tests/*.sql` the existing suite runner already picks up, which gets it
   re-checked every time anyone runs the suite (CI-adjacent for free) without needing R-32's PR or
   R-79's test-infra work to coordinate on a new sync step. *Why:* §6 Q6(c) frames the choice as
   "by hand" vs. "wired into sync," but the repo already has a third, cheaper channel (the db/tests
   suite itself, R-79) that neither option names; Great Expectations/dbt/pgTAP all default to
   "cheap enough to run in the normal suite," not to a special one-off or a production hook.

## Sources

Fetched or search-confirmed this session (2026-09-24):

* `https://code.claude.com/docs/en/cli-reference` — fetched; confirms `--allowedTools`,
  `--disallowedTools`, `--permission-mode`, `--mcp-config`, `--append-system-prompt` are current;
  confirms `--restricted` and `--tools` are **not** documented flags.
* `https://code.claude.com/docs/en/mcp` — search-returned content confirms `--strict-mcp-config`
  is current and documented ("starts a Claude Code session using only the MCP servers you pass
  with `--mcp-config`").
* `https://code.claude.com/docs/en/permissions` — fetched in full; source for the `Write(path)`
  rules "accepted but never consulted" finding, the deny-first precedence, and the
  `Read(./.env)`/`Read(course context/**)` deny-rule syntax.
* `https://code.claude.com/docs/en/sandboxing` — fetched; source for "native Windows is not
  supported" (macOS/Linux/WSL2 only).
* `https://supabase.com/docs/guides/database/extensions/pgtap` — fetched; source for the
  `begin/plan/results_eq/finish/rollback` pgTAP shape used in §3.2 to justify *not* adopting it.
* `https://github.com/JB-Analytica/reference-architecture/pull/3` — fetched; source for the
  `dbt/tests/assert_marts_reconcile.sql` cross-model reconciliation pattern, the half-cent
  tolerance reasoning, and the 3,564-row bug it caught.
* `https://github.com/TEAMSchools/teamster/pull/5530` — search-returned; source for the
  "tests that restate their model's SQL" anti-pattern.
* Canvas weighted-grading pages (`instructionaldev.umassd.edu/weighted-grading-in-canvas/` and
  related, search-returned 2026-09-24) — source for §8.1's "always visible, hover-labelled rule"
  convention.

Carried from `docs/planning/sprint-1-hub/research/75_RESEARCH_v1_grading_validation.md` (already
cited there in 2026-09-14; not re-fetched this session): Great Expectations Checkpoint/Data Docs
(`docs.greatexpectations.io/docs/0.18/reference/learn/terms/checkpoint`, `.../data_docs`), dbt
data-tests docs (`docs.getdbt.com/docs/build/data-tests`), Soda Core CI guide
(`docs.soda.io/soda-documentation/soda-v3/use-case-guides/quick-start-dev`), account-reconciliation
checklist and audit-trail pages (`scryai.com/blog/account-reconciliation-review-checklist/`,
`taxbatchpro.com/blog/bank-statement-audit-trail`), dual-extraction/adjudication
(`guides.lib.unc.edu/systematic-reviews/extract-data`, `docs.humansignal.com/guide/quality`),
Canvas/registrar gradebook QA (`infocanvas.upenn.edu/instructors/setting-up-the-gradebook/`,
`support.canvas.fsu.edu/kb/article/1110-canvas-gradebook-best-practices/`).

Repo evidence read directly this session (not web sources, cited by path throughout): `91_
REQUIREMENTS_v3.md` §1.1, §2 (P-1..P-6), §4, §6; `docs/planning/sprint-1-hub/briefs/
63_GRADING_VALIDATION.md`; `64_GRADING_SCHEMA_EXPORT_2026-09-14.md`; `75_RESEARCH_v1_grading_
validation.md`; `scripts/validate-grading.ps1`; `db/migrations/057_grade_scenarios_and_links.sql`;
`db/migrations/081_grade_model_items_not_materialized.sql`; `db/tests/phase10b_grade_model.sql`;
`web/src/lib/grade-model/aggregations/rank-weighted.ts`; `web/src/lib/graded-so-far.ts`;
`web/src/components/grades/GradedSoFarFigure.tsx`; `project-state/STATUS.md`;
`project-state/DECISIONS.md`; `docs/planning/sprint-2/82_PHASE14_containers.md`.
