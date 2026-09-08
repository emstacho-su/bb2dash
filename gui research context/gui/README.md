# bb2dash — GUI reference (layouts & features)

Status: **layout + feature reference only.** Colors, type and other stylist choices are still pending — these files use the Nocturne design system as a placeholder skin. Treat structure, information hierarchy, interactions and data bindings as the spec; treat the look as provisional.

Snapshot: 2026-09-08. Source of truth for behaviour is the plan sheet (00). Copy this whole folder into `bb2dash/docs/gui/` to keep it with the codebase.

## Files

| File | What it is | Status |
| --- | --- | --- |
| 00-mvp-plan.dc.html | MVP plan: screen list, task items T-01…T-17 (incl. T-15 effort score, T-16 top nav, T-17 daily schedule), data bindings | current |
| 13-home-v2.dc.html | **Home v2** — top nav + ☰ courses pop-down + bell popout, scrollable “Upcoming work” effort tracker, collapsed Needs attention, 2-up course cards with M–F strip | current — supersedes 01 |
| 14-course-v2.dc.html | **Course page v2** — course sub-bar, per-course “Upcoming work” tracker, sticky week rail 1–16 with Current/All modes, Lecture vs Assignment lanes by week | current — supersedes 02 |
| 03-lecture.dc.html | Lecture material popout | v1 — still uses left rail; port to top nav |
| 04-assignment.dc.html | Assignment material popout | v1 — still uses left rail; port to top nav |
| 12-home-options.dc.html | Options canvas: the alternatives considered per change request (1a–6b) with usability notes | reference — decisions recorded below |
| 01-dashboard.dc.html, 02-course.dc.html | v1 Home and Course page (left rail) | superseded, kept for history |

Open any file directly in a browser; `support.js` must sit beside them. Styles resolve from `../_ds/nocturne-*/` — if that folder is absent the pages still lay out but unstyled.

## Decisions made (2026-09-03 → 09-08)

- **Navigation (1c):** persistent top bar — bb2dash mark · Home · Planner · Grades · Materials, then right cluster ☰ Courses · bell · user. Courses open from ☰ as a pop-down list and go straight to the course page. Inside a course a second thin bar carries Stream · Grades · Materials · Info plus meeting time/room and a Blackboard link. Left rail is retired.
- **Upcoming work tracker (2a, extended):** horizontal, chronological. One column per day, 14 visible, scrollable/pageable (◂ ▸) across 8 weeks, scrollbar hidden, Monday marked by a rule, month label on the 1st. Bar height = Σ effort, segments = items, tint = type. Clicking a day fills a detail panel beneath: glyph, course, title, time, effort + suggested start date, status. Same component on Home (all courses) and on each course page (that course only).
- **Effort score (T-15):** reading 1 · form 1 · discussion 1.5 · homework/activity 2 · quiz 3 · lab/presentation 4 · project/paper 6 · exam 8 · final 10. Optional multiplier by points_possible ÷ course median (clamp 0.5–2); manual override wins. Suggested start = due − (⌈score ÷ 2⌉ − 1) days. Glyphs: R reading · A assignment · Q quiz · P project · E exam.
- **Course cards (3c):** 2-up, wide. Code + title, “DD: X:XX–X:XX · room” only (no per-day next-meeting tag), Next due as typed counts (e.g. “2 quiz · 1 assignment”), Grade, Open = items due this week, one-line note, and an M–F strip (meeting days filled, dot = something due).
- **Announcements (4a):** bell with unread badge → anchored dropdown (unread first, course · author · date, mark all read) → “See all” opens the Announcements screen.
- **Needs attention (5a):** collapsed row with typed counts (overdue / conflict / missing / deadline) + last sync time; click expands the list in place.
- **Today’s meetings:** removed from Home; daily schedule becomes a Planner day view (T-17).
- **Course page week filter (6b):** sticky week rail 1–16 acts as filter + map (ring = graded item due that week). Default “Current” anchors to this week with a scroll-up affordance for earlier weeks; “Show weeks 1–16” expands all; clicking a past week switches to all-weeks mode.

## Data bindings the GUI expects

- Tracker: `v_upcoming` (assignments joined to courses) + effort score; `assignment_progress.status` and `effort_override`.
- Course cards: `courses`, `meetings` (day/time/room), next-due counts by `assignment_type`, grade from `v_course_grade` or “scheme unknown”.
- Course page lanes: `sessions.week_no` for lectures; assignments by due week; `bb_files` counts per session.
- Announcements: `announcements.is_read`.
- Needs attention: `sync_runs.summary` conflicts, overdue = due < now and status ≠ submitted, missing = grading_method = unknown.

## Still open

- Port 03 lecture / 04 assignment popouts and the Grades screens to the top nav.
- Real Blackboard data to replace sample rows (tagged “sample” in the trackers).
- Visual styling pass (colors, type) once the layout is signed off.
