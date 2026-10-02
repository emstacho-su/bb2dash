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
