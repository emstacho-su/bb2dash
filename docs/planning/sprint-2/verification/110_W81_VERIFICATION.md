# 110 W-81 verification: the worker holds, the stamped session answer, the skill text

Worker W-81, branch `fix/phase23-followups-apply`, tasks 7, 8 and 9 of brief 110. No prod access, no
database connection, no docker command, no `.env` or secrets folder was touched.

Commits: `b86eec2` (red tests, tasks 7 and 8), `6f9652c` (green code, tasks 7 and 8), `3222eff`
(skill text, task 9). The code for tasks 7 and 8 shares lines of `batch.ts`, so it is one green commit.

## Task 7: the worker holds

**Red** (`b86eec2`, `cd apply && npx vitest run`):

```
Test Files  2 failed (2)
     Tests  14 failed | 122 passed (136)
```

The 14 are the new cases plus the two existing cases whose expectations changed (the empty
`parsePrepared` shape, and the report lines of "an item Claude did not archive").

**Green** (`6f9652c`):

```
Test Files  2 passed (2)
     Tests  136 passed (136)
```

The five named cases (the test titles start with `case N`):

| # | file | title |
|---|---|---|
| 1 | `apply/test/pure.test.ts` | `case 1: a held row that would go to Claude is skipped and never in the batch` |
| 2 | `apply/test/pure.test.ts` and `process.test.ts` | `case 2: a held row the worker can record itself is recorded, not skipped` / `case 2 (whole pass): ...` |
| 3 | `apply/test/pure.test.ts` and `process.test.ts` | `case 3: skip_seen carries, for each skipped id, the resolved_at string prepare gave` / `case 3 (whole pass): ...` |
| 4 | `apply/test/process.test.ts` | `case 4: held answers alone, on a request a sync filed, start no run and close done` (and a follow-up variant) |
| 5 | `apply/test/process.test.ts` | `case 5: an empty held (a press of Apply answers) sends the same answers to Claude` |

Also covered: `held` read from the answer, `params.skip` used only when the key is absent, the exact
`resolved_at` string kept (microseconds survive: `2026-10-08T03:12:45.123456+00:00`), the first line
`Nothing new was applied; N answers wait.`, and that no report line mentions Undo.

What changed:

* `apply/src/batch.ts`: `Prepared.held` (null when the key is absent), `QueueRow.resolvedAt` (the string
  as given, never through `Date`), new `skipSet()` (`held ?? skip`), `planBatch` tries
  `templatedRecord` first and skips only a row that would go to Claude.
* `apply/src/report.ts`: `ReportInput.seen` (id to `resolved_at`), result key `skip_seen`
  (`[{ id, resolved_at }]`, one per skipped id, null when `prepare` did not list the id), the headline for
  held answers alone, the line `Held from an earlier try: ...`, and the sentence "A sync does not try
  these answers again; a new answer or a press of Apply answers does." on the Not applied and Held lines.
  No line names Undo.
* `apply/src/loop.ts`: passes `skipSet(prepared)` and the `seen` map; one log line for held answers.
* No other file under `apply/src` changed.

## Task 8: a stamped session answer

Same red and green runs. Test: `apply/test/pure.test.ts`, `task 8: a session answer with was_applied true
is recorded with link_file_sessions in its rule, never apply_resolutions`. `templatedRecord` now reads the
session rule before the general `wasApplied` rule. The rules for "none" and for a file that already
agrees are unchanged.

## Task 9: skill text

Red (counts at the parent of `3222eff`): `sent again at the next one` 1, `has a known gap` 1, `runs the same
script on a schedule` 1, `inbox_apply_held_items` in bb-sync 0.

Green:

```
grep -c "sent again at the next one" skills/inbox-apply/writer.md        -> 0
grep -c "has a known gap" skills/inbox-apply/SKILL.md                    -> 0
grep -c "runs the same script on a schedule" skills/inbox-apply/SKILL.md -> 0
grep -c "inbox_apply_held_items" skills/bb-sync/SKILL.md                 -> 1
node --test scripts/install-skills.test.mjs docker/apply/image.test.mjs docker/grep-clean.test.mjs
  tests 33, pass 33, fail 0
```

## Gates (from `apply/`)

* `npm run typecheck`: exit 0.
* `npx vitest run --coverage`: 136 passed, 0 failed.
* Line coverage of `src/`: **94.87 %** (was 94.78 %).

## Defaults taken

1. `Prepared.held` and `ReportInput.seen` are optional in the types, so existing literals in the tests
   need no edit. `parsePrepared` always sets `held` (an array, or null when the key is absent or not an
   array).
2. A held row is skipped only if the worker cannot record it itself; the held list is not trimmed to the
   queue. Ids in `held` that are not in the queue are ignored (`left` filters them in the report).
3. `skip_seen` is built from the report's `skip` list (this run's failures plus ids skipped this pass that
   are still waiting), as the brief says "one per skipped id".
4. A stamped session answer whose file no longer agrees (the file moved on after the stamp) is recorded as
   `Applied by link_file_sessions() at <time>; the stamp was set when the fold wrote his pick (migration
   188).` rather than falling through to the `apply_resolutions()` name. The brief says only "session rule
   before the general one"; this extends it so the wrong function's name is never written.
5. Supersede answers in the skill text: since 188 the question is not asked again; a pick stays
   `needs_change` with `flagged.code_change` (nothing applies it, open item O-2); an answer of "none" is
   complete and is recorded as bucket `kept`, nothing flagged. The brief does not name the bucket for
   "none"; `kept` was my pick.
6. `skills/bb-sync/SKILL.md` step 5b reads `where id not in (select inbox_apply_held_items())`. This
   assumes the function is a set-returning function of bigint ids. W-80's file was not on its branch yet,
   so I could not check the return type. If it returns an array, the one line needs
   `id <> all (inbox_apply_held_items())`.
7. SKILL.md step 5 says a session offers the manual step (`just file-decisions`) and does not run it
   unasked, because its pull request goes to a public repository.
8. A pass over held answers alone reports `Nothing new was applied; N answer(s) wait(s).` when nothing else
   happened; if the pass also recorded rows itself, the usual headline (`1 recorded only`) stays and the
   `Held from an earlier try` line carries the held ids.

## Not checked

* The SQL side (`inbox_apply_prepare`'s `held` key, `inbox_apply_close` reading `skip_seen`): W-80's.
  The shape sent is `skip_seen: [{ id: <number>, resolved_at: <string|null> }]`, as frozen.
* No live run. The worker image is not rebuilt here.
* The skill text was not run through a real `claude` session; only the install and image tests ran.
