# 99 — W-54 verification note (Phase 19, screens and desktop)

Worker W-54 · branch `feat/content-history-19-screens` · worktree
`bb2dash-wt-content-history-19-screens`. Owns the "W-54" row of brief 99 §Workers. Tasks:
**19, 20, 21, 22, 23, 24**. Fixtures only: no database read or write, no prod change.

All web checks run from `C:/Users/stack/projects/bb2dash-wt-content-history-19-screens/web`, all
desktop checks from `.../desktop`. `npm ci` exited 0 in both.

## Starting counts (branch at 92b3af9, before any change)

| Suite | Command | Result |
|---|---|---|
| web | `npx vitest run` | `Tests  2221 passed (2221)` |
| desktop | `npx vitest run` | `Tests  695 passed (695)` |

---

## Task 19 — `web/src/lib/sync-run-state.ts` (R-41)

Pure: `runStateWord`, types `StreamState` / `StreamStateName` / `RunStateWord`,
`normalizeStreams`, `neverSyncedLine`. `runStateWord` takes the row's `{status, interrupted}`
rather than the bare status, because "interrupted" is a `failed` run with 137's `interrupted`
set. `interrupted` on any other status changes nothing. `normalizeStreams` drops an element that
is not an object, names no stream, or carries a state outside `fresh | stale | never`; it never
throws, and a column that is absent gives `[]`.

Check: `npx vitest run test/sync-run-state.test.ts`

* RED (test written first, module absent):
  `Error: Failed to resolve import "@/lib/sync-run-state" from "test/sync-run-state.test.ts". Does the file exist?`
  → `Test Files  1 failed (1)` · `Tests  no tests`
* GREEN: `Test Files  1 passed (1)` · `Tests  22 passed (22)`
  (23 after task 20 added the "no list at all" case below)

---

## Task 20 — `freshnessLine` uses it; `SyncStatus` carries `notes`, `interrupted`, `streams`

`queries.sync.ts`: one import, three fields on `SyncStatus`, three lines in `normalizeSyncStatus`,
and `freshnessLine` now takes its run-state word from `runStateWord` and appends
`neverSyncedLine(status.streams)` only when `stalenessLine` returns null. `stalenessLine`'s body is
untouched. A row without the three columns normalises to `notes: null`, `interrupted: false`,
`streams: []`, and the line is the string `main` returns.

`neverSyncedLine` also accepts `null` / `undefined`: the query cache is persisted to localStorage
(`query-provider.tsx`), so a `SyncStatus` object written by the previous build can be restored
with no `streams` key at all. It reads as "none", and nothing throws.

Check (d): `git diff --numstat main -- web/src/lib/queries.sync.ts` → `14	6	web/src/lib/queries.sync.ts`
(first field 14, limit 15).

Check (a): `npx vitest run test/queries.sync.test.ts test/NeedsAttention.test.tsx test/Inbox.test.tsx`

* RED (tests added, `queries.sync.ts` still as on `main`), `npx vitest run test/queries.sync.test.ts`:
  `Tests  7 failed | 28 passed (35)`. The seven are the new-behaviour cases, for example
  `expected 'last synced 4 hrs ago' to be 'last synced 4 hrs ago · history never…'` and
  `expected 'last synced 4 hrs ago · last run fail…' to be 'last synced 4 hrs ago · last sync int…'`.
  The three "same string as `main`" cases (no `streams` key; each status with the new columns
  absent; a stale stage beside a never-synced stream) **passed against `main`'s code**, which is
  what shows the strings are `main`'s.
* GREEN: `Test Files  3 passed (3)` · `Tests  119 passed (119)`

The three fixtures the brief names, as asserted:

| Fixture | Line |
|---|---|
| every `freshness` row fresh, `streams` holding `history` `never` | `last synced 4 hrs ago · history never synced` |
| a `freshness` row stale 2 days, `streams` holding `history` `never` | ends `· files stale 2 days`, contains no `never synced` |
| no `streams` key | `last synced 4 hrs ago · files stale 2 days` (the string `main` returns) |

Also asserted: a reaped run reads `last synced 4 hrs ago · last sync interrupted` and never
`last run failed`; a running run with `history` `never` reads `sync running · history never synced`.
