# 110 · W-72 verification: the container runner's daily sync

Worker W-72, 2026-10-05. Branch `fix/sync-daily-enqueue` in bb2dash, worktree
`C:/Users/stack/projects/bb2dash-wt-daily-sync`, cut from `origin/main` 3d7683a. Machine: stack-laptop,
Windows 11, Node v24.19.0. Unit tests only: no live sync, no container, no Supabase call, no SQL change.

## The gap

`sync/src/login.ts` (the runner's login watch) called `sync_enqueue('login')` only when the watch
*entered* `alive`: `enter('alive')` set `owed = 'alive'`, and `payOwed()` called `sync_login_ok()`, then
`sync_enqueue('login')`. DECISIONS 2026-10-03 says the first time each New York day the runner sees the
login alive, it queues one sync. With the 20-minute keep-alive the login stays alive, so a night with no
death has no transition, and the next day's sync is never asked for.

## Evidence (the PM, 2026-10-05)

* The Blackboard login stayed alive all night 2026-10-04/05 under the keep-alive.
* 0 `sync_enqueue` log lines from the runner since 04:00Z (New York midnight) on 2026-10-05.
* No `sync` request was created on 2026-10-05.

## The change

* `syncDayOf(at)`: the `America/New_York` calendar day of an instant, `YYYY-MM-DD`, via one
  `Intl.DateTimeFormat('en-CA', { timeZone })`. The zone is the exported constant `SYNC_DAY_TIME_ZONE`,
  the same zone 091's `sync_login_sync_due` counts days in. No helper existed in `sync/src`
  (`web/src/lib/course-dimension.ts` has one, but `sync` does not import from `web`).
* The watch keeps `enqueuedDay`, the New York day of its last `sync_enqueue('login')` that answered.
* Every check whose verdict is `alive` (a watch probe, the probe after a keep-alive visit, the hourly
  probe with `KEEPALIVE_MINUTES=0`, and a pass's own check) then runs the daily rule: if the state is
  `alive`, the entry's call is not still owed, and today differs from `enqueuedDay`, it calls
  `sync_enqueue('login')` alone (no `sync_login_ok()`: there is no login item to archive), records the
  day, and logs `login: new New York day: sync_enqueue('login') -> <id>`, or
  `… -> nothing queued (already synced today)` on null. A failure logs
  `login: sync_enqueue('login') failed: <first line>` and leaves the day unrecorded, so the next
  passing check asks again.
* Entering `alive` keeps its `sync_login_ok()` + `sync_enqueue('login')` call and now records the day
  as well, so the daily rule adds no second call that day. While the entry's call is still owed (it
  failed), the daily rule waits and lets `payOwed` retry it, so one check never makes two calls.
* `dead` and `unknown` never call it. The watch still never claims, crawls or retries a sync. The
  once-per-day guard stays in the database: `sync_enqueue('login')` returns the open sync's id when one
  is open and null when a sync finished `done` that New York day.
* Log text is in constants (`ENQUEUE_LOGIN_CALL`, `NOTHING_QUEUED`, `NEW_DAY_LOG_PREFIX`). The entry
  path's existing log line is unchanged.
* The watch's header comment gains the rule. There is no `sync/README.md` or `docker/sync/README.md`,
  and the root `README.md` does not describe the morning sync, so no README changed.

## Calls taken by the worker

1. **A same-day re-entry still makes the entry's call.** Order "boundary call, then the login dies,
   then Stack logs back in that day" gives two calls that day: the boundary's and the entry's. The
   brief keeps the entry's call, and the existing case "the next entry into alive queues again (the
   database decides if it is due)" pins it; the database answers the second (the open id, or null if a
   sync finished `done`). If the boundary's sync failed, that re-login still gets Stack a sync. The
   other order (the morning login first, then checks) is one call in total. Both orders are pinned.
2. **The brief's DST example is off by a day; the tests pin the real clock.** 2026-11-01 begins on EDT,
   so its New York midnight is 04:00Z and 04:30Z that day is already the 1st (00:30 EDT). The clocks
   fall back at 06:00Z. The first midnight on EST begins 2026-11-02, at 05:00Z; 04:30Z on the 2nd is
   still the 1st (23:30 EST).
3. **The existing fake-clock cases now start at New York noon** (`vi.setSystemTime('2026-10-05T16:00:00Z')`
   in their `beforeEach`). Before, they ran at the real time, so a run within about two hours before
   04:00Z would have crossed a New York midnight and seen the new call. No existing assertion changed.
4. **Left as is: a pass's own check counts as a passing check.** If a pass starts just after New York
   midnight, before any keep-alive check, the daily call returns that pass's open id and records the
   day. If that pass then fails, nothing more is asked that day unless the login re-enters `alive`.
   This is rare and the brief names every `-> alive` path, so the behaviour was not special-cased.

**A limit set by the PM as a product call (round 2), not by the worker.** Once the day's call has
been answered with an id, the watch does not ask again that day, even if that sync then fails. An
automatic re-ask after a failed sync could loop. Stack sees the failure in Activity and presses Sync.
Only a new entry into `alive` (Stack logging in again) calls again that day, as before.

## Tests (`sync/test/login.test.ts`)

RED, at c752b16, before the change (`npx vitest run test/login.test.ts`):

```
 ❯ test/login.test.ts (34 tests | 8 failed) 95ms
      Tests  8 failed | 26 passed (34)
```

The new `describe('the daily rule: one sync_enqueue(login) per New York day')`, 13 cases:

1. the day is the America/New_York calendar day, across the 2026-11-01 fall-back (`syncDayOf` at
   2026-10-05 03:59:59Z / 04:00Z, 2026-11-01 03:59:59Z / 04:30Z, 2026-11-02 04:30Z / 04:59:59Z / 05:00Z)
2. alive across New York midnight in October: one enqueue on the first passing check after 04:00Z, none
   later that day, no `sync_login_ok`; the keep-alive visit path
3. the same, on the hourly probe path (`KEEPALIVE_MINUTES=0`)
4. a dead -> alive entry records the day: the morning login is the one call, and later checks that day
   add none (brief test 2)
5. a same-day re-entry after the boundary call keeps the entry's own call, then none (brief test 2,
   the other order)
6. a failed enqueue at the boundary is retried on the next passing check, then not again that day; the
   failure logs the error's first line only (brief test 3)
7. an entry whose own call failed is retried by the entry path alone, never doubled by the daily rule
8. logs "nothing queued (already synced today)" when the database answers null
9. the 2026-11-01 fall-back: the 1st begins at 04:00Z, the repeated 01:00 hour adds nothing, the 2nd
   begins at 05:00Z (brief test 4)
10. a watch that is dead (users/me 401) across New York midnight never enqueues (brief test 5)
11. a watch that is unknown (users/me 500) across New York midnight never enqueues (brief test 5)
12. an unknown watch whose probe throws across midnight never enqueues (brief test 5)
13. an alive watch whose checks fail (500) at the boundary waits for the next passing check

Case 7 was checked against a broken build: with the `owed` guard removed from the daily rule it fails
(`expected [ 'sync_login_ok', …(2) ] to deeply equal [ 'sync_login_ok', …(1) ]`); with the guard back,
it passes. All 22 existing login tests (as vitest counts them, `it.each` rows included) still pass:
the file now runs 35.

## Gates

Run from `sync/` at bf8b639. Each block is the command, then its last line verbatim.

```
npm ci --no-audit --no-fund
npm warn allow-scripts Run `npm approve-scripts --allow-scripts-pending` to review, or `npm approve-scripts <pkg>` to allow.
```

(Its `added` line: `added 71 packages in 12s`. The warning is about esbuild's postinstall, which the
build below does not need.)

```
npm run typecheck
> tsc -p tsconfig.json --noEmit
```

(Exit 0, no diagnostics.)

```
npm run build
⚡ Done in 18ms
```

```
npx vitest run --coverage
================================================================================
```

The lines above it:

```
 Test Files  7 passed (7)
      Tests  145 passed (145)
Statements   : 90.34% ( 795/880 )
Branches     : 82.3% ( 428/520 )
Functions    : 80.1% ( 149/186 )
Lines        : 91.66% ( 726/792 )
```

The configured threshold is lines 80% (`sync/vitest.config.ts`); `login.ts` is at 97.95% of lines.
Baseline before the change: 132 tests passed. `db/tests` are untouched (no SQL change).

## Files

* `sync/src/login.ts`: `SYNC_DAY_TIME_ZONE`, `syncDayOf`, the daily rule, the entry recording its day,
  the header comment.
* `sync/test/login.test.ts`: the new describe (13 cases), a `log` option on `makeWatch`, `advanceTo`,
  and the noon start for the existing fake-clock cases.
* `docs/planning/sprint-2/verification/110_W72_DAILY_SYNC.md`: this record.

`project-state/` and `db/migrations/` are not touched; the PM writes STATUS and DECISIONS.

## Round 2 (`/code-review fix/sync-daily-enqueue high`, static; 2026-10-05)

Round 2 supersedes two parts of the record above. The daily call now waits for 06:00 New York, not
midnight, and only an answer with an id records the day. The PM declined three findings: re-asking
after a failed first sync (the product call recorded under Calls above), a timeout around the
enqueue RPC (no RPC in `db.ts` has one, and the container watchdog covers a hang), and STATUS and
DECISIONS (those are the PM's).

Each item was one commit, pushed. The two behaviour changes (R2-2, R2-1) were written test first.

* **R2-5, 6c7de68.** The "a pass's own check" describe now starts at `MIDDAY_UTC` like the others.
* **R2-3, 57f77ff.** `syncDayOf` builds `YYYY-MM-DD` from `formatToParts` (year, month, day) on an
  `en-US` formatter, so no locale's date pattern is involved. A missing part throws, naming the
  instant. The existing `syncDayOf` cases stayed green.
* **R2-4, 5a0fea9.** The dead `this.state !== 'alive'` test is gone from `enqueueIfNewDay`. A comment
  says where the invariant lives: the one caller, `checkNow`, runs it only on an alive verdict, and
  `probeAndSettle` has entered `alive` before returning one.
* **R2-2, 0b77fc4.** `DAILY_SYNC_NOT_BEFORE_HOUR = 6` is exported; it is a New York local hour, read
  with the day from the same `formatToParts` call (`hourCycle: 'h23'`). Before that hour, passing
  checks make no call and record nothing. An entry into `alive` (a real login) still calls at any
  hour. If Stack moves the hour, only the constant changes. RED: `Tests  6 failed | 30 passed (36)`.
* **R2-1, e434a9e.** Both paths, the daily rule and an entry into `alive`, now record the day only
  when the answer is an id. A null sets a backoff, so the daily rule asks again no sooner than
  `DAILY_NULL_RETRY_MINUTES = 60` later. The entry's null sets it too, so a login answered null is
  not re-asked at the next check. The daily rule logs a null once per New York day and an id every
  time; the entry's log line is unchanged. The memory is one readonly `DailyMemory` object, replaced
  whole after each answer. RED: `Tests  3 failed | 35 passed (38)`. With the backoff ignored, the
  two backoff cases fail (`Tests  2 failed | 36 passed (38)`).

How the PM's R2-1 example meets R2-2: "a null at 00:00:40 New York followed by an id an hour later"
cannot happen as written, because R2-2 stops the daily rule before 06:00. The null case is pinned
twice instead:

* a daily null at 06:05, then an id at the first passing check an hour or more later (07:06), which
  records the day;
* an entry at 00:00:40 answered null, which leaves the day open; the 06:00 call's id then records it.

Each of these is two calls.

The daily rule's cases now (16; the file runs 38):

1. pins the daily rule's constants (`SYNC_DAY_TIME_ZONE`, `DAILY_SYNC_NOT_BEFORE_HOUR` 6)
2. `syncDayOf` across the 2026-11-01 fall-back (unchanged)
3. alive across New York midnight in October: no call at 00:01 or 05:59:59, one on the first passing
   check at or after 06:00; on the keep-alive path
4. the same, on the hourly probe path (`KEEPALIVE_MINUTES=0`)
5. a dead -> alive entry at 03:00 New York still calls, records the day, and the daily rule adds none
   after 06:00
6. a same-day re-entry after the daily call keeps the entry's own call, then none
7. a failed daily call is retried on the next passing check, then not again that day
8. an entry whose own call failed is retried by the entry path alone, never doubled
9. a daily null does not record the day: asked again no sooner than an hour later, and an id records
   it (also pins `DAILY_NULL_RETRY_MINUTES` 60)
10. an entry at 00:00:40 New York answered null does not record the day; the 06:00 call's id does
11. a null answered all day: at most one call an hour, one "nothing queued" line a day (and one more
    the next day)
12. the 2026-11-01 fall-back: 06:00 New York is 11:00Z on the 1st and the 2nd, not 10:00Z
13. a watch that is dead (401) across midnight and 06:00 never enqueues
14. a watch that is unknown (500) across midnight and 06:00 never enqueues
15. an unknown watch whose probe throws across midnight and 06:00 never enqueues
16. an alive watch whose checks fail (500) around 06:00 waits for the next passing check

### Round 2 gates

Run from `sync/` on e434a9e plus the uncommitted edits in this commit: this note and a comment
phrase in `login.ts` (the `DAILY_NULL_RETRY_MINUTES` doc comment).
Each block is the command, then its last line verbatim.

```
npm run typecheck
> tsc -p tsconfig.json --noEmit
```

(Exit 0, no diagnostics.)

```
npm run build
⚡ Done in 15ms
```

```
npx vitest run --coverage
================================================================================
```

The lines above it:

```
 Test Files  7 passed (7)
      Tests  148 passed (148)
Statements   : 90.51% ( 821/907 )
Branches     : 82.64% ( 438/530 )
Functions    : 80.72% ( 155/192 )
Lines        : 91.88% ( 747/813 )
```

The threshold is lines 80%. `login.ts` is at 98.21% of lines and is now 436 lines long.
