# Requirements v3 — sprint 2 scope

Date: 2026-09-22. Author: PM session (Fable), Stage A of the sprint 2 planning prompt
(`project-state/ORCHESTRATOR.md` §6, "Sprint 2 — planning"). Product manager: Stack.
Status: **DRAFT — §1, §2 and §4 written by the PM; §3 is Stack's to fill.** Phase briefs may
cite R-numbers from this file once Stack has confirmed it (Stage C).

This file continues `../sprint-1-hub/60_REQUIREMENTS_v2.md` (R-01..R-28). It does not restate
what sprint 1 delivered — STATUS's "Sprint 1 — closed" section is that record. It states what
sprint 1 **left undone**, as requirements (outcomes), never as the old prompts or task lists;
what Stack adds new; and what stays declined so nothing sneaks back. R-numbers continue from
**R-29**. Migrations for sprint 2 start at **091**.

How to read an entry in §1:

* **Source** — the sprint 1 document and row the requirement comes from.
* **State today** — one of *not built* · *partly built* (with what exists) · *built but
  unproven* (code merged, acceptance never walked) · *done* (listed only so it can be struck
  from STATUS). Every state was checked against the repo at `main` (`5246438`), prod, or the
  harness repo on 2026-09-22, not read off a document.
* **Still missing** — what has to exist before the requirement is met.
* **Must respect** — the sprint 1 decision (DECISIONS.md row, quoted) or frozen brief answer the
  work cannot reverse without a new DECISIONS row from Stack.

<!-- §1 and §2 are filled from the verified extraction; see the PM's Stage A report. -->

## 1. Carried requirements

_Being written._

## 2. PM-added requirements

Intermediate steps sprint 1's leftovers cannot ship without: a seam, a data fix, a test harness,
a migration. Each is marked *PM-added*, says in one line why, and names the research note that
backs it where the PM had to look something up. Stage B appends *research-added* rows here.

_Being written._

## 3. Stack's new features and requirements

Pasted by Stack on 2026-09-23 (before Stage A closed) and transcribed verbatim by the PM; his
three headings are kept. Ids follow the intake convention `S2-<area>-<n>`. Fields Stack did not write
(**why**, **must / should**, **acceptance**, **must not**) are left as "_to confirm_" and are
put to him with a proposed default in Stage B's single question batch — nothing is invented
here. Lines marked *PM note* are the PM's reading, not Stack's words.

Template per entry:

```
### S2-<area>-<n> · <short title>
* **what (Stack's words):** …
* **why:** …
* **must / should:** must | should
* **acceptance (Stack's words):** what he sees, clicks or reads that proves it is done
* **must not:** anything it must not do or change
```

### 3.1 quick fix

### S2-home-1 · upcoming work scrollable
* **what (Stack's words):** upcoming work scrollable
* **why:** _to confirm_
* **must / should:** _to confirm_
* **acceptance (Stack's words):** _to confirm_
* **must not:** _to confirm_
* *PM note:* Phase 12b's P-home-2 made the Home tracker wheel/drag-scrollable across the dated
  range (`80c` H-2, merged PR #20). Stage B checks what still does not scroll (the course-page
  tracker? the strip on a touchpad? a regression?) before this is sized.

### S2-home-2 · collapse undated and move to bottom of page
* **what (Stack's words):** collapse undated and move to bottom of page
* **why:** _to confirm_
* **must / should:** _to confirm_
* **acceptance (Stack's words):** _to confirm_
* **must not:** _to confirm_
* *PM note:* 12b moved needs-attention to the bottom (P-home-5) and took series placeholders
  and other teams' cases out of Undated (P-home-6/7); the Undated tray itself is unchanged.

### S2-materials-1 · entire materials section collapses to its header
* **what (Stack's words):** entire materials section collapse to just header upon clicking the
  header and text
* **why:** _to confirm_
* **must / should:** _to confirm_
* **acceptance (Stack's words):** _to confirm_
* **must not:** _to confirm_
* *PM note:* 12b made the per-bucket sections collapsible (P-materials-1); this asks for the
  whole course section, with the header text itself as the toggle.

### 3.2 long-tail, large scale system builds/changes

### S2-containers-1 · containerization
* **what (Stack's words):** containerization
* **why:** _to confirm_
* **must / should:** _to confirm_
* **acceptance (Stack's words):** _to confirm_
* **must not:** _to confirm_
* *PM note:* this is Phase 14 (R-28), carried in §1 with its brief `82_PHASE14_containers.md`,
  Stack's 16 decisions of 2026-09-16 and the MVP he confirmed then ("matches"). Stack places it
  in the sprint 2 phase order in Stage C.

### S2-workspace-1 · workspace section: a chatbot interface that routes prompts by task complexity
* **what (Stack's words):** workspace section: functions as a chatbot interface that works by
  routing prompts to different agent model levels depending on the complexity of the task. Low
  effort for simple rag db queries or pulling of documents, higher models for the actual
  execution of the tasks. Currently I want to build it as if I might route it to either a local
  model or to a frontier model. Claude is the only one we will actually hook up but I wish to
  build the functionality. Ideally use my subscription to run it instead of having to pay for
  api credits.
* **why:** _to confirm_
* **must / should:** _to confirm_
* **acceptance (Stack's words):** _to confirm_
* **must not:** _to confirm_
* *PM note:* this reverses §4 D-1 ("in-app chat assistant", declined in Requirements v2 §5) and
  needs a DECISIONS row when adopted. "Use my subscription" points at the Claude Code CLI path
  (`claude -p` with a `claude setup-token` token, which Phase 14's research R2 §1 already cleared
  for the unmodified binary) rather than the API; Stage B researches the router, the
  local-or-frontier seam, and where the process runs (it is a container job, so it sits on
  Phase 14's seams).

### 3.3 cleaning

### S2-styling-1 · styling
* **what (Stack's words):** styling
* **why:** _to confirm_
* **must / should:** _to confirm_
* **acceptance (Stack's words):** _to confirm_
* **must not:** _to confirm_
* *PM note:* Phase 13 (R-21), parked in `parked/81_PHASE13_styling.md` with its DoD fixed on
  2026-09-14 and C-1..C-3 carried in §1. Stack's placing it under "cleaning" reads as: after the
  builds, still in this sprint.

### S2-bugs-1 · bug fixing
* **what (Stack's words):** bug fixing
* **why:** _to confirm_
* **must / should:** _to confirm_
* **acceptance (Stack's words):** _to confirm_
* **must not:** _to confirm_
* *PM note:* the known bugs are itemised in §1 (S2-carry-5, S2-carry-8, S2-carry-9, the 12b
  leftovers); Stage B asks whether "bug fixing" also means a second page-by-page pass like 12b.

### S2-rag-1 · rag testing (all materials should be chunked and embedded)
* **what (Stack's words):** rag testing (all materials should be chunked and embedded)
* **why:** _to confirm_
* **must / should:** _to confirm_
* **acceptance (Stack's words):** _to confirm_
* **must not:** _to confirm_
* *PM note:* prod on 2026-09-24: 84 current files (93 rows), all with bytes; 82 `extracted`, 2 `na`
  (the image-only files R-16 sent to OCR); 784 text units, 1,545 embeddings, 0 units without an embedding (STATUS's corpus row was
  corrected to these figures on 2026-09-24). So the gap today is the two
  image-only files plus the absence of any automatic check that a newly pulled file gets
  extracted and embedded (the 12 files of 2026-09-22 were done by hand in the pull script, and files 155–157 on 2026-09-23 through curl because the Playwright download event now crashes the MCP browser — STATUS 2026-09-23).
  Stage B defines the coverage check (every stored file → text units → embeddings, per part),
  what "chunked" should mean for long units, and the retrieval eval to re-run.

## 4. Still declined

Carried from Requirements v2 §5 ("still declined, unchanged") and the sprint 1 decision log,
so nothing sneaks back into a brief without a new DECISIONS row from Stack.

| # | Declined | Where it was declined | Note |
|---|---|---|---|
| D-1 | In-app chat assistant | v2 §5 | — |
| D-2 | Agent write path into `assignment_progress` / `reading_progress` | v2 §5; CLAUDE.md project facts | One sanctioned exception stands (DECISIONS 2026-09-17): `stage_gradebook` advances `assignment_progress.status` to `graded`, forward-only, never from excused or DNF. Nothing else. |
| D-3 | Scheduled or in-Electron crawls (Duo) | v2 §5; DECISIONS 2026-09-10 "Sync cadence: Stack triggers, the app does the rest; no scheduled crawl, no reminders" | Phase 14's brief proposes a pg_cron-queued morning `sync` request that a container runs while Stack's Duo login is alive (82 §"What the research changed" 4, Stack's decision 6). That is a reversal of this row and needs its own DECISIONS row when Phase 14 adopts it; until then it stays declined. |
| D-4 | Service-role key anywhere client-side, in a browser, in the repo, or in a container image | v2 §5; DECISIONS 2026-09-03; 82 §C-6 | The materials MCP server's secret is the one sanctioned holder. |
| D-5 | Exposing the stack beyond the single owner | v2 §5; RLS decision 2026-09-10 | — |
| D-6 | Installer, code signing, auto-update for the desktop shell | v2 §5; R-23 | Unpacked build + shortcut only. |
| D-7 | Native file open from a local OneDrive mirror; the mirror itself | v2 §5; DECISIONS 2026-09-16 "Phase 12's OneDrive file mirror is dropped" | R-23 (a) and R-18's mirror clause are gone with it; Phase 14 makes `course context/` a disposable volume. |
| D-8 | Professional-side stub; IST.471 hours log | R-24 | Never. |
| D-9 | AI-policy enforcement in agents, the MCP server or skills | R-14; DECISIONS 2026-09-10 | Display only. |
| D-10 | Sync reminders or nags | R-15 | Stack triggers. (A failed scheduled sync raising an Inbox row is Phase 14's proposal, not a reminder.) |
| D-11 | Grade what-if, target solver, saved scenarios, placeholder rows, the two projections (zeros-on-the-rest, best case) and the agrees-with-Blackboard sentence | DECISIONS 2026-09-17 "Phase 12b reverses two 10b decisions … Removed: what-if, target solver, saved scenarios (`grade_scenarios` stays in the DB, unused), placeholder rows, the two projections and the agrees-with-Blackboard sentence" | Grades show one deterministic "graded so far" figure per course. `grade_scenarios` stays in the DB unused (80c §Stack's answers 3: "DB objects left in place only if unused; nothing is dropped in this phase"); dropping it is a sprint 2 call, not a default. |
| D-12 | The strict non-computable rule (an unscored hand-graded part hides a course's figure) and muting a part on an unsure link | same 2026-09-17 row | Both are stated under the figure instead of hiding it. |
| D-13 | A score in the assignment popout; Blackboard's attempt `receipt` rendered | DECISIONS 2026-09-15 "the popout shows submission status, attempts and files, never a score; Blackboard's attempt receipt is stored … but not rendered" | 12b moved feedback and score history into the popout; the score itself stays on the Grades screens. |
| D-14 | Widening mirrored scores from `numeric(9,3)` (P-db-3) | DECISIONS 2026-09-17 "Declined: widening numeric(9,3) scores" | Eight dependent views for one third decimal of one percentage. |
| D-15 | Meetings pushed to Google Calendar; an ICS feed instead of the API push; a per-course calendar | DECISIONS 2026-09-14 (due dates only) and 2026-09-15 (one calendar, fixed colour per course) | — |
| D-16 | Per-item announcement read tracking | DECISIONS 2026-09-14 "opening the dropdown marks its items seen; no per-item read tracking" | — |
| D-17 | Launch-at-login for the desktop shell | DECISIONS 2026-09-16 "launch-at-login out" | R-23's option is not built. |
| D-18 | Editing a recurrence rule after creation; more than 52 occurrences | DECISIONS 2026-09-21 | Delete "this and following", create anew. |
| D-19 | Tailwind or any UI framework; new dependencies for styling | 81 §Out of scope; DECISIONS 2026-09-09 | CSS Modules + custom properties. |
| D-20 | Local or self-hosted Supabase; self-hosting the web app; a registry or CI; a secrets manager; Kubernetes; containerizing the Electron GUI | 82 §Out of scope; Stack's decisions 2 and 15 (2026-09-16) | Supabase and Vercel stay managed. |
| D-21 | Hermes Agent and any change to the bb2dash materials store from the harness side | 66 §Out of scope | The two vector stores never cross. |
| D-22 | Re-ingesting the claude-mem history with new tags | 66 §Out of scope | Stays `source='claude-mem'`. |
