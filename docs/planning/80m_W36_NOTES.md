# W-36 — recurring planner events, web side (T-1)

Branch `fix/page-pass-12b-tail-recur`, worktree `bb2dash-wt-12b-tail-recur`, cut from `main` at
`6f20a00`. Scope: the frozen tail contract's §T-1 **Web** paragraph. Nothing in `db/`,
`project-state/` or `database.types.ts` was touched, and no row was written to prod.

## What was built

### 1. `web/src/lib/planner-recurrence.ts` — pure expansion

* `MAX_SERIES_OCCURRENCES = 52`, `SERIES_FREQS = ['daily','weekly','monthly']`, `isSeriesFreq`,
  `SERIES_FREQ_LABELS`.
* `expandSeries(draft, freq, until, zone)` → the finished `planner_events` rows of a whole series,
  the first of them the draft itself. Each occurrence is resolved **on its own date** through
  `planner-zone.ts` (Temporal `compatible`), never by adding milliseconds, so the wall clock is
  what repeats: a 09:00 class is 09:00 on both sides of a clock change and its instant moves.
* Weekly = the same weekday; monthly = the same day of the month, and a month without that day is
  skipped, never clamped. All-day occurrences keep K-3's local-midnight exclusive end and the same
  span in whole local days. The end date is mandatory; over the cap is a refusal with a message,
  not a truncation.
* `seriesOccurrenceDates(firstDate, freq, until)` — the dates alone, for the form's live count.
  Lazy and bounded at 53, so a far-off end date costs nothing.
* `restateSeriesRows(rows, edited, draft, zone)` — the scoped-edit helper. Every in-scope row keeps
  **its own id**; its local start date moves by the same number of days the edited occurrence
  moved, then takes the draft's wall-clock time, duration and zone. Ids surviving is what makes the
  push a patch per Google event rather than a delete and an insert.

### 2. Query layer

* **`web/src/lib/queries.plannerSeries.ts`** (new — `queries.plannerEvents.ts` would have gone past
  400 lines): `useCreatePlannerSeries`, `useUpdatePlannerSeries`, `useDeletePlannerSeries` on
  `planner_series_create` / `_update` / `_delete`, with the contract's argument names. Optimistic
  across every cached week, rollback per row, the same keys and the same "invalidate when no other
  planner-event write is in flight" rule as the existing hooks. Also `usePlannerSeriesRule`, a small
  read of `planner_event_series` so the form can show a saved rule instead of inventing one.
* The update **reads its own scope** from `planner_events` before writing: the grid only holds the
  weeks it has shown, and a scope can reach a year out, so the rows are read, restated by id and
  sent. `following` runs from the occurrence that was opened; `all` runs from now.
* **`queries.plannerEvents.ts`**: the week read now selects 082's two columns; the cache fan-out is
  exported (`patchPlannerRows`, `rollbackPlannerRows`, `cachedPlannerEvents`, `invalidateWhenIdle`)
  so both modules patch one cache the same way; `PlannerEventUpdate` gained `detach?: boolean`,
  which is how "This event" sets `series_detached` through the existing update.
* **`web/src/lib/planner-series-types.ts`** — **marked for deletion at integration.** The generated
  types know neither `series_id` / `series_detached` nor the three RPCs, and W-36 must not edit
  `database.types.ts`, so the shapes are typed here from the contract and reached through one
  adapter. Two casts elsewhere carry the same marker: the select string in
  `PLANNER_EVENT_COLUMNS_WITH_SERIES` and the update payload in `useUpdatePlannerEvent`.

### 3. UI

* **Repeats** on `PlannerEventForm`: Does not repeat / Daily / Weekly / Monthly, a required
  **Ends on** date when it repeats, a live `N occurrences` line and the 52-cap error. The count and
  the cap are answered from the dates alone while the rest of the form is still invalid. A rule
  that will not expand is never saved as a single event.
* An occurrence already in a series shows its rule **read-only** with a line saying how to change
  it (delete this and the following, then create the new pattern) — the tail ships no rule editor,
  per the PM's cut. If the rule has not been read, the form says only that the event repeats.
* **`PlannerSeriesScopeDialog`** — "This event / This and following events / All events", defaulting
  to the narrowest, with a focus trap, Escape, backdrop dismiss and focus return. It deliberately
  does **not** use `PopoutShell`: it opens on top of the form, which listens for Escape on `window`,
  so it catches Escape in the **capture** phase and stops it. One Escape closes one dialog.
* A small repeat mark (`↻`, `role="img" aria-label="Repeats"`) on series blocks and chips; a
  detached occurrence carries none, because it no longer moves with the others.
* CSS Modules and existing custom properties only. No Tailwind, no new dependency.

### Files

New: `planner-recurrence.ts`, `planner-series-types.ts`, `queries.plannerSeries.ts`,
`PlannerSeriesScopeDialog.tsx` + `.module.css`, six test files.
Edited: `queries.plannerEvents.ts`, `planner-event-form-state.ts`, `PlannerEventForm.tsx`,
`PlannerEventFormFields.tsx`, `PlannerEventBlock.tsx`, `PlannerWeek.module.css`,
`usePlannerEventEditor.ts`, and two lines of wiring in `PlannerWeek.tsx`.
`PlannerItem.tsx`, `web/src/components/popout/` and `PlannerBoard.tsx` were not touched (W-37).

## Tests

| | Files | Tests |
|---|---|---|
| Before (`main` at `6f20a00`) | 93 | 1582 |
| After | 99 | 1676 |
| Added | 6 | **94** |

* `planner-recurrence.test.ts` — 26 examples: the three rules, both DST directions, the monthly
  skips (31st, 30th, 29 February), all-day midnights, every refusal, `restateSeriesRows`.
* `planner-recurrence.props.test.ts` — 14 seeded `fast-check` properties over random dates, rules
  and zones: count bounds (1..52 or a refusal), strictly forward with no repeated date, the same
  local time on every occurrence, DST weeks (where the offsets differ, the instants are *not* a
  fixed +7 days), the day of the month never moves, all-day midnights and spans, the cap is exact,
  and a guard that the draws themselves never land in a gap. Replay with `FC_SEED=<n>`; 200 runs
  per property via `test/grade-model/fc-params.ts`.
* `queries.plannerSeries.test.tsx` — 13: the RPC names and arguments, `p_rows` columns and ids,
  refusals before any request, optimistic patches and rollback, `planner_events` only.
* `PlannerSeriesScopeDialog.test.tsx` — 15, including the Escape-does-not-reach-the-shell test.
* `PlannerEventForm.repeat.test.tsx` — 10.
* `PlannerWeek.series.test.tsx` — 16: all three flows on the real grid against a mocked Supabase.

No test writes a `planner_events` row anywhere: a saved planner event lands on Stack's real Google
calendar within two minutes, so the whole suite runs against stubs.

**Gates:** `npm run typecheck` clean · `npm run lint` 0 errors (27 warnings, all pre-existing, none
in these files) · `npm run test` 1676 passed · `npm run build` succeeded.

## Deviations from the contract

None in the frozen names or behaviour. Two choices the contract left open:

1. **The rule is read, not guessed.** The contract says the settings are shown read-only when
   editing a series row, but a `planner_events` row carries only `series_id`. Rather than invent a
   frequency, a small `planner_event_series` read (`usePlannerSeriesRule`) supplies it, and the form
   degrades to "This event is part of a repeating event" if it is not there.
2. **Repeats is offered on create only.** Turning an existing one-off into a series has no RPC in
   083 (`planner_series_create` inserts its own rows), so the control is not shown when editing a
   non-series event.

## For the PM to decide

1. **`p_scope = 'all'` and clock skew.** The client sends `p_from = its own now()` and 083 applies
   its own `now()`. If the browser's clock is a few seconds behind the server's, a row starting in
   that gap is sent but is "not in scope", and the contract says such a row is *refused*, failing
   the whole transaction. Should 083 use `greatest(p_from, now())`, or skip past rows instead of
   refusing them? (W-35's call; the web side needs no change either way.)
2. **`'following'` moves rows to a new series.** After that RPC the rows' `series_id` changes. The
   optimistic cache still shows the old id until the refetch lands (one refetch later, seconds).
   Harmless as far as I can see, but it is a fact worth having on the record.
3. **The old series' `until_date` on a `'following'` split** is "the day before `p_from`" — that day
   has to be computed in the occurrence's own zone, not UTC, or a late-evening occurrence will move
   the boundary by a day. Worth a 083 test (W-35).
4. **Integration order.** The week read now asks for `series_id, series_detached`, so this branch
   needs 082 applied before it runs against prod. Merge W-35 first, or merge together.
5. **Delete at integration:** `web/src/lib/planner-series-types.ts` and the two casts marked
   "TEMPORARY with `planner-series-types.ts`" in `queries.plannerEvents.ts`, once
   `database.types.ts` has been regenerated against 082/083.
6. **Visual sign-off (Stack).** The repeat mark glyph, the Repeats row's place in the form and the
   scope dialog have not been in front of him. Per the SOP, anything visual needs a dev server or a
   preview before merge.

---

# Integration (W-36 as integrator, branch `fix/page-pass-12b-tail`)

W-35 (082–083, live on prod), W-37 (popover + route) and W-36 merged, with `database.types.ts`
regenerated from prod at `3f417cc`. Four changes on top of that merge.

## 1. The temporary types are gone

`web/src/lib/planner-series-types.ts` is **deleted**, with both casts it carried:

* `series_id` and `series_detached` are now in `PLANNER_EVENT_COLUMNS` itself, and the generated
  `Row` has them, so `PLANNER_EVENT_COLUMNS_WITH_SERIES` and its `as typeof` are gone; the detach
  update's `as Partial<PlannerEventDraft>` is gone with them.
* The membership predicates (`seriesIdOf`, `isSeriesDetached`, `isSeriesMember`, and
  `PlannerSeriesFields`) moved to `planner-events.ts`, the module that owns the row shape; the
  scope vocabulary (`SERIES_SCOPES`, `SeriesScope`, `SeriesWriteScope`) moved to
  `planner-recurrence.ts`. The series module now uses the ordinary typed browser client, and
  supabase-js types all three RPCs' arguments and returns.
* `test/factories.plannerEvents.ts` gained the two column defaults — the regenerated `Row` is what
  made the omission an error, which is the point of generating it.

One deliberate cast remains and is commented: `p_rows` is declared `Json` by the generated types,
so the row array is widened to `Json` at the call.

## 2. The "all events" boundary (PM decision 1), client-side

083 refuses a `p_rows` element starting before the server's own `now()`, and one refused element
fails the transaction. `SERIES_SCOPE_SAFETY_MS = 60_000` now cuts an `all` scope a minute into the
future — on the in-scope read **and** on `p_from` — so an occurrence starting within the next
minute counts as already past and is left out. The margin is one-sided on purpose: 083 updates
what it is given and does not require the whole scope, so leaving a row out changes nothing, while
sending one row too many fails everything.

`planner_series_delete` keeps the unmargined cut: it applies `starts_at >= now()` itself and
refuses nothing, so a boundary row is deleted or it is not, never an error.

A refusal that still arrives rolls back exactly as before (`rollbackPlannerRows` on `onError`) and
now reaches the existing error path — the dialog, or the grid alert — as a plain sentence instead
of the Postgres text: *"Some of these occurrences have just started or already passed, so nothing
was changed. Close this and open the event again."*

**PM decision 2 needs nothing:** 083 reads the cut's local date in the series' own zone
(`p_from at time zone v_zone`) in both `planner_series_update` and `planner_series_delete`.

## 3. 083's offset rule (W-35's note)

083 casts `starts_at` / `ends_at` straight from the strings sent and refuses any without an
explicit offset. Every instant the web builds comes from `toISOString()`, so it ends in `Z` — and
that is now stated rather than assumed: `hasExplicitOffset` in `planner-recurrence.ts` mirrors
083's own regex, `validatedRows` refuses an offsetless row at the boundary with no request, and
tests pin it over `expandSeries`, `restateSeriesRows`, both RPC payloads and a property over
random rules and zones.

## 4. Layering: the popover, the form and the scope question

A real gap, now fixed. `PlannerItemPopover` closes on an outside **press**, but activating a
planner-event block from the keyboard fires a click and no press — so the popover and the event
form could be up together, one Escape would dismiss both, and each would hand focus back to a
different opener. Opening the event form now closes the popover first (wiring in
`PlannerWeek.tsx`; both openers covered). Verified as a regression test: with the wiring removed,
both new cases fail.

The other direction needs nothing: the form's backdrop and focus trap mean no popover can be
opened behind it. And Escape on the scope question still closes only the scope question — it is
caught in the capture phase — which is now also checked through the real stack, with the form's
edit intact and nothing written.

## Gates

| Package | Result |
|---|---|
| `web` — `npm run typecheck` | clean |
| `web` — `npm run lint` | 0 errors, 27 warnings (all pre-existing, none in the planner series files) |
| `web` — `npm run test` | **1753 passed**, 104 files (1739 before this integration; +14) |
| `web` — `npm run build` | compiled, 10 static pages |

Tests added while integrating: 6 in `queries.plannerSeries.test.tsx` (the margin cut, the
optimistic scope, the plain refusal, the offset guard and two payload checks), 3 in
`planner-recurrence.test.ts`, 1 property in `planner-recurrence.props.test.ts`, 4 in
`PlannerWeek.series.test.tsx` (layering).

Both other packages needed an install first (neither had `node_modules` in this worktree), and
both are green afterwards: `mcp-server` **88 passed** in 5 files, `desktop` **549 passed** in 28
files (coverage 96.7% statements / 98.2% lines). Neither package was touched by any of this work.
