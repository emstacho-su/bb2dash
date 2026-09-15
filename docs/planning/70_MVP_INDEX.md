# MVP, definition of done, and task loops — index (PR #11)

Date: 2026-09-14. PM: the Fable session. Product manager: Stack. This is the last docs PR before
development resumes. It fixes, for every remaining phase and stream, (a) the explicit MVP,
(b) the definition of done Stack signs against, and (c) the looped task set that gets there.
Each lands as a fixed section in the phase's brief; this file indexes them and holds the
cross-cutting rules and the research that informed them.

Status: **§1 answers recorded; §2 research done (seven reports in `research/`); §3 applied to every brief; §4 complete; §5 lists the open questions Stack answers before each phase starts.**

## 1. Stack's answers (questionnaire of 2026-09-14, seven rounds)

Recorded verbatim in intent. Where an answer changes Requirements v2, the change is listed in
§1.9 and applied to `60_REQUIREMENTS_v2.md` in this PR.

### 1.1 Cross-cutting

| Question | Answer |
|---|---|
| What "done" means, on top of the SOP gates | **SOP + Stack's acceptance script**: each phase ships a written checklist he walks through on the Vercel preview; every item ticked before merge. |
| Sign-off cadence | **Per phase** — one sign-off at the PR. |
| Comparable product families for research | **All four**: LMS course pages (Google Classroom, Canvas, Blackboard Ultra), student planners (MyStudyLife, Notion templates, Todoist/TickTick), grade calculators (Canvas what-if, standalone), desktop/sync tooling (Obsidian Sync, Dropbox mirror, Electron wrappers). |
| Research depth | **One Opus researcher per phase, ~30 min each**: 3–5 comparables, patterns to copy, anti-patterns, a DoD checklist proposal. **Not started until Stack says go.** |
| Task loop strictness | **Executable check on every task** (test, SQL assertion, curl, or screenshot diff the worker runs itself); a task without one is not a task; plus one demo line per task for the acceptance script. |
| Sprint shape after Phase 9 | **10a + 11 + V-1 + V-2 together**, four sessions in parallel. |
| Where MVP/DoD/loops live | **In each phase brief** (fixed section) **+ this index**. New briefs for 10a, 10b, 11, 12, 13. |

### 1.2 Phase 9 hand-in

| Question | Answer |
|---|---|
| What Stack checks before merging | **One real crawl end-to-end**: he runs a crawl; the transform runs itself; Inbox shows the new items and Home shows the freshness line; he resolves one item with a why. |

### 1.3 Phase 10a — grades: mirror, screens, submissions

| Question | Answer |
|---|---|
| Grade surfaces in the MVP | **Global Grades page + per-course tab, latest scores**: per-item rows with score, possible, date seen, feedback, submission status; Blackboard's total where it publishes one. No score history in the UI yet (the mirror still appends per run). |
| Submission pull-back (R-17) | **Status + timestamp + files**: attempts endpoint in the crawler; submitted files into Storage under `my_submissions`, visible in the popout and Materials. |
| Pre-submission upload (R-18) | **Yes, web only**: drop zone in the popout and Classwork row → Storage + `bb_files` row → Materials. Local mirror waits (see 1.7). |
| Course with no Blackboard calculated total | **Empty state "Blackboard publishes no total" for now**; the logic for these cases is decided in V-1's new questions step (1.5). |

### 1.4 Phase 10b — grade model and what-if

| Question | Answer |
|---|---|
| What-if interaction | **Both**: enter hypothetical scores on ungraded items and see the projection; **and** a target solver ("what do I need on the rest to reach A-"). |
| Model trust / DoD | **Agree with Blackboard where methods match**: on courses with a published total and a plain weighted or points method, our number matches within rounding; any difference explained on screen. |
| Scenario persistence | **One saved scenario per course**, resettable. |
| Non-computable methods (IST.471, `manual` components) | **Show only Blackboard's number** for that course; the model is hidden there. |

### 1.5 V-1 — grading schema validation

| Question | Answer |
|---|---|
| Scope | **Grading only** (schemes, components, assignment links). Dates stay with Phase 9's transform. |
| New **questions step** | **A per-course questions block in the verdict file**: each sitting ends with the session's open logic questions for that course (e.g. no-total courses, the two OCR-only files, week/session classification); Stack answers inline; the summary collects them for DECISIONS rows. |
| "Ask the professor" rows | **Decide from materials**; Stack may ask the professor himself and override; unresolved rows stay tentative. |
| Definition of done | **All seven courses signed off**: verdict file per course with no undecided rows, reconciliation migration applied, summary written. 10b waits for all. |

### 1.6 Phase 11 — planner and calendar

| Question | Answer |
|---|---|
| Week grid MVP | **Meetings + due items, read-only**: class meetings with room on their days/times, due items on their day, today highlighted, ◂ ▸ by week, status quick-edit on due items as on Today. No drag. |
| Google Calendar push MVP | **Due dates only** (one bb2dash calendar; an event per assignment/quiz/exam due date, updated and deleted as data changes). Meetings not pushed. |
| Bell read semantics | **Seen in the dropdown counts as read**: badge clears when the dropdown opens. |
| R-16 data gaps | **OCR + week/session classification move to V-1's questions step**; Phase 11 keeps only what the planner needs (dates for the two group items). |

### 1.7 Phase 12 — Electron shell

| Question | Answer |
|---|---|
| MVP jobs | **Own window + taskbar icon + single instance; desktop notifications; Sync button opens the terminal.** The OneDrive file mirror is **not** in the MVP (follow-up task after the shell ships). |
| Notification triggers | **All three from R-26**: sync landed with N changes, grade posted, item due tomorrow. |

### 1.8 Phase 13 — styling

| Question | Answer |
|---|---|
| Visual direction | **Decided later, after functionality is achieved.** No direction work in this PR. |
| Definition of done | **Every screen on tokens, light + dark, Stack approves each**: no hard-coded colours or sizes outside `globals.css`; both themes; per-screen preview checklist. |

### 1.9 Changes to Requirements v2 that follow from the answers

| R | Was | Now |
|---|---|---|
| R-25 | due dates **and** class meetings (§6.2 assumption 1) | **due dates only**; meetings dropped from the push |
| R-20 bell | "read" undefined | dropdown-open marks all seen |
| R-16 | all four gaps in Phase 11 | OCR + classification → V-1 questions step; Phase 11 keeps the two group-item dates |
| R-23 | jobs = mirror + notifications + Sync button | MVP = shell + notifications + Sync button; **mirror is a post-MVP task** |
| R-18 | mirrored to OneDrive by R-23 | web upload ships in 10a; mirror follows R-23's post-MVP task |
| R-12 | IST.471 "explicit not-computable state" | courses with non-computable methods show only Blackboard's number |
| R-11 | (a)/(b)/(c) all in one phase | (a) + per-item rows in 10a; (b) computed standing + (c) what-if in 10b |
| §4 Phase 10 row | one PR | 10a / 10b, as already recorded in PR #9 |
| V-1 | grading reconciliation only | + a per-course **questions step** (logic questions, OCR files, classification) |

## 2. Research plan (executed 2026-09-14)

One Opus researcher per phase/stream, ~30 minutes, read-only web research, no repo changes.
Each writes `docs/planning/research/7N_RESEARCH_<phase>.md` (≤ 900 words) with:

1. **Comparables** — 3–5 products or open-source projects that ship the feature; one line each on
   how they do it, with links.
2. **Patterns to copy** — concrete UI/data patterns that fit bb2dash's constraints (single user,
   Supabase, no fabricated numbers, CSS Modules, no Tailwind).
3. **Anti-patterns** — what those products get wrong or what does not transfer.
4. **Standard operating procedure** — how teams define done for this kind of feature (test
   layers, acceptance criteria shapes, data-quality checks), cited.
5. **Proposed DoD checklist** — 8–15 checkable items the PM can lift into the brief.
6. **Open questions for Stack** — only what the research could not settle.

| Researcher | Phase / stream | Comparable families (from §1.1) | Extra focus |
|---|---|---|---|
| R-9 | Phase 9 hand-in | LMS sync tooling, Inbox-style triage (Linear triage, GitHub notifications) | "one real crawl" acceptance script; honest freshness UI |
| R-10a | Phase 10a | Canvas / Classroom grades pages; Blackboard Ultra gradebook | per-item row anatomy; submission status + file evidence; upload-before-submit flows |
| R-10b | Phase 10b | Canvas what-if, GPA/grade calculators | projection UX, target solver wording, "labelled as a model" patterns, agreement checks |
| R-11 | Phase 11 | MyStudyLife, Notion student planners, Todoist/TickTick; Google Calendar push integrations | week-grid density, one-way calendar sync idempotency, bell/unread conventions |
| R-V1 | V-1 | syllabus-to-gradebook reconciliation practice; data-validation SOPs (Great Expectations-style checks) | sitting format, questions-step shape, sign-off record |
| R-V2 | V-2 | Obsidian/Logseq session capture, dev-log tooling, RAG ingestion pipelines with metadata filters | tag vocabularies, resume-chain modelling, per-note ingest triggers |
| R-12 | Phase 12 | Electron wrappers (Notion, Linear, Obsidian), single-instance + notifications | notification etiquette, safeStorage sessions, no-installer distribution |

Phase 13 has no researcher now (direction is decided after functionality).

## 3. Per-brief section template (to be filled after research)

Every brief gains, before "Workers":

```
## MVP
One paragraph: the smallest thing Stack would call the phase, in his words from §1.

## Definition of done
- [ ] SOP gates (tests green in every touched package; /code-review high; /security-review;
      STATUS + DECISIONS + ORCHESTRATOR updated; PR open; Vercel preview if visual)
- [ ] Acceptance script: <numbered steps Stack performs on the preview>, all ticked
- [ ] <phase-specific items lifted from the research DoD checklist>

## Task loops
| # | task | executable check | demo line (acceptance script) | owner |
Each task: check → build → verify → repeat until the check passes; no task without a check.
```

## 4. Status of the briefs

| Brief | Research | MVP | DoD | Task loops |
|---|---|---|---|---|
| `62_PHASE9_sync_loop.md` | `research/79_RESEARCH_phase9_sync_loop.md` | ✓ | ✓ 14 items | ✓ 15 loops |
| `67_PHASE10A_grades.md` | `research/72_RESEARCH_phase10a_grades.md` | ✓ | ✓ 14 items | ✓ 16 loops |
| `68_PHASE10B_grade_model.md` | `research/73_RESEARCH_phase10b_grade_model.md` | ✓ | ✓ 15 items | ✓ 16 loops |
| `69_PHASE11_planner.md` | `research/74_RESEARCH_phase11_planner.md` | ✓ | ✓ 15 items | ✓ 15 loops |
| `63_GRADING_VALIDATION.md` (V-1) | `research/75_RESEARCH_v1_grading_validation.md` | ✓ (+ questions step) | ✓ 10 items | ✓ 13 loops |
| `66_SESSION_ARCHIVAL_RAG.md` (V-2) | `research/76_RESEARCH_v2_session_archival.md` | ✓ | ✓ 15 items | ✓ 13 loops |
| `80_PHASE12_electron.md` | `research/77_RESEARCH_phase12_electron.md` | ✓ | ✓ 11 items | ✓ 12 loops |
| `81_PHASE13_styling.md` | none (direction decided later) | ✓ | ✓ 5 items | ✓ template loops |

## 5. Open questions for Stack, collected from the research

Each phase's PM session asks these before freezing its Contract (they are also at the end of each
brief). Stack answers them then; nothing here blocks PR #11.

**Phase 9 hand-in (ask before PR #10 merges):** freshness thresholds per stream (proposal:
announcements warn 24 h / error 72 h; assignments 24 h / 7 d; files 7 d) · is the why-note
required on Dismiss · are dismissed `data_gap` rows permanent or re-raised when the value
changes · rollup vs hard cap if a crawl raises 200+ gap rows · does a failed `bb-sync` go to
the Inbox or only a toast.

**Phase 10a:** show Blackboard's submission confirmation number if the attempts payload carries
it · global `/grades` by course or one flat newest-graded list · feedback-without-score reads
"returned, ungraded" or "submitted" · staged file after the submitted copy is pulled: stays,
superseded, or removed.

**Phase 10b:** which courses use Blackboard's running-total setting (can Stack read it per
course?) · IST.323 extra credit raises earned above 100 % or is clamped · target default A- or
per course · a `tentative` component: compute with a badge or decline · projection opens on
graded-so-far or zeros-on-the-rest.

**Phase 11:** one calendar or one per course · all-day vs timed 30-minute due events · delete on
first absence or after two crawls · does the Announcements page also clear the badge.

**V-1:** YAML machine block (recommended) · `verified_on` column vs inside `notes` ·
from-memory answers as `STACK_OVERRIDE` + `confirmed` or `tentative` · invariants by hand or
wired into the sync.

**V-2:** manual tags edited in the note (hook merges; recommended) or via a command · 5-tag cap ·
resume after the sweep starts a new note (recommended) · class-session schema · cross-repo
sessions as one note with `repos_touched`.

**Phase 12:** launch at login in or out · poller reuses the web session or holds its own token ·
poll interval and whether it runs with the window closed (tray?) · quiet hours for "due tomorrow"
· click-only toasts (recommended).
