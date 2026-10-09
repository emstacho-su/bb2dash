# 110 W-82: the decisions exporter and its schedule (tasks 10 and 11)

Worker W-82, branch `fix/phase23-followups-exports`, worktree `bb2dash-wt-23f-exports`. Every test
runs on stand-ins. Nothing touched prod, no real decision was filed, no scheduled task was
registered, started or changed, `docker` was not run, and no secrets folder or `.env` was opened.

## Task 10: the exporter

Files: `scripts/inbox-decisions-export.mjs`, `scripts/inbox-decisions-export.test.mjs`,
`scripts/inbox-decisions-pr.mjs` (header comment, and `--notes-only` refused there),
`scripts/inbox-decisions-pr.test.mjs` (one assertion). `scripts/lib/inbox-decision-render.mjs` is
unchanged: the unlogged pass needed nothing from it.

**Red** (commit 122bc0c, tests only):

```
SyntaxError: The requested module './inbox-decisions-export.mjs' does not provide an export named 'SKIP_WHY'
ℹ tests 1   ℹ pass 0   ℹ fail 1
```

**Green** (commit 531b222):

```
node --test scripts/inbox-decisions-export.test.mjs scripts/inbox-decisions-pr.test.mjs scripts/inbox-decision-render.test.mjs
ℹ tests 41   ℹ pass 41   ℹ fail 0
```

Proof cases, by test name (all in `scripts/inbox-decisions-export.test.mjs`):

| brief's proof | test |
|---|---|
| `--notes-only` writes under the notes folder only, starts the resolver and the ingest and no other command, marks without a log path | `--notes-only writes the note under the notes folder only, runs the ingest alone, and marks with the note path only` (the files under the temp root are the vault's notes folder and nothing else; no log folder exists; the mark has no `log_path` key) and `main --notes-only starts the resolver and the ingest and no other command, reads no unlogged row, and prints one result line` (asserts the FULL list of commands: the harness resolver, then `uv run ingest`) |
| `--notes-only` reads no unlogged row | `--notes-only does not read the unlogged rows and writes no entry for them` |
| a later default run writes the entry and stamps the log once | `a later default run writes the entry for a notes-only row and stamps the log once` (also the crash-between case and a refused stamp) and `the default run files unfiled rows in full first, then logs the unlogged ones` |
| a test question is skipped in both modes, no file written | `a test question is marked skipped in --notes-only mode: ...` and `... in the default mode: ...`; `a test question alone writes no file at all, and a skip the database refuses is counted as not filed` |
| an `accept/` ref with a course is filed like any other | `a row with an accept/ ref and a course is filed like any other` (also an `accept/` ref with another entity); `a test question is told by all three parts` is the table of the predicate |
| `--notes-only` with `--log-dir` exits 2 | `arguments: the five options, ...` (parse refuses both orders) and `main --notes-only with --log-dir exits 2 and files nothing` |
| the four database functions and their argument names | `the rpc sends the four new functions their argument names, as the service role` |

### Exact argument names sent (hold W-80's migration 187 to these)

All are PostgREST `POST /rest/v1/rpc/<fn>` with the JSON body below, as the service role.

| function | body |
|---|---|
| `inbox_decision_filed(bigint, jsonb)` | `{"p_id": <bigint>, "p_filed": {"note_path": "<text>", "ingested": <bool>}}` in `--notes-only` (NO `log_path` key at all); `{"p_id", "p_filed": {"note_path", "log_path", "ingested"}}` in the default mode. The existing argument names `p_id`, `p_filed` are unchanged from 182. `ingested` stays an extra key inside the object, as today |
| `inbox_decisions_unlogged(integer)` | `{"p_limit": <int>}` (as `inbox_decisions_unfiled`); must return the same columns |
| `inbox_decision_logged(bigint, text)` | `{"p_id": <bigint>, "p_log_path": "<text>"}`, the path as `docs/inbox-decisions/<date>.md` |
| `inbox_decision_skipped(bigint, text)` | `{"p_id": <bigint>, "p_why": "acceptance run test question"}` (the constant `SKIP_WHY`; a fixed sentence, no question text) |

Return values the code relies on: `inbox_decision_filed`, `inbox_decision_logged` and
`inbox_decision_skipped` return a JSON boolean (`true` when the row was changed, `false` when it was
not, as 182's `filed` does); the exporter counts `false` as "not filed". `inbox_decisions_unlogged`
returns a JSON array of rows.

### What changed in the exporter

* `--notes-only`: for each unfiled row the note, one best-effort ingest, then the mark with the note
  path alone. It never reads the unlogged list, writes no day file, and `readConfig` gives it no log
  folder. Combined with `--log-dir` it is `ExportError` (exit 2), in either argument order.
* Default mode: unfiled rows in full, then `inbox_decisions_unlogged` rows: the entry
  (`appendLogEntry` skips an item the file already holds), then `inbox_decision_logged`.
* Both modes: a row with ref starting `accept/`, entity `agent_request` and a null course goes to
  `inbox_decision_skipped` before anything is written; no note, no entry, not ingested.
* `--dry-run` also reads the unlogged list (default mode) and prints `would skip` / `would log`.
* `exportDecisions` now returns `{ filed, skipped, logged, failed }`.
* `main` prints one last line, `inbox-decisions-result {"exit_code":N,"filed":N,"skipped":N,"not_filed":N}`
  (also on exit 1 and 2, with zero counts when the run stopped early). A new `runExport` returns the
  counts as an object; `main` is the old function over it and still returns the exit code, so
  `inbox-decisions-pr.mjs` is unaffected.
* `inbox-decisions-pr.mjs` now refuses `--notes-only` (it writes the day files; the schedule's mode
  does not). Its header says no scheduled task calls it.
* The key is read from its file and printed nowhere; the existing redaction in `createRpc` stands, and
  `main --notes-only starts the resolver...` asserts no printed line holds the key.

## Task 11: the runner and the registration script

Files: `scripts/exports-run.mjs`, `scripts/exports-run.test.mjs`, `scripts/register-exports.ps1`,
and the `test` line of `scripts/package.json` (`exports-run.test.mjs` added after
`inbox-decisions-pr.test.mjs`, nothing else in the file).

**Red** (commit 65b9acd, tests only):

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\scripts\exports-run.mjs' imported from ...\scripts\exports-run.test.mjs
ℹ tests 1   ℹ pass 0
```

**Green** (commit 02537a4):

```
node --test scripts/exports-run.test.mjs
ℹ tests 14   ℹ pass 14   ℹ fail 0
```

Proof cases (`scripts/exports-run.test.mjs`):

* fixed keys on success: `a clean run: exit 0, and the state file holds exactly the fixed keys`
* on a failure: `a failed run: the exporter exits 1 with rows not filed; ...`
* on a thrown error: `a thrown error: exit 1, reason error, the state is still written, and no message is stored in it`
* on exit 2: `a checkout that is not on main exits 2 ...` (a branch, a `.git` that is a file, no `.git`),
  `missing or odd arguments exit 2 with reason config ...`, `an exporter that exits 2 ...`
* the guard: `the guard reads .git/HEAD as a file and wants ref: refs/heads/main; a .git file, a branch, a hash and no .git all fail`
* the command list: `the only command the runner starts is the exporter, with --notes-only and the two folders in its environment`
  (asserts `[node, scripts/inbox-decisions-export.mjs, --notes-only]` is the whole list; also that the
  source holds one `spawnSync(`, one `node:child_process` import and no `'git'`, `'gh'`, `'docker'` or `'uv'` literal)
* no key in state or log, no path in the state: `the key never reaches the state file or the log, ...`
* log rolls, state replaced whole, no temp file left: `the state folder is created, the state is replaced whole each run, and the log rolls`
* unwritable state folder: `a state folder that cannot be written is exit 1 with one line, never a throw`

### State file, as written (`~/.bb2dash-exports/state.json`, keys in this order)

```json
{
  "schema": 1,
  "started_at": "2026-10-09T12:00:00.000Z",
  "ended_at": "2026-10-09T12:00:01.000Z",
  "exit_code": 0,
  "reason": null,
  "exporters": { "inbox-decisions": { "exit_code": 0, "filed": 16, "skipped": 1, "not_filed": 0 } }
}
```

`reason` is `null`, `not_main`, `config` or `error`. The log is `~/.bb2dash-exports/exports.log`; once it
passes 256 KiB it is moved to `exports.log.1` (one rolled copy). The state folder is injectable for
tests (`main(argv, { stateDir })`); the command line has no flag for it, so a real run always writes
the home folder.

### Choice: the counts come from a final line, not an in-process call

The runner SPAWNS the exporter (`node scripts/inbox-decisions-export.mjs --notes-only`) and reads its
last output line, `inbox-decisions-result {json}`. Calling the exporter's function in-process would
have started no command from the runner, but the exporter itself starts the resolver and the ingest,
so "the only command started is the exporter" would be a weaker statement. With a spawn it is
literally true and the test's list has one entry.

### Mapping of outcomes (defaults I took, see below)

| exporter | runner exit | reason |
|---|---|---|
| exit 0 with a result line | 0 | null |
| exit 1 | 1 | error |
| exit 2 | 2 | config |
| killed, timed out, other code, or exit 0 with no readable result line | 1 | error |
| arguments missing or odd | 2 | config |
| checkout not on main | 2 | not_main |
| the runner itself threw | 1 | error |

When the exporter did not run (`not_main`, argument error, thrown error) its entry in `exporters` is
`exit_code` equal to the run's own exit code (2, 2, 1) and zero counts.

### Registration script

`scripts/register-exports.ps1 -SecretsDir <folder> -HarnessDir <folder>`. NOT run. Parse check, with
the .NET parser, no execution:

```
powershell -NoProfile -Command ... [System.Management.Automation.Language.Parser]::ParseFile(...)
parse errors: 0
```

It checks both folders exist, that the harness holds `hooks/resolve-config.mjs`, that the checkout it
sits in holds `scripts/exports-run.mjs`, and that `node.exe` is on PATH, all before any
`Register-ScheduledTask`; each failure prints one message and `exit 2`. It opens no file in the
secrets folder (it tests the folder with `Test-Path` only) and does not read `.env`. The action is
`<node.exe full path> scripts/exports-run.mjs --secrets-dir "<..>" --harness-dir "<..>"`, working
directory the checkout. Two triggers (logon + `PT5M`; once, repeating every 6 hours with no end),
settings: hidden, priority 7, 15 minute limit, start when available, allowed on battery and kept
running on battery, `IgnoreNew` for a second instance. The registration itself is untested: the
brief says the PM tries it once with a missing folder at the cut-over.

## Defaults I took

1. Counts via a spawned exporter and a final result line (above).
2. `exit 1` from the exporter (rows not filed) gives `reason: "error"`; the brief's reasons have no
   word for "a row was not filed", and the doctor also reads `not_filed`.
3. `exporters.inbox-decisions.exit_code` when the exporter did not run is the run's own exit code,
   with zero counts (a number, never null, so a reader needs no null case).
4. The skip reason stored is the fixed sentence `acceptance run test question`.
5. In the default mode's unlogged pass, a row that matches the test-question shape gets no entry and is
   only logged as `not logged item N`; it cannot be skipped (it is already filed) and is not counted
   as a failure. The database never lists one in practice, because notes-only skips it before filing.
6. `--dry-run` reads `inbox_decisions_unlogged` in the default mode so it can list what it would log.
7. `inbox-decisions-pr.mjs` refuses `--notes-only` (not asked for; the combination would exit 2 from
   the exporter anyway once the script adds `--log-dir`).
8. The registration script does not take a repo path: the checkout is the folder the script sits in.
   It has no `-Unregister` switch (not asked).

## Not checked / risks

* The registration script was parsed only. Not exercised: the missing-folder refusal, the
  registration, the second trigger's behaviour on Windows PowerShell 5.1 (a `-Once` trigger with a
  repetition interval and no duration is indefinite on Windows 10 and later; not run here).
* **A console window may flash.** The action runs `node.exe` directly, as the brief says; the task's
  "Hidden" setting hides it from the Task Scheduler UI, not necessarily a console window in an
  interactive session. If it flashes every six hours, wrap the action in
  `powershell.exe -WindowStyle Hidden -Command` (as `register-logon-task.ps1` does) and keep
  `exit $LASTEXITCODE`. I left it as written.
* Migration 187's four functions are not on prod and I did not read W-80's file (not pushed when I
  looked); the argument names above are my reading of 182's naming. The PM should hold 187 to them.
* The real `uv run ingest` on this laptop is untested (the brief lists it as not checked); a failed
  ingest is `ingested: false` and the row is still filed.
* One smoke run of the real spawn path, in a temp checkout with `.git/HEAD` on main, a temp state
  folder and two folders that do not exist: the real exporter started, stopped at the resolver with
  "nothing was filed", and the runner wrote `exit_code 2, reason config` to the temp state. No key
  was read and no network call was made.
* `scripts/package.json`'s test line is one line; the Phase 22 worker adds a name to the same line,
  so the second merge keeps both names.

## Round 2 (the PM's four fixes after the code review)

Step 0: `git merge origin/fix/phase23-followups` (clean; no file of the other workers touched). The
brief's "Round 2" was read.

**Fix 4 (R5) and fix 3 (applied_at): red** (commit bda77e1, tests only):

```
node --test scripts/inbox-decisions-export.test.mjs
ℹ tests 30   ℹ pass 27   ℹ fail 3
✖ R5: a test-shaped row whose skip the database refuses is filed like any other in --notes-only: ...
✖ R5: in the default mode a refused skip gets the note, the day-file entry and the full mark
✖ an existing note that differs only in its applied_at line is written again and the row is marked
```

**Green** (commit 2d70773): `node --test` on the runner, exporter, pr and render tests:
`ℹ tests 60   ℹ pass 60   ℹ fail 0` (exporter file alone: 30 pass).

| fix | test |
|---|---|
| 4: a refused skip is filed, note and mark, in `--notes-only`; not skipped, not failed | `R5: a test-shaped row whose skip the database refuses is filed like any other in --notes-only: ...` |
| 4: in the default mode the entry and the full mark too | `R5: in the default mode a refused skip gets the note, the day-file entry and the full mark` |
| 4: an accepted skip still writes no file | `R5: a test-shaped row whose skip is accepted still writes no file` (and the two earlier skip tests) |
| 3: only `applied_at` differs, so the note is rewritten and the row marked | `an existing note that differs only in its applied_at line is written again and the row is marked` |
| 3: any other difference is refused, nothing overwritten | `a note that differs anywhere but applied_at is still refused, and nothing is overwritten` (plus the existing `never overwrites a different note ...`) |

The earlier test that expected a refused skip to be a failure was changed: a skip that THROWS is still
`not filed` (the exporter cannot tell whether the database kept it), a skip that returns false files the
row. The `isTestQuestion` comment now says the three fields narrow and do not prove origin; the
database refusing to skip a decision with a logged write is what protects a real one.

**Fix 2 (immutability)**: `skipTestQuestions`, `fileRows` and `logRows` each build and return their
own result object (`{skipped, failed, refused}`, `{filed, failed}`, `{logged, failed}`);
`exportDecisions` merges them into a new `{filed, skipped, logged, failed}`. No behaviour change, so no
red run: the existing tests are the proof and stayed green (same commit 2d70773).

**Fix 1 (no console window)**: `scripts/register-exports.ps1` (commit after 2d70773). The action is now
`powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "& 'node.exe' 'scripts/exports-run.mjs' '--secrets-dir' ... ; exit $LASTEXITCODE"`, working
directory the checkout. Each value (node path, runner, both folders) is a single-quoted PowerShell
string with `'` doubled. A double quote or a backtick in either folder (or in node's path) is refused
before anything is registered, because the whole command sits inside double quotes. The header
comment and the printed lines follow. PowerShell parse check (parser only, the script was NOT run):
`parse errors: 0`.

The quoting and the exit code were checked without touching the script or any task: a throwaway
PowerShell snippet built the same command string (same helper, same format line) for a folder named
`C:\a b\it's`, ran it in a hidden `powershell.exe -Command` against a stand-in script that printed its
arguments and exited 7. The arguments arrived intact and the process exit code was 7.

Defaults: the same-named `-WindowStyle Hidden` still flashes a console for a moment while PowerShell
starts, as the logon task does; a refused skip that comes with a thrown error stays "not filed"; the
`applied_at` rule compares the whole text with every line starting `applied_at: ` blanked (the note
has one such line, in its front matter).
