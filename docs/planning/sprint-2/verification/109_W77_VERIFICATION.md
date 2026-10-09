# 109 W-77 verification: the Workspace runner (tasks 28 to 35)

Worker W-77, branch `feat/workspace-24-runner`, worktree `bb2dash-wt-24-runner`. Built to the frozen
fixtures in `workspace/test/fixtures/contract24/` with fakes: no live `claude` call, no database call,
no docker, no probe. The fixture folder and `workspace/test/probe24-fixtures.test.ts` are untouched
and green.

## How the red and green runs were taken

Tasks 28 to 31 and the source of 32 to 35 were drafted in one sitting, source first for the
design-heavy parts. Each red run below was therefore taken afterwards, by running the finished test
files against the tree **without** the new source: either with the new modules moved aside (task 29,
30, 31) or against a `git archive` of the commit before the change with the new tests copied over it
(tasks 32, 33, 34). Each green run is the suite after the change. The red lines are copied as printed.

## Per task

### 28. `depth.ts`
- Red: `Test Files  1 failed (1) / Tests  no tests` (the module is not there).
- Green: `npx vitest run test/depth.test.ts test/router.test.ts` -> `Test Files  2 passed (2) / Tests  71 passed (71)`. `router.ts` and `fixtures/router-cases.json` unedited.
- Commit `06509c4`.

### 29. Budget, assembly, fence (`context/*`, `lines.ts`, `turn-context.ts`, `store-types.ts`)
- Red: `FAIL test/assemble.test.ts ... Cannot find module '../src/context/assemble.js'`, `FAIL test/fence.test.ts ... Cannot find module '../src/context/fence.js'`, `Test Files 2 failed (2)`.
- Green: `Test Files 2 passed (2) / Tests 40 passed (40)`. Covers: `feed-block.txt` byte for byte; 47 work + 32 score rows with none left out; the cut order of the feed; one feed block and the same block count after a passage copies a closing line, a feed block and a label (also through a summary, a turn and a title); 300-character two-line title -> one line of 120; the floor (3,600 bytes first and last at a spare of 48,000, tested on `cutMiddle` and on the assembled prompt at the six blocks' maximum); a cut course file lists the ids left out; `[notes]` warning; remembered item dated; stopped turn shown as stopped; never opens with `/`; a property run of 40 random mixes under 131,072 bytes; `lines.txt` equals `LINES`.
- Commit `bdabfc6`.

### 30. `plan.ts`, `prompts/plan.md`
- Red: `FAIL test/plan.test.ts ... Cannot find module '../src/plan.js'`.
- Green: `Tests 26 passed (26)`: 15 output cases (12 required) incl. the recorded P-1 answer, a seventh query dropped (Deep six), course outside the scope, input without passage or attachment text, rejected output logged as length + class only.
- Commits `3aa3080`, `f3c3167` (no wall clock read in date arithmetic: `test/runner/monotonic.suite.ts` forbids `new Date(`).

### 31. `retrieve.ts`
- Red: `FAIL test/retrieve.test.ts ... Cannot find module '../src/retrieve.js'`.
- Green: `Tests 19 passed (19)`: exit 1 -> `failed`; 100 stderr characters from a real child -> `stderr_chars=100` and none of the characters; search text cut to 2,000; three failures pause 5 minutes on a fake clock; 15 hits -> 14 passages; merge, floor, keyword-only last.
- Commit `faa7247`.

### 32. Argv per turn kind, gate, init check, MCP config, stderr class
- Red (new tests against the pre-change source): `Test Files  5 failed (5) / Tests  192 failed | 321 passed (513)` on `claude-argv`, `mcp-config`, `tool-gate`, `stream-json`, `runner`.
- Green: `Test Files 15 passed (15) / Tests 921 passed (921)` at that commit; `cd apply && npm ci && npm run typecheck && npx vitest run` -> typecheck clean, `Test Files 2 passed (2) / Tests 123 passed (123)`, re-run at the final commit; nothing under `apply/` edited, no lock file committed.
- Checks: no argv holds `--resume` and `mcp__rag__` is in no file of `src/` (tested by reading `src/`); `--no-session-persistence` in every argv; the planning argv has no `--allowedTools`; `MAX_THINKING_TOKENS=0` added by `turnEnv` on plan/summary/rolling, `childEnv` unchanged (signature pinned); a stderr line with 100 characters of the prompt logs `stderr_chars=N class=other`; `runGate` still exits 2 for an unknown tool and non-JSON, 0 for a listed tool.
- Commit `80a905e` (this commit also carries task 35 and the source of task 33, which the new `TurnInput` forced together).

### 33. `turn.ts` in stages, `db.ts`, `sources.ts`, fixed lines
- Red (against `f3c3167`): `turn.test.ts: 25 failed of 26; sources.test.ts: Cannot find module '../src/sources.js'`.
- Green: `Test Files 17 passed (17) / Tests 956 passed (956)` at commit `5f3888f`. Covers: Stop during planning -> `cancelled`, one process, no retrieval, no put; opened unit -> origin `tool` row from the call input in a second put with null facts; the three cases of nothing matched (`empty` for a planner question, `attached_only`, short follow-up searched with the previous question -> `found`); `empty` first on plain, not on rich; search failed line; attachment lines; finish with null session id; a failing put or feed keeps the answer; the MCP file written before and removed after, also when the turn throws.

### 34. Jobs
- Red: `FAIL test/jobs.test.ts ... Cannot find module '../src/jobs.js'`.
- Green: `Tests 25 passed (25)`; a claim mid-job aborts the job within one poll interval, `released`, then the question is answered; only `rolling` asked unless `WORKSPACE_MEMORY_JOBS=on`; both prompt files hold the forbidding sentence; the loop never asks for a claim or a job while a turn is in flight.
- Commit `dff84c6`.

### 35. `system.md`, the two format rules, their test
- Red (old `system.md`, new files removed): `Test Files  1 failed (1) / Tests  no tests`.
- Green: `Tests 28 passed (28)`. Notes-store rules and the decision-note line are gone; the remembered-item line is in; both format rules hold the citing line; `format-rich.md` forbids images and links (`format-plain.md` too).

## Final gates (at `d656ce4`)
- `npm run typecheck`: clean.
- `npx vitest run` (whole package, PM's fixture test included): `Test Files 18 passed (18) / Tests 982 passed (982)`.
- `npx vitest run --coverage`: all files 96.85 % lines; `src/` 97.39 % lines (80 % required).
- `cd apply && npm run typecheck && npx vitest run`: exit 0 (123 tests).

## Defaults taken (nobody answers mid-run)
1. **A remembered item's date.** The frozen `search-row.json` has no date, but the brief wants `[R<id>]` dated. `Hit` has an optional `writtenAt` (read from `written_at`); without it the block says "written: the date is not recorded". PM: add `written_at` to the memory row of `workspace_search` and the batch answer, or rule otherwise.
2. **Plan check.** A course outside the scope, or not his, becomes `null` (the query stays and searches the scope); a query with no valid kind, or no text, is dropped; a window outside 180 days is clamped, a bad date is the default.
3. **Retrieval states.** `workspace_turns` has no `refused`/`paused`: a search that was refused by every query, paused by the breaker, or failed is stored `failed`; a refusal counts no failure toward the pause.
4. **Budgets.** The answering turn gets the budget minus 0.05 only when a planning turn was eligible (`mid`/`high`, budget at least 0.10); otherwise the whole budget. The MCP limits are 3 searches when `plan_state` is not `skipped`, else 4; 10 reads.
5. **The fixed lines** (`search_failed`, `empty`, the attachment sentences) open the answer on format `plain` only; `rich` gets none. `no_text` and any unreadable file use the "could not be read" sentence; when the search failed, attachments are reported `failed`.
6. **Stored runner steps** in `tool_calls`: `search` (first plan query cut to 200 characters, scope = the course display id) and `planner_feed`, ahead of the model's calls (the first 20 in all are kept).
7. **Tool-origin sources**: only a `get_material_text` call that answered; a unit already a passage of the prompt is not repeated.
8. **Framing** holds the marker, the date, the course list (900 bytes at most) and the scope as plain lines; the question follows an unfenced `Question:` line.
9. **Recent turns**: header `role, date (stopped: cancelled)` / `(failed: <code>)`; an empty stopped or failed answer shows `(no text)`; an empty answer with no code is skipped.
10. **Attachments** are asked of the batch child at 96,000 characters each and cut again to their share at assembly.
11. **Context read** uses the begin retry window; an unreadable context closes the request `failed / cli_error` before begin.
12. **Idle jobs**: 90 s limit; a summary that finished is stored even if a claim arrived at that instant; after a job the loop asks for a claim again at once.
13. **"format plain holds no bracket label"** (task 29) is read as: the runner's own lines and the plain format rule carry none; the passage labels stay in the prompt (the sources need them).
14. **stderr classes** (`budget`, `sign_in`, `usage_limit`, `other`) use patterns written without a recorded stderr for any of them; the probes recorded none.

## Files beyond the brief's list (all under `workspace/`)
`src/store-types.ts`, `src/prepare.ts`, `src/prompts.ts`, `src/context/feed.ts`, `src/context/turns.ts`, `src/context/attachments.ts`, `test/helpers/context24.ts`, plus tests (`depth`, `fence`, `assemble`, `plan`, `retrieve`, `turn`, `sources`, `jobs`). `src/replay.ts` and `test/runner/replay.suite.ts` are deleted. `PATHS.mcpConfig`, `HISTORY_REPLAY` and `REPLAY_MAX_BYTES` are removed; `PATHS.mcpNone`, `PATHS.batchEntry`, `PATHS.promptsDir` and `MATERIALS_ENV` are new. `checkInit(init, version, kind)` and `createTurnStream(version, kind)` take the kind as a last, optional argument; `TurnSummary` gains `assistantText`.

## Test files renamed
None. Rewritten in place: `claude-argv`, `mcp-config`, `tool-gate`, `system-prompt`, `config` (constants), `stream-json` and its gate suite, and the runner suites. `test/runner/replay.suite.ts` is deleted with the code it tested.

## Not done, or for the PM at integration
- No test could call W-76's functions or W-78's `batch.js`: the SQL names, argument order and the `facts.attachments[].state` vocabulary (`read`, `cut`, `not_ready`, `failed`, `missing`, `no_text`) are taken from `contract24/README.md` and the samples. Check them when 196 and `batch.ts` are on the phase branch.
- The image (W-79): the Dockerfile must copy the new `prompts/*.md`; `/run/workspace/mcp.json` is no longer written (the runner writes `mcp-none.json` at start and `mcp-<id>.json` per answer, 0600, so `/run/workspace` must stay writable); the runner starts `node /app/mcp-materials/dist/batch.js` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_FILE` and `PATH` only.
- `startTurn` is still one long closure (about 190 lines, as before); `run()` is about 55. I split the stages out into `prepare.ts` but did not split the closure further.
- `WORKSPACE_MEMORY_JOBS` is read in `main()` only; the compose default `off` is W-79's.
