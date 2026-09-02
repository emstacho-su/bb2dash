# Phase 2 — Blackboard pass, 2026-09-02

Run id `3e12fd89-1ac8-4ab1-bd2a-0dce984a90fc` (see `sync_runs`, raw payloads in `bb_raw`).

## How ingestion actually works (this is the reusable part)

Blackboard Ultra's UI is a client of JSON endpoints under `/learn/api/v1/` (internal) and
`/learn/api/public/v1/` (documented). Both answer to the browser session cookie. So a crawl is:
run `ingest/bb_crawler.js` inside the logged-in tab → it walks memberships, content tree,
gradebook, announcements, calendar → POSTs raw JSON to Supabase `bb_raw` with the publishable key
(insert-only policy) → SQL transforms populate the typed tables. Nothing passes through chat.

Endpoints that matter:

| Data | Endpoint |
|---|---|
| My courses | `/learn/api/v1/users/{userId}/memberships?expand=course...` |
| Content tree | `/learn/api/v1/courses/{C}/contents/{id}/children?@view=Summary&limit=100` (recurse containers) |
| Document body + embedded files | `/learn/api/v1/courses/{C}/contents/{id}` (files are `<a data-bbfile="{json}">` in `body.rawText`) |
| My grades (all columns) | `/learn/api/v1/courses/{C}/gradebook/grades?userId={userId}&expand=column,lastAttempt,submissionStatus&includeNoGradeItems=true` |
| Announcements | `/learn/api/v1/courses/{C}/announcements` |
| Calendar (all due dates) | `/learn/api/v1/calendars/calendarItems?since=&until=` |

Blockers found: `bbcswebdav` file URLs 302 to a cross-origin CDN with no CORS, so page JS cannot
read file bytes. Files are catalogued in `bb_files` (45 rows); bytes need a manual download or a
Learn REST token. `courses/{C}/schedule` is empty for every course (SU doesn't populate it).

## What changed in the typed tables

* Meeting times/rooms for the three unknowns, from welcome announcements: ECN 304 TTh 3:30-4:50 LSB 001;
  IST 352 MW 12:45-2:05 Hinds 018; IST 466 TTh 2:00-3:20 Hinds 243.
* Staff contacts: Larche mlarche@syr.edu / (585) 739-1185; Corsello afcorsel@syr.edu / 206 Hinds / 315-443-5386.
* 28 of 64 assignments now carry Blackboard column + content ids and exact due timestamps.
* 7 new IST 352 assignments from the gradebook (knowledge checks, readings, Project #1A).
* IST 471 assignments 1-6 dated (9/11, 9/11, 9/18, 10/9, 11/6, 12/11).
* IST 466 grading: points scheme inferred from gradebook columns (tentative, 870 pts; columns are rolled
  over from 2021-2023 and one is still named "Zomatoes Major Case #2").
* IST 323: Final Project org = Packet A, Meridian Pharmacy. Proposal column = 13 pts (11 + 2 log).
  Orange Inclusive Access textbook opt-out deadline 9/14.
* `bb_content` 139 rows, `announcements` 8 rows, `bb_files` 45 rows.

## Grades and statuses pulled

| Item | Blackboard says |
|---|---|
| IST 323 Quiz #1 | graded 10/10 (submitted 8/31) |
| IST 352 Reading Ch.1 (pp.11-12), Read Ch.1 (All) | submitted 9/1, needs grading |
| IST 352 Knowledge Check 08/26 | completed 0/0 |
| IST 352 Project Teams & Option (due 9/1), Knowledge Checks 08/31 and 09/02 | unopened after due → marked `missed` (override if done in class) |
| ECN 304 Attendance | 100; GEO 103 Absences 0 |

## Still open

1. IST 352 grading method: syllabus is `IST 352 Syllabus Fall 2026.docx` embedded in Blackboard; not readable yet.
2. IST 466 weights: `IST466M3 Fall2026 Syllabus.docx` embedded in Blackboard.
3. GEO 103 recitation section time: `Discussion Section Syllabus Fall 2026.docx` in the M003 shell.
4. IST 323 Security-in-the-News group/date and individual presentation date (not chosen yet).
5. IST 466 Group #3 presentation slots.
6. iCal feed URL: not exposed via the calendar API; grab from the calendar page's share/settings UI.

## Files worth downloading into `course context/` (Blackboard blocks scripted download)

* IST.352: `IST 352 Syllabus Fall 2026.docx`, `IST 352 Class Schedule Fall 2026.docx`, `IST 352 Fall 2026 - Project Teams.xlsx`
* IST.466: `IST466M3 Fall2026 Syllabus.docx`, `IST466M3 Schedule Fall2026Wk2x.docx`, `Synchrony_Cuse Capstone_Fall2026.pdf`, `IST466_M3Class_Fall2026Roster_Wk2_New.xlsx`, `IST466 Ethics Cases Spring 2026.docx`
* GEO.103: `Discussion Section Syllabus Fall 2026.docx`, `GEO 103 Population Reading Questions.docx`
* IST.323: `IST323_Packet_A_Meridian_Pharmacy.docx`, `IST323_Vendor_Price_Sheet.docx`, Appendix A/B/C sample PDFs
