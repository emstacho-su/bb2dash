# Reconciliation — local planning docs (Sep 3–8) vs cloud state (Sep 9)

Produced 2026-09-09 by the cloud PM session after recovering `docs/planning/` and
`gui research context/` from Stack's local clone. The local docs were written without
knowledge of the cloud sessions' work (migrations 010–011, edge functions, embedding POC).
This doc records what conflicts, what transfers, and the reconciled v1 proposal.
Decisions marked OPEN go to Stack.

## Live-prod facts that contradict the local plan's assumed starting state

1. `auth.users` count is **0** — no Supabase Auth user exists yet. Everything auth-gated
   is blocked on creating the one user and disabling signups.
2. `storage.buckets`: `bb-files` is still **public: true** (plan item 0.1(b) unfixed);
   professors' files are fetchable by anyone with a derivable path.
3. 25 permissive `to authenticated using (true)` RLS policies + anon INSERT on
   `bb_raw`/`bb_files`/`bb_file_text`/`bb_text_embeddings`/`storage.objects`. The local
   plan's own hardening spec (`21_D2` §13.5: signups off, policies →
   `auth.uid() = app_owner()`, HTTPS) is adopted verbatim as the pre-public-URL bar.
4. Migration numbers 010/011 are consumed in prod (`010_search_layer`, `011_gte_small`);
   the local plan's 010–021 numbering shifts to 012+.
5. FTS "migration 017 / search_corpus()" from the local plan is superseded: prod already
   has `bb_file_text.fts` + GIN, `search_file_text()`, `match_file_text()`,
   `hybrid_search_file_text()`, and 1,195 gte-small embeddings (eval: hybrid hit@1 9/10
   vs FTS 1/10 — the local plan's "ilike is enough / FTS is over-build" call is
   empirically wrong for conversational queries; its cost objections are moot at $0).
   One local objection SURVIVES and transfers: the corpus carries PPTX speaker notes
   inline, so the search UI must scrub/label `[notes]` markers and strip `Page N`
   headers in snippets (plan item 3.7).

## Conflicts for Stack (OPEN unless resolved below)

* **C1 Docker-first hub vs no-Docker cloud.** Docker's entire remaining job list is five
  timers (transform tick, stale-run reaper, heartbeat, freshness nag, ical poll) + static
  hosting. `pg_cron` + `pg_net` (already enabled) cover the timers inside Supabase;
  Vercel hosts the app; a cloud scheduler removes the laptop-sleep catch-up problem the
  plan had to design around. What Docker/Electron uniquely offered: `shell.openPath` on
  the OneDrive mirror and spawning `claude` locally — browser fallbacks are already
  specced (signed-URL open, copy-path, "recorded on disk" labeling, plan item 3.5).
* **C3 Desktop shell endgame.** Local brief says "not a hosted web app"; the mockup
  sheet itself says "Desktop web app", and the pre-existing repo CLAUDE.md mentions
  Vercel deploys. OPEN: keep Electron as a later phase or drop.
* **C6 Repo visibility.** Local docs internally inconsistent (public vs private).
  OPEN.

## What transfers cleanly (adopted)

* Security punch list (item 0.1): one auth user, signups disabled, `bb-files` private +
  `createSignedUrl`. More urgent, not less, on a public URL.
* The migration DDL set, renumbered 012+: `effort_override` (012), `effort_base` + 19
  seeds (013), `v_work_items` (014), `v_course_display` + GEO merge + `room_disputed`
  (015), `bb_files.superseded_by`/`link_confidence`/`v_bb_files_current` (016),
  sync contract (`sync_runs` status columns, `sync_stage_runs`, `v_data_freshness`,
  minus the request_id FK) (017). Deferred: `attention_items`, `bb_gradebook`/
  `v_course_grade`, `agent_requests`, `hub_jobs`, `ai_assist_allowed` DDL.
* The effort model in full (`20_D1` §3): base scores by 19-value type enum,
  `in_workload=false` for meeting/attendance/participation, five-rung fallback ladder,
  points-multiplier gated on ≥5 non-null points rows per course, source label on every
  figure, suggested start skips `no_class` sessions.
* Every honesty rule: no fabricated numbers; no grade display before real gradebook
  data; tentative-session markers; four-way reading Open ladder; "recorded on disk"
  not "on disk"; `meetings.location` beats `courses.location`.
* Scope cuts: 14-day tracker window (not 56), no bell/announcements this term,
  needs-attention reduced to a last-sync line, no planner day view, no grade engine
  until Phase 5.
* CSS Modules + custom properties, NO Tailwind — the `.dc.html` artboard markup is the
  spec and ports 1:1. (Router/build change from Vite+hash-router to Next.js is accepted.)
* MVP-in-ten-minutes discipline and per-phase cut orders.
* AI-policy gate: verbatim `grading_schemes.ai_policy` display per course (IST.352 is
  zero-tolerance) — matters more with semantic search sitting next to it.

## Reconciled v1 (proposal)

Screens: Sign-in → Today (13-home-v2: top nav, ☰ pop-down, 14-day effort tracker with
click-to-detail, last-sync line, 2-up course cards without grade line) → Course page
(14-course-v2: sub-bar, sticky week rail 1–16, lecture/assignment lanes, session panel,
AI policy) → Course Materials (Open ladder, signed URLs) → cmd-K search over the deployed
hybrid `search` function with notes-scrubbing. Deferred: bell, planner day view, grades,
Inbox/Activity, Electron.

Worker breakdown: W-1 owner security actions (auth user, signups off, bucket private);
W-2 migrations 012–014; W-3 migrations 015–017; W-4 Next.js scaffold on Vercel +
Supabase Auth + query layer + Nocturne token port; W-5 Today screen; W-6 Course page;
W-7 Materials; W-8 cmd-K search UI; W-9 RLS hardening to `auth.uid() = app_owner()`
(required before real data sits behind a public URL).

Full analysis with file/section citations lives in the PM session transcript of
2026-09-09; source docs: `docs/planning/00–31`, `gui research context/gui/README.md`.
