# R-9 — Phase 9 sync loop: comparables, patterns, DoD

Research, 2026-09-14. Scope: triggered crawl → automatic transform → Inbox with a "why" → honest
freshness UI. Feeds `62_PHASE9_sync_loop.md`.

## 1. Comparables

* **Canvas SIS Import** — states `importing / imported / imported_with_messages /
  failed_with_messages / failed`; per-row errors downloadable; a `change_threshold` refuses to diff
  a suspiciously partial feed so it cannot delete objects.
  ([docs](https://canvas.instructure.com/doc/api/sis_imports.html))
* **Moodle scheduled tasks** — admin table of *last run*, *next run*, *fail delay*; failing tasks
  back off to once per 24h; "last run very old" is the documented symptom that cron itself is dead.
  ([MoodleDocs](https://docs.moodle.org/39/en/Scheduled_tasks))
* **Linear Triage** — an inbox in front of the backlog; accept / duplicate / decline / snooze;
  decline prompts for a comment; snoozed items return on new activity.
  ([docs](https://linear.app/docs/triage))
* **GitHub notifications** — every row carries a *reason* label (`mention`, `review-requested`)
  answering "why am I seeing this", filterable via `reason:`; triage is Done vs Saved.
  ([docs](https://docs.github.com/en/subscriptions-and-notifications/how-tos/viewing-and-triaging-notifications/managing-notifications-from-your-inbox))
* **Dagster / dbt freshness** — one health badge = worst of {latest run, freshness policy, checks},
  PASS/WARN/FAIL by age; dbt sources declare `warn_after` / `error_after`.
  ([Dagster](https://docs.dagster.io/guides/observe/asset-freshness-policies),
  [dbt](https://docs.getdbt.com/reference/resource-properties/freshness))

## 2. Patterns to copy

* **Two-tier freshness per stream, as data not prose.** `warn_after` / `error_after` per stream
  (announcements, assignments, files) in one place; `v_sync_status` emits
  `{stream, last_seen_at, state: fresh|stale|never}`. The chip renders `state`; no date arithmetic
  in components.
* **Absolute beside relative.** "last synced 3 hrs ago" with the exact timestamp in `title`; stale
  values greyed. "Always use a timestamp, not just a pulsing dot"
  ([Smashing](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/)).
* **`partial` is not success.** Canvas's `imported_with_messages` earns its own state: amber,
  "synced with issues — `stage_files` failed", naming the stage and its `error`.
* **A reason line on every Inbox row**, composed from `field`, `from_value`, `to_value`, `source`:
  *"Blackboard says due Oct 14; you confirmed Oct 16 on 9/2."* Kind chips double as filters.
* **Decline-with-comment → `resolution_note`** on *every* control, Dismiss included. It is the only
  record of why a fact diverges from Blackboard.
* **Snooze semantics for `data_gap`/`deadline`:** dismissal keyed by `(kind, ref, field,
  to_value)`, so a *different* `to_value` re-raises — migration 031's unique key already fits.
* **Scheduler heartbeat on Home:** last `transform_tick()` time; past 10 minutes, "sync scheduler
  hasn't run since 14:02". Moodle's failure mode is silence.
* **`never`, not zero:** no `v_data_freshness` row ⇒ "never synced".

## 3. Anti-patterns

* A green dot with no timestamp; an "applied" chip before `applied_at` is set.
* Treating `partial` as green — Canvas admins learn to ignore "imported with messages".
* Alert fatigue: a `data_gap` row per undated reading buries the three that matter. Align
  thresholds to the real cadence plus buffer
  ([Paradime](https://www.paradime.io/guides/blog-dbt-source-freshness-best-practices)); roll gaps
  up to one row per `(kind, course_id)` with a count.
* Delete-on-disappear. Keep the never-delete rule; add Canvas's threshold: a stage about to change
  > 30% of a table stops, marks the run `partial`, raises one `stack_must_confirm`.
* Retry storms. Moodle backs off deliberately; our reaper marks failed and stops.
* `localStorage` for Inbox state (fine for the Activity seen-marker only).

## 4. Standard operating procedure

Done is three test layers, not one. dbt separates **unit tests** (logic against fixtures), **data
tests** (SQL assertions on output) and **source freshness**, and advises testing freshness at the
source at least twice as often as the lowest SLA
([dbt](https://docs.getdbt.com/blog/test-smarter-where-tests-should-go)); SLAs are declared as
`warn_after`/`error_after`, severity `error` on high-priority sources. Run-status taxonomy follows
Airflow — the run fails if any leaf fails, per-task state kept for history
([Airflow](https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/dag-run.html)) — and
Dagster rolls run + freshness + checks into one badge. Idempotency is verified, not assumed:
natural-key upserts plus a replay test proving a second run changes nothing
([idempotency](https://www.arecadata.com/core-data-engineering-concepts-idempotency/)). Triage SOP:
one named owner for the queue; every decline carries a written reason (Linear).

## 5. Proposed DoD checklist

- [ ] **One real crawl end-to-end** (Stack, on the preview): Sync button → `/bb-sync <id>` in a
      logged-in tab → transform runs itself, no manual SQL → Inbox shows the new items → Home shows
      the freshness line → he resolves one item with a why.
- [ ] Replay is a no-op: `run_transform` twice on one `run_id` returns the same `sync_runs.id`,
      `attention_items` count unchanged, 0 rows updated; output in `64_W15_VERIFICATION.md`.
- [ ] Out-of-order replay: the 9/2 run after the newest raises no duplicate rows and updates no
      `confidence='confirmed'` row (`count(*) … where updated_at > $t` = 0).
- [ ] Each stage writes exactly one `sync_stage_runs` row even when it throws: force one to fail →
      run `partial`, that stage `failed` with `error`, others `ok`.
- [ ] Conflict round trip, screenshotted: raised with `field/from_value/to_value` → "Accept
      Blackboard" + note → chip "answered, applies on next sync" → next run sets `applied_at`,
      writes the value, `confidence='confirmed'`, chip clears.
- [ ] `resolution_note` persists for all four controls, Dismiss included (unit test on request
      bodies + SQL showing non-null notes).
- [ ] `v_sync_status` returns per-stream `{last_seen_at, state}`; fixture test covers
      `fresh` / `stale` / `never`, and `never` renders "never synced".
- [ ] Fixtures for `ok` / `partial` / `failed` render distinct copy; `partial` names the failed
      stage. Test asserts the strings.
- [ ] Heartbeat: Home shows the last tick; a >10-minute-old fixture renders the warning;
      `cron.job` and `cron.job_run_details` pasted in the note.
- [ ] Reaper: insert `running` with `started_at = now() - 31 min`, call `transform_tick()`, assert
      `status='failed'`, `notes='interrupted (reaped)'`.
- [ ] Noise budget after the real crawl: open `attention_items` ≤ 60, `data_gap` rolled up to one
      row per `(kind, course_id)`; counting query in the note.
- [ ] No fabricated numbers: grep Inbox/Home for literal counts or dates; every number traces to
      `v_sync_status` / `attention_items`. CSS Modules only.
- [ ] Security: anon client sees 0 rows on `attention_items`, `agent_requests`, `app_settings`;
      every `security definer` function has a fixed `search_path`; unauthenticated GET of a
      `bb-files` object returns 400/403 and Materials Open still works.
- [ ] SOP gates: typecheck/build/test green; `/code-review` HIGH cleared; `/security-review`;
      STATUS + DECISIONS updated in the same PR; Vercel preview posted.

## 6. Open questions for Stack

1. Freshness thresholds — proposal: announcements warn 24h / error 72h; assignments 24h / 7d;
   files 7d. Confirm or override.
2. Is the "why" note **required** on Dismiss and optional elsewhere, or optional everywhere?
3. Dismissed `data_gap`: permanent, or re-raised when Blackboard's value changes?
4. If the first crawl raises 200+ gap rows: per-course rollups with "show all", or a hard cap?
5. Does a failed `bb-sync` (session expired) belong in the Inbox as `stack_must_confirm`, or only
   as a toast in the session that ran it?
