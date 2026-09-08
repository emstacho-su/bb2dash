# Validation + gap bridge — 2026-09-08

Context: the 9/7 parallel harvest was cancelled mid-run. This run re-validated every layer and
closed what was missing. Crawl run id `6b122650-49f3-4a70-a801-c177fbf27f1a` (deep embed scan);
`sync_runs.id = 12`.

## What was validated
| Layer | Check | Result |
|---|---|---|
| DB ↔ Storage | every `bb_files.storage_path` exists, sizes match | 61/61 clean |
| Local mirror | sha256 of every file under `course context/` vs `bb_files.sha256` | 60/60 match |
| Text | `bb_file_text` units per file | 523 units, 0 files with `text_status` failed |
| Layout | `v_file_layout.needs_move` | 0 |
| Live Blackboard | full re-crawl of 7 shells + deep embed scan vs catalog | 3 files missing, 1 item re-created, 1 item removed, 3 new announcements, gradebook drift |

## Gaps closed
- **IST 323** `Week1SecInNews.pptx`, `Week2SecInNews.pptx` (example SitN decks) — attached to the SitN
  assessment item's *instructions*, invisible to a `body`-only scan. Stored under
  `IST.323/assignment_spec/sitn-group-presentation/`. bb_files 64, 65.
- **IST 466** `IST466M3 Schedule Fall2026W3.docx` — new schedule version (Sep 8). Text identical to
  Wk2xy except the version date, so `sessions` unchanged. bb_files 66; rows 16/40/58 marked superseded.
- **ECN 304** gradebook column `Quiz 1` (`_3607818_1`) linked to `ECN.304/quiz-01`; posted 9/10 as an
  instructor override. `ECN.304/quiz-02` inserted from the 9/7 announcement (Thu 9/10 in class; SS
  Trustees 2026 report Introduction p. 8 + Highlights pp. 9–15).
- **IST 352** Project 1A was deleted and re-created by the instructor: new content `_13195312_1`,
  column `_3607154_1`; draft saved 9/3 → progress `in_progress`, due 9/8 23:59.
  `role-of-systems-analyst` → submitted 9/8 (late, NEEDS_GRADING). `reading-ch1-all` → graded 0, late
  feedback.
- **Announcements** +3 (ECN 304 Quiz 2, IST 352 Project 1A terms, IST 466 9/8 class reminder).

## Observations left as-is
- GEO 103 recitation `Attendance` column shows 0/100 (attempt 9/4) — no assignment row; probably a
  Qwickly placeholder. Stack to eyeball.
- GEO 103 lecture "Dolly Parton" item removed from Blackboard; catalog row untouched (no file).
- 6 orphaned Storage objects remain (need an authenticated Storage delete).

## Lessons folded into the code and skills
1. `bb.embedsDeep(item)` — scan every string field for `data-bbfile`; assessments hide attachments in
   `contentDetail.<asmt>.test.assessment.instructions`.
2. Durable URLs only: `bbcswebdav/pid-…-rid-N_1/xid-N_1`. Session-scoped `/sessions/…` URLs 403 the
   next day. Same attachment appears twice; collapse by name, keep durable.
3. `<uuid>.tmp` downloads: claim by size + magic bytes + text signature, not size alone.
4. Progress line after every step so a long run is visibly alive.
