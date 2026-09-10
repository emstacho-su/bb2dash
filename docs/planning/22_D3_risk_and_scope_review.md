# D3 risk and scope review: what is true, what is over-built, and what has to ship by when

Date: 2026-09-08. Agent: D3 (adversarial review). Sources read in full: `docs/planning/00_AGENT_BRIEF.md`, `10_R1_gui_binding_audit.md`, `11_R2_data_inventory.md`, `12_R3_pipeline_and_runtime.md`, `gui research context/gui/README.md`, `NOTES.md`, `ingest/CADENCE_RUNBOOK.md`, `ingest/VALIDATION_RUN_2026-09-08.md`, `ingest/bb_crawler.js`, `db/migrations/001_schema.sql`, plus read-only SQL against `goultdzqcavefcgnifdy` on 2026-09-08.

Everything marked verified was read in this repo or returned by SQL today. Everything marked inference is my judgment.

---

## 1. Verification of the ten most consequential claims

| # | Claim (source) | Verdict | Evidence |
|---|---|---|---|
| 1 | No `bb_raw` to typed-table transform code exists in the repo (R3 §2, handoff) | CONFIRMED | Full file listing: the only files touching `bb_raw` are `ingest/bb_crawler.js`, `db/migrations/002_raw_landing.sql` and the planning snapshot. `ingest/classify_rules.sql`, cited by `ingest/FILE_HARVEST_SPEC.md` §4, does not exist. The only rule pass is `classify_bb_file()` in migration 005 |
| 2 | `bb_files.session_id` populated on 2 of 64 (R1, R2) | CONFIRMED | SQL: `n=64 session_id=2 week_no=16 assignment_id=29 reading_id=13`. Also measured what R1 left unprofiled: `local_path` is 64 of 64, not merely inferred complete |
| 3 | Gradebook `score` null on all 37 columns, real value in `effectiveScore` (R2 §8a) | CONFIRMED, and materially understated | SQL over run `6b122650`: 37 columns, `score` non-null on 0. But `effectiveScore` is non-null on only 9 of 37, and 4 of those 9 are attendance or absence markers (ECN Attendance 100, GEO lecture Absences 0, GEO recitation Attendance 0, plus IST.352 zeros). Actual academic scores in the entire system today: IST.323 Quiz #1 = 10, ECN.304 Quiz 1 = 9. That is two |
| 4 | Blackboard's own calculated Total is the cheap close for grades, giving every card a real number (R1 gap 1; R2 §13 rank 1) | WRONG as stated | SQL: exactly one column across all seven shells has `isCalc = true`, IST.323 `Total Score` = 5 of possible 104. No other shell exposes a Total or Weighted Total. GEO.103.lecture's entire gradebook is one column named Absences. ECN.304's is two. So the "one migration gives every card a number" close delivers one course, and the number it delivers reads 4.8 percent |
| 5 | `v_course_grade` does not exist (all three) | CONFIRMED | `information_schema.views`: `v_course_corpus, v_course_map_latest, v_file_layout, v_overdue, v_upcoming`. Nothing else. No grade math anywhere in `db/` |
| 6 | The IST.466 group numbers are swapped between Blackboard and our records (R2 §8b, punch list 1) | CONFIRMED, exact swap | `bb_raw` latest run, `payload->'groups'` for `_570160_1`: "Ethics Groups 3" (`_299090_1`) and "Major Case Group 2" (`_299093_1`). `courses.group_notes` for IST.466: "Ethics Case Group #2; Major Case (Synchrony / SU IT) Group #3" |
| 7 | `assignment_progress.effort_override` does not exist (R1 dive 1, R2 §9) | CONFIRMED | `information_schema.columns`: `assignment_id, status, priority, planned_start, planned_finish, est_minutes, submitted_at, graded_at, score, score_max, letter, feedback, notes, updated_at`. Repo grep finds `effort_override` only in the artboards and the research docs, never in SQL. Also confirmed: `est_minutes` 0 of 65, `planned_start` 0 of 65 |
| 8 | `support.js` is only the Claude Design runtime and holds no components or sample data (R1 §"How to read this") | CONFIRMED | File header: "GENERATED from dc-runtime/src/*.ts". 69 KB of React runtime plumbing. Anyone told to reuse its components will find none |
| 9 | 9 assignments have no date, 26 have no `points_possible` (R1, R2) | CONFIRMED | SQL: `n=66 no_date=9 no_points=26 bb_col=29 desc=66 bb_url=0`. `assignments.bb_url` null on all 66 also confirmed |
| 10 | The crawler fails silently: no per-course try/catch, run log never persisted, exact-match term filter, silent truncation (R3 §1) | CONFIRMED line by line | `ingest/bb_crawler.js` contains one occurrence of the token `try` in 660 lines and it is not in `crawl()` or `runAll()`. Line 92 `mem.filter(m => m.termName === termName)`. Line 93 to 96 builds `log` locally and returns it. Line 33 `off > 5000`, line 62 `guard++ < 1000`, both silent. Line 28 returns `{__status}` on non-2xx but calls `r.json()` on any 200, so a session that expires mid-crawl throws |
| 11 | MSAL blocks embedded webviews, so an in-app Blackboard login will fail (task framing) | The strong form is UNVERIFIABLE; R3's hedged form is fair | R3 already marks this an inference and says it could not find a definitive statement. The public record supports "risky and unsupported", not "blocked": Microsoft's own MSAL.NET documents WebView2 use, while WebView2Feedback issues [550](https://github.com/MicrosoftEdge/WebView2Feedback/issues/550), [1450](https://github.com/MicrosoftEdge/WebView2Feedback/issues/1450) and [1878](https://github.com/MicrosoftEdge/WebView2Feedback/issues/1878) document device identity not reaching Conditional Access from embedded WebView2, which is exactly the class of failure a university tenant would hit. Syracuse's flow also has a Duo layer on top. Verdict: unknowable without the 30-minute spike, and the spike must not sit on the critical path |
| 12 | `bb_content` is stale relative to `bb_raw`, 11 rows titled `ultraDocumentBody`, `detail` is JSON null on 112 of 139 (R2 §1) | CONFIRMED on all three | SQL: `n=139 detail_obj=27 ultraDocBody_title=11 max_modified=2026-09-02 19:41`. Two crawls landed 9/8 and neither refreshed the content tree |

Two further checks worth recording because they change planning inputs.

The GUI README binds the needs-attention "missing" count to `grading_method = 'unknown'`. That column does not exist under that name: `grading_schemes` has `method`, and all six rows are `weighted_pct`, `points` or `qualitative`. The binding is wrong twice over, in name and in predicate.

`v_upcoming` holds 43 rows in total, 20 of them in the next 30 days, and `v_overdue` holds 2. The complete live workload surface of this application, today, is 43 assignment rows plus 86 readings. Every architectural decision should be read against that number.

---

## 2. Where the researchers contradict each other or the database

These are findings, not nitpicks. A planner who reads all three files without this section will inherit the wrong number.

R1 and R2 disagree on how much is measured. R1 repeatedly says `assignments.component_id`, `source_ref`, `submission`, `bb_files.local_path` and `announcements.title` are unprofiled and must be measured before anything is promised. R2 measured three of them and I measured the rest today: `component_id` is populated on 60 of 66 (not "probably partial"), `source_ref` on 66 of 66, `title` on 11 of 11, `local_path` on 64 of 64, `submission` unknown on only 6 of 66. R1's caution is stale; the assignment popout is better fed than R1 concluded.

R1 and R2 both oversell the Blackboard Total. Claim 4 above. R2 hedges it correctly in one sentence ("wherever they exist") and then ranks it the number one under-used asset; R1 states flatly that it "gives every card a real number in one migration". The database says one course.

R2's own numbers disagree with the database in three places. `grade_components` aggregation mix is `manual 7, single 16, sum 8, average_drop_lowest 2, rank_weighted 1, normalized 1`, not R2's "manual 8, single 14". `course_maps` is not "versions 1 and 2 per course": IST.352 is at version 3, and the repo's `maps/` folder has no `IST.352.course_map.v2.json` at all, only v1, so the repo and the database have diverged. And "ECN.304's 38 readings are all external URLs" is wrong: 29 of the 38 carry a URL, 9 do not.

R1 raises an open question the database already answers. R1 question 9 asks Stack whether GEO.103.recitation is in Maxwell 140 or 108. `courses.group_notes` for that shell says, verbatim, "Meets Fri 11:40-12:35 in Maxwell Hall 140 (confirmed 2026-09-03 from the section syllabus; the seed's 'Maxwell Hall 108' was wrong)". `meetings.location` already says 140. `courses.location` still says 108 and is simply stale, as is `NOTES.md` caveat 3. This is a one-line UPDATE, not a question for Stack. It matters beyond the room because it is a template for a whole class of bug: two columns hold the same fact and the UI will pick whichever it was pointed at.

R1 and R3 disagree implicitly on where the needs-attention data comes from, and R3 is right. R1 proposes a `sync_conflicts` table; R3 proposes `attention_items` with a wider `kind` vocabulary that also absorbs `stack_must_confirm` from `course_maps` and the overdue and deadline counts. One table, not two. Planners must not build both.

R2 and R3 disagree on the calendar. R2 evaluated `calendarItems` and calls it a dead end (23 items, all gradebook echoes, some `startDate` values are column creation timestamps). R3 calls the iCal feed "the highest-leverage automation available". Both can be true, because they are different endpoints, but nobody has seen the iCal feed. It is an unvalidated hope, and it should be labelled that way in any plan that leans on it.

---

## 3. Over-scope: what is not worth building for one user in one semester

### A full grade engine. Do not build it. Do not build the cheap version either, yet.

The engine is six aggregation behaviours, two of which are single instances (`rank_weighted` with `[30,25,20]`, which is order dependent and non linear, and `normalize_to: 5`), plus seven `manual` components that cannot be computed from item scores at all, plus one qualitative course where any number is fiction. R2 calls it effort L. It is L, and it would consume a month.

The part neither R1 nor R2 says plainly: there is nothing to compute. Two real scores exist across seven courses in week 2. The first exam is 9/14, the first exam cluster is 9/21 to 10/2, and most courses will not post a grade before October. An engine built in September operates on an empty set and cannot be tested. Even the cheap fallback delivers one number for one course.

What is worth doing, and it is a transform not a screen: mirror the gradebook into a typed `bb_grades(course_id, column_id, name, possible, effective_score, display_grade, submission_status, feedback, last_attempt, seen_at, run_id)` table on every run, so that when grades land in October there is a history to draw on. That is an afternoon. Revisit the display in November with real inputs, and only then decide between Blackboard's number and ours.

### Embeddings and pgvector. No.

The corpus is 534 rows and 949,271 characters, verified. That is a quarter of a model context. An `ilike` scan of 534 rows is instantaneous, and it will stay instantaneous if the corpus triples. `pgvector` requires enabling an extension, an embedding pipeline, a chunking decision, a re-embedding story on every new file, and an API bill, to make a sub-millisecond query faster. If search ever feels slow, add a generated `tsvector` column and a GIN index, which is one migration. Postgres FTS is itself probably over-build here. Note also that the corpus carries PPTX speaker notes inline (R2 verified), so a semantic index would happily surface the professor's private notes in a search result.

### Embedding the Blackboard login in the shell. Not in phase 1, and possibly not at all.

R3 is right that intercepting downloads deletes stage 3 steps 3 through 5, the uuid.tmp claim heuristic and the PowerShell move. That is the single largest simplification available. It is also weekly pain rather than daily pain, it removes a step that already works, and it is the highest-risk component in the build: an Entra plus Duo flow inside a third-party Chromium is exactly the configuration the WebView2 issue tracker is full of. If it fails, it fails late and unhelpfully. Timebox a 30-minute spike whenever Stack is bored, treat a success as a bonus, and never let anything on the critical path assume it.

### A local SQLite cache. No.

The whole typed layer is roughly three megabytes serialised. Fetch on open, hold in memory, write a JSON snapshot to app data for cold start and offline. `better-sqlite3` is a native module and reintroduces a rebuild step this project does not currently have.

### The desktop shell in phase 1. Stack has decided it, so this is the honest cost, not a re-argument.

An Electron scaffold with a preload bridge, a dev/build split, fs and shell IPC, and Windows packaging is realistically one to two weeks of a builder's evenings before a single new pixel of course data appears on screen. A Vite page on localhost that reads Supabase is one evening. On a 14-week clock where the first exam cluster is 13 days away, that is a meaningful fraction of the whole budget spent on chrome.

The recommendation that respects the decision and the clock: build the renderer first as a plain Vite app, and put every desktop-only capability behind a small `window.desktop` bridge with browser fallbacks (open file becomes copy-path-to-clipboard, reveal folder becomes a toast). Then Electron gets added in week two or three without ever having blocked a usable version, and the end product is still a desktop app.

What the shell must justify in phase 1, or it is a chrome tax:
1. Opening a file from the OneDrive mirror in its native application, and revealing it in Explorer. This is the one thing a browser tab genuinely cannot do, and `local_path` is populated on 64 of 64 files, so it works on day one.
2. Holding the Supabase session in `safeStorage` (DPAPI) rather than in localStorage.
3. Spawning a terminal in the repo with a `claude` command prefilled, which is the entire agent trigger story for v1.

If phase 1's shell delivers 1 and 3, it earned itself. If it delivers only a window with a title bar, the shell should have waited.

### Things in the GUI preview that are not worth their build cost this term

The 56-day, eight-week effort tracker. Verified weekly assignment counts from term week 4 through 13 are 3, 4, 2, 3, 1, 3, 2, 4, 1, 1. An eight-week horizontal bar chart of a two-item week is whitespace with a legend. Show 14 days, and include readings or the tracker is empty for ECN.304, which has 38 readings and 6 assignments.

Three of the four needs-attention counts. Overdue works (2 rows). Conflict needs a table that needs a transform that does not exist. Missing is bound to a column name that does not exist. Deadline has no agreed definition. Ship one count and the last-sync line, or ship the row later.

`agent_requests` from R3 §4.2. A queue with `claimed_at`, `state` and a lifecycle is fleet infrastructure. There is one user, he is at the keyboard, and Duo requires him to be. A button that opens a terminal with the command prefilled is the whole feature. `attention_items` is worth building, but only after the transform that populates it exists, otherwise the app renders an empty row that looks broken.

T-07 grade forecaster, T-09 internship hours, T-10 lecture notes, T-12 command palette, T-11 series strip, embeddings, letter grades, the Grades nav destination, auto-update, an installer. None of these change what Stack does on a Tuesday morning in September.

---

## 4. The time reality

Today is 2026-09-08, term week 2 of 16. `terms.end_date` is 2026-12-15. Fourteen weeks remain, and the data is worthless the day after the last final.

### The real deadline clusters, from `assignments` grouped by term week

| Term week | Dates | Items | What lands |
|---|---|---|---|
| 3 | Sep 7-13 | 11 | The heaviest week of the entire term, and it is now |
| 4 | Sep 14-20 | 3 | IST.323 Exam #1 on 9/14 |
| 5 | Sep 21-27 | 4 | GEO.103 Exam 1, IST.466 group presentation (100 pts), IST.323 lab |
| 6 | Sep 28-Oct 4 | 2 | ECN.304 Exam 1 (10/01) |
| 9 | Oct 19-25 | 3 | IST.466 major case presentation (150 pts), IST.323 Exam #2 |
| 11 | Nov 2-8 | 4 | GEO.103 Exam 2, ECN.304 Exam 2 |
| 13 | Nov 16-22 | 1 | IST.466 major case presentation (150 pts) |
| 15-16 | Nov 30-Dec 13 | 9 | IST.323 final project, checkpoint, labs and both exams; ECN.304 Exam 3 (12/08); IST.466 paper (100 pts); IST.471 supervisor evaluation (100 pts) |
| 17 | Dec 14 | 2 | GEO.103 final exam |

Readings run 5 to 10 per week almost continuously, and they are the workload that the current tracker cannot see.

### What one builder can actually ship per week

Stack is carrying seven course shells, two internships and a full-time senior load. Claude Code removes typing, not decisions, review, debugging or context switching. Realistically that is six to ten focused hours a week, concentrated on weekends, with weeks 5, 6, 9, 11, 15 and 16 largely lost to the clusters above. Call it ten productive weeks of which perhaps eight produce something shippable.

The honest unit of delivery is one increment per week: one screen, or one data contract, not both. Anything phrased as "the tracker plus the course page plus auth" is a three-week item pretending to be a sprint.

### The payback math, said plainly

If the app saves ten minutes a morning from Sep 21 to Dec 15, that is about 14 hours saved. If it costs more than roughly 40 hours to build, it does not pay back this semester in time. It may still be worth building, as a portfolio artifact and as practice, and that is a legitimate reason. But it changes the scoping rule: build the smallest thing that changes a daily behaviour, ship it, and treat everything after that as a project with no deadline instead of a plan with fifteen task items.

### The dates the app has to hit

Sep 20 (end of week 4): MVP-0 usable every morning, or the app misses the first exam cluster and the first month of the term.
Oct 18 (before week 9): MVP-1, or the two 150-point IST.466 presentations and IST.323 Exam #2 are managed out of Blackboard as usual.
Nov 29 (before week 15): MVP-2. Anything not shipped by Nov 29 will not be used this term. Plan for it to be, at best, a January feature.

---

## 5. Failure modes, with likelihood, impact and the cheapest mitigation

1. Crawler silent partial runs. Likelihood certain over 14 weeks; there is one `try` in 660 lines and a mid-crawl session expiry returns an HTML login page that throws inside `r.json()`. Impact highest in the system, because a truncated run is indistinguishable from a good one, so the freshness indicator lies and the next diff computes against a partial snapshot. Cheapest mitigation: write a `sync_runs` row with `status='running'` before the first fetch, wrap each course in try/catch, assert "7 of 7 courses seen", close the row. Roughly twenty lines, and it is the highest-value code change in the project.

2. Duo session expiry killing cadence. Likelihood certain, daily. Impact high on freshness, zero on the app existing. Mitigation is not automation: it is the staleness banner plus a one-click "run sync" that opens the prefilled terminal. Do not build a scheduler; a scheduled Claude task will report SESSION EXPIRED on most firings. Capture the iCal share URL as the one unattended path, but treat it as unvalidated until a fetch actually returns events.

3. Instructor re-creating items. Likelihood certain; it has already happened twice, verified. IST.352 Project 1A was deleted and re-created with content `_13195312_1` and column `_3607154_1`; the IST.466 schedule doc went Wk2x, Wk2xy, W3 in two weeks; a GEO.103 item was removed. Impact: duplicate assignment rows, or Stack's planner status silently detached from the item he is actually graded on. Mitigation: match on (course, title, type) before `bb_item_id`, keep the old id in `notes` rather than overwriting, and route every id change to `attention_items` instead of resolving it silently.

4. Blackboard API change mid-term. Likelihood low to moderate over 14 weeks; `/learn/api/v1` is internal, unversioned and undocumented, and Ultra ships continuously. Impact: the crawl dies, the app keeps working on aging data. Mitigation: item 1 above makes the failure visible, and the app must render honestly at two weeks stale rather than erroring. Keep the public REST fallback noted in the crawler header.

5. OneDrive sync conflicts on the mirror. Likelihood moderate over a semester. OneDrive renames conflicts to `name-DESKTOP-XXXX.ext` and can leave cloud-only placeholders that read as zero-byte or unreadable, which breaks the sha256 validation and the "open on disk" button. Impact moderate and confusing. Mitigation: mark `course context/` as Always keep on this device; have the app's Open button fall back to the Storage URL when a local read fails; never let the app write into the mirror; keep `git init` out of OneDrive as NOTES caveat 10 already says.

6. Supabase free tier pause. The project is `ACTIVE_HEALTHY` today. Likelihood low during term because it is queried nearly daily, meaningful across Thanksgiving and winter break. Impact: the app fails to connect and looks broken. Mitigation: an explicit "database is waking up" state in the error path, not a blank screen. Storage headroom is fine (41 MB of files against a 1 GB tier).

7. Electron auto-update on Windows. Likelihood of pain: high if built, zero if not. Squirrel installers, code signing and SmartScreen warnings are a multi-day detour for a single machine. Mitigation: build no installer this term. Run from the repo, or a shortcut to the unpacked exe.

8. Planner state desync between GUI and agent writes. Likelihood moderate. Both sides write `assignment_progress`, and the agent writes through the MCP with owner privileges that bypass RLS. Impact: Stack's status quietly reverted, which is the one bug that would make him stop trusting the app. Mitigation: do R3's split now, before the first app write path ships. Move the Blackboard-reported grade facts into `assignment_grades` and let `assignment_progress` be app-owned, so ownership is a table boundary rather than a convention recited in four markdown files. Add `updated_by text` while you are in there.

9. Academic integrity, and this is under-weighted in all three research files. Verified from `grading_schemes.ai_policy`: IST.352 is "Zero tolerance: all generative-AI tools prohibited at every stage (research, brainstorming, outlining, polishing, any content)". ECN.304 is default-deny: "if no instructions are given for an item, no AI use is permitted". IST.471's iSchool appendix has the permitted list left blank and the same default-deny fallback. IST.323 permits AI with disclosure and requires an Appendix B log on the final project. So an agentic hub that summarizes IST.352 course material, or drafts anything for ECN.304 or IST.471, is on the wrong side of a stated policy as written, whatever the intent. Likelihood of an actual problem is low; impact if it happens is a grade and a record, which is categorically worse than any bug in this document. Cheapest mitigation is unusually cheap because the data already exists in six of seven rows: surface `ai_policy` on every course page and every assignment popout, add a per-course `ai_assist_allowed` boolean, and have the skills refuse summarization and drafting for courses where it is false. Let the tool enforce the syllabus rather than relying on Stack remembering at 1am which course he is in. Keep the distinction visible: cataloguing dates and mirroring files he already has access to is uncontroversial; generating content about those files is what the policies address.

10. Other people's material in the corpus, not raised anywhere. `bb_file_text` includes PPTX speaker notes inline (R2 verified). The IST.466 roster files contain 28 and 29 classmates' names. The HBR cases are licensed. Phase 4 in NOTES plans a public GitHub repo, and the publishable key is committed on purpose with anon insert-only policies on `bb_raw`, `bb_files`, `bb_file_text` and the storage bucket. Likelihood: certain if the repo is published as planned. Impact: a FERPA-adjacent embarrassment and an open append endpoint anyone can fill with junk. Mitigation: do not publish this term; when you do, rotate the key, drop the anon insert policies once the crawl runs authenticated, and keep the mirror gitignored as it already is.

11. No backup, not raised anywhere. Every typed table exists in exactly one place. Mitigation: a weekly `pg_dump` into the OneDrive folder. Five minutes, once.

12. The largest failure mode, and it is not technical: the app gets built and not opened. Every mitigation above is worthless against it. The only defence is that each increment must change a daily behaviour and must be tested by Stack actually using it for three consecutive mornings before the next increment starts.

---

## 6. MVP discipline

### MVP-0: the morning replacement

One page. Today plus the next 14 days, all seven shells, assignments and readings together, each row showing course, title, date, time or the due-rule phrase, and a click-to-edit status. Below it, an "undated" tray for the 9 items with no date. In the header, the term week and a single line reading "synced N hours ago".

Nothing else. No grades, no effort score, no week rail, no popouts, no materials, no bell, no course cards.

What it needs that does not exist: Supabase Auth sign-in and a stored session; a `v_workload` view that unions `v_upcoming` with `readings` (using `for_date`, `reading_progress.status`) and a third arm or separate query for the undated rows; a write path to `assignment_progress.status` and `reading_progress.status`; the 11 missing `reading_progress` rows inserted.

Why this and not the tracker: over the next 14 days there are 13 assignment items and 12 dated readings, verified. Twenty-five rows. A list shows them all. A bar chart shows them worse and costs a week.

Acceptance test, run it as a checklist:
1. Cold open shows the date, term week, and every dated item in the next 14 days across all 7 shells in under 3 seconds.
2. Compare against Blackboard for the same window. Every item Blackboard shows is either on the list or in the undated tray. Nothing is silently absent.
3. Readings appear. ECN.304 shows its three 9/8 and five 9/15 readings, not an empty course.
4. Change a status; reload the app; the change persisted; run the sync afterwards and it still persisted.
5. The sync line reads a real age from `max(sync_runs.ran_at)` and turns amber past 24 hours.
6. No fabricated number appears anywhere. No grade, no percent, no effort figure whose inputs are missing.
7. Stack opens this instead of Blackboard on three consecutive mornings. If he does not, stop and find out why before building MVP-1.

### MVP-1: the day view and the file jump

Add: a course filter and a course page; click a day to see its items with the session topic and room for that day from `meetings` plus `sessions`; and the materials list for the course with an Open button that launches the local file from the mirror in its native app. This is where the desktop shell earns itself.

Acceptance: from a cold open, get to this week's ECN reading PDF or the IST.323 lecture deck, opened in its real application, in three clicks and without touching Blackboard. And: the course page for GEO.103 shows one course, not two shells.

### MVP-2: the sync loop made honest

Encode the transform (`bb_raw` to typed) as idempotent SQL keyed on `run_id`; add `status`, `started_at`, `finished_at`, `run_id` and the fixed `summary` envelope to `sync_runs`; add `attention_items`; bind a needs-attention row to it with real counts; add the terminal-launch button.

Acceptance: run a crawl, and within a minute the app shows "4 changes, 1 needs you"; open it, resolve the item, and it stays resolved through the next run. A crawl killed halfway shows as `partial`, not as success.

After that, and not before: `bb_grades` mirroring, the effort score if Stack has actually entered estimates, the week rail, popouts, search over `bb_file_text`. Grades in November if the data has arrived.

---

## 7. Sequencing traps the planners must not get backwards

1. Auth before any typed-table read from the renderer. The publishable key resolves to anon, and anon can read nothing typed. Build the renderer against the MCP or a service key in dev and it will work perfectly in development and 401 on day one.
2. The `v_workload` view (assignments union readings, plus an undated arm) before any list or tracker UI. Building on `v_upcoming` alone means rebuilding, and it silently hides completed, missed and dateless work.
3. One `effort_base` table covering all 18 enum values before any screen reads a base score. Two artboards already disagree, and 7 of 66 rows (`other` 3, `checkpoint` 2, `meeting` 1, `evaluation` 1) have no score in either.
4. The GEO two-shell merge, as one `v_course_display` view, before the course cards, the pop-down, the sub-bar and the M-F strip. Four surfaces, one rule.
5. `bb_files.week_no` and `session_id` backfill before the lecture popout or any per-session materials count. At 2 of 64 the popout has no reason to exist. This is a classification pass over files already on disk, not new ingest.
6. The `sync_runs` status contract before any freshness indicator. Today a partial crawl and a clean one look identical, so "synced 2 hours ago" can be a lie, and a lying freshness indicator is worse than none.
7. The transform before `attention_items`, and `attention_items` before the needs-attention UI. Building the UI first ships an empty row that reads as broken.
8. Split `assignment_progress` before the first app write path, not after. Retrofitting an ownership boundary under live planner data is the kind of migration that loses Stack's notes.
9. Renderer standalone before the Electron shell. Otherwise week one produces a window and no data.
10. Readings before tracker fidelity, and tracker fidelity before effort scoring. Effort is derived from inputs that are 40 of 66 populated; it is the last thing to matter and the first thing that tempts.
11. Correct `courses.location` for GEO.103.recitation and close NOTES caveat 3 before any UI reads a room, or ship a rule that `meetings.location` always wins over `courses.location`.

---

## 8. Open questions for Stack

1. Grades: are you willing to have no grade surface at all until November? There are two real scores in the entire gradebook today, and only IST.323 exposes a computed Total (reading 5 of 104). If yes, phases 1 through 3 get materially simpler and nothing is lost.
2. Can the renderer ship first as a localhost Vite page you open in a browser, with Electron wrapping it a week or two later? The end product stays a desktop app; this only decides whether week one produces a usable list or an empty window.
3. Readings in the main work list: yes or no? ECN.304 has 38 readings and 6 assignments. Without readings, ECN reads as a course with nothing to do, and weeks 4 through 13 average three items across all seven courses.
4. IST.466 groups: Blackboard says Ethics Group 3 and Major Case Group 2; your notes say the reverse. Which is right? The HBR case you present and both presentation dates hang on it, and the app will display whichever it reads with full confidence.
5. Will you create a Supabase Auth user and sign into it inside the app? Without it the renderer reads nothing typed, and every write element is dead.
6. Will you actually enter `est_minutes` or an effort override for the next four weeks? If not, say so now and the effort tracker becomes a plain item count, which saves a week and loses nothing real.
7. AI policy enforcement: IST.352 is zero tolerance at every stage and ECN.304 and IST.471 are default-deny. Do you want the app and the skills to hard-block summarization and drafting for those courses, warn you, or stay silent and leave it to you?
8. How does the app get launched: `npm run dev` in the repo each time, or a built executable pinned to your taskbar? This decides whether packaging is in scope at all this term.
9. GEO.103.recitation room: the database already resolves this to Maxwell 140 with a source citation, and `courses.location` is stale at 108. Confirm so it can be corrected and caveat 3 closed.
10. Public repo before December: yes or no? If yes, key rotation and dropping the anon insert policies have to be scheduled, and the mirror and roster files need a second look first.

---

## Handoff notes

The single most consequential correction in this document is claim 4. Both research files recommend reading Blackboard's own calculated Total as the cheap path to grades. One such column exists, in one course, and it currently reads 5 of 104. Any plan that puts a grade on seven course cards in phase 1 or 2 is planning against data that will not exist until October.

The second is the size of the thing. The entire live workload is 43 rows in `v_upcoming`, 20 of them inside 30 days, plus 86 readings. Everything in the GUI preview was drawn against sample rows that are denser than reality. Planners should sanity-check every screen against the real row counts before scheduling it.

The third is that phase 1 has a real deadline, Sep 20, set by the first exam cluster, and a real budget, roughly eight shippable weeks. Fifteen task items do not fit in it. Three MVPs do.

Do not build both `sync_conflicts` (R1) and `attention_items` (R3). Build `attention_items`, and only after the transform that writes it exists.

Do not treat the iCal feed as a plan input until someone has fetched it once and seen events come back. It is currently a hope with an empty variable in `.env.example`.

The `maps/` folder and the `course_maps` table have diverged: IST.352 is at version 3 in the database and has only a v1 file in the repo. Whoever plans a "needs your input" screen off `course_fields` and `gaps` should read the table, not the folder.
