# 110 W-84: the acceptance pack for Phase 23 (task 15)

Worker W-84, Sonnet 5.5, branch `fix/phase23-followups-accept`, worktree `bb2dash-wt-23f-accept`. Built
test first, red then green, pushed per step. I ran no pack, no sign-in, no browser against any site (one
local page of static HTML, see "How the page's controls were checked"), no `docker`, no Supabase tool, no
database connection, no scheduled task, and opened no `.env`, `.env.local` or secrets folder. The
`bb2dash-stack` checkout was read only; I copied its `scripts/lib` and `doctor/` into the scratchpad to
run its manifest validator (below), and ran nothing inside it.

## Commits

| commit | what |
|---|---|
| `814e272` | red: the kit loads pack 23 and reads a view's columns; `scripts/accept-proofs-db23.test.mjs` with the twelve proof cases against an empty `acceptance/23/proofs.json` |
| `3ddbb40` | green: the twelve proofs; `accept-proofs-db23.test.mjs` added to the `test` line of `scripts/package.json` |
| `ccc46ef` | red: `acceptance/23/manifest.json` and the five action names in `manifest.schema.json`, with no playbook and no browser tests yet |
| `5d295c8` | green: `web/e2e/accept23.spec.ts`, `acceptance/23/playbook.md`, the kit reads the migrations once |
| (the last commit) | two more cases that killed two surviving mutations, and this file |

## The red runs, quoted

Proofs (commit `814e272`, before `proofs.json` held anything but `{}`):

    $ node --test scripts/accept-proofs-db23.test.mjs
    ✔ every table and column these cases are made of is in the migrations, and the view the proofs read has the columns they name
    ✖ apply-quiet: ...        AssertionError: accept-proofs: acceptance/23/proofs.json holds no proof named "apply-quiet"
    ✖ ... (the other eleven proof cases, and "pack 23 holds the twelve proofs, by name")
    ℹ tests 14   ℹ pass 1   ℹ fail 13

Pack (commit `ccc46ef`, manifest and schema only):

    $ node --test acceptance/acceptance.test.mjs
    ✖ pack 23: the manifest, the browser tests, the proofs and the playbook agree
      Error: pack 23: acceptance/23/playbook.md is missing
    ℹ tests 41   ℹ pass 40   ℹ fail 1

## The green runs, quoted (final tree)

    $ node --test acceptance/acceptance.test.mjs
    ✔ pack 21: the manifest, the browser tests, the proofs and the playbook agree
    ✔ pack 23: the manifest, the browser tests, the proofs and the playbook agree
    ℹ tests 41   ℹ pass 41   ℹ fail 0

    $ node --test scripts/accept-proofs.test.mjs scripts/accept-proofs-cli.test.mjs scripts/accept-proofs-db.test.mjs
    ℹ tests 72   ℹ pass 72   ℹ fail 0          (pack 21's three files, none of them edited)

    $ node --test scripts/accept-proofs.test.mjs scripts/accept-proofs-cli.test.mjs scripts/accept-proofs-db.test.mjs scripts/accept-proofs-db23.test.mjs
    ℹ tests 86   ℹ pass 86   ℹ fail 0          (72 + 14: twelve proof cases and two structural ones)

    $ cd web && npx playwright test -c e2e/accept.config.ts --list
      accept.lib.ts:200:10 › 1 raise questions     › 2 press sync     › 3 watch apply     › 4 archived
                           › 6 note and apply      › 7a offline press › 7b taken after
    Total: 18 tests in 1 file                      (Phase 21's eleven, and these seven)

    $ cd web && npm run typecheck                  exit 0
    $ cd web && npx eslint e2e/accept23.spec.ts --max-warnings 0    exit 0

The README gives `node --test acceptance/acceptance.test.mjs` as the check of every pack; `pack-check.mjs`
has no command line of its own. A direct call of its `packProblems()` for each pack under `acceptance/`
printed `pack 21 problems: 0` and `pack 23 problems: 0`.

**bb2dash-stack's own validator**, run on a scratchpad copy of `scripts/lib` and `doctor/` with the five
new action names stubbed in (W-83's branch was not available to read): `validateManifest` of pack 21 and
pack 23 both returned `ok`. So the wrapper's reader accepts the stages, the step ids, the `carry:`
references and the proofs' parameter types of pack 23.

**Mutation checks.** I broke `proofs.json` seven ways and ran the cases each time. Five were killed at once
(the second question's archiver, the ordering against the sync's request, the 75 second wait, the sync
container's name, the first question). Two survived, and I added a case for each: the second question
archived by another request (`recorded-after-sync`), and a `sync-login-required` ref on an item that names
a field (`apply-quiet`); both mutations are then killed. Two more are equivalent mutants and need no case:
dropping `login.n = 0` from `apply-quiet`'s `ok` (the `blocked` column outranks `ok`), and dropping
`claimed_by is null` from `request-waiting` (the state `queued` already decides it).

## The seven test titles

| step | title | shots (evidence beside `<step>.json`) | stage |
|---|---|---|---|
| 1 | `1 raise questions` | `raised`, `answered` | walk |
| 2 | `2 press sync` | `pressed` | walk |
| 3 | `3 watch apply` | `watching`, `done` | walk |
| 4 | `4 archived` | `answered`, `archived` | walk |
| 6 | `6 note and apply` | `saved`, `done` | walk |
| 7a | `7a offline press` | `queued`, `waiting`, `command` | offline |
| 7b | `7b taken after` | `archived` | back |

## The twelve proofs, and what each reads

All are one read-only `select`, each held to the lint (`validatePack` accepts the file), and none names
`params` or `result`. "Reads" means the tables and views the statement names; the test login reads all of
them (`100`'s grants, `187`'s grants for the view and the function).

| proof | reads |
|---|---|
| `apply-quiet` | `agent_requests`, `v_inbox_queue`, `attention_items`, and `inbox_apply_held_items()` (which reads `inbox_apply_holds` and `v_inbox_queue`) |
| `apply-idle` | `agent_requests` |
| `questions-raised` | `attention_items` |
| `sync-taken` | `agent_requests`, `attention_items` (the login item) |
| `recorded-after-sync` | `agent_requests`, `v_inbox_apply_runs`, `attention_items` |
| `nothing-written` | `attention_items`, `inbox_apply_writes` |
| `applied-from-button` | `v_inbox_apply_runs`, `attention_items`, `inbox_apply_writes` |
| `request-waiting` | `v_inbox_apply_runs`, `attention_items` |
| `request-taken-after` | `v_inbox_apply_runs`, `attention_items` |
| `test-decisions-skipped` | `attention_items` |
| `decisions-filed` | `attention_items` |
| `transform-answers` | `attention_items`, `bb_files` |

The view columns the statements name are `id`, `state`, `filed_by`, `after_request`, `claimed_by`,
`created_at`, `claimed_at`, `finished_at`, `claude_started` and `error_code`, and `detail` also carries
`archived_count` in one proof. The cases run the statements against the real text of `v_inbox_apply_runs`
(187), `v_inbox_queue` (090) and `inbox_apply_held_items()` (187), cut out of the migration files and run in
PGlite; a statement that named a column the view does not have would fail there. So the proofs follow the
view if task 4's review changes the migration, and the test says so by failing if a mark moves.

Defaults and shapes of the proofs worth reading:

* Every proof that takes an item or a request from the sandbox also takes `since` (`carry:run.started_at`),
  with the 60 seconds of slack pack 21 uses, and holds the item to the shape of a test question (entity
  `agent_request`, no course, an `accept/` ref, raised in this run), so a sandbox cannot point a proof at a
  row of a course.
* The word `note` is refused anywhere in a statement by the lint (it reads the raw text, literals too).
  `questions-raised` therefore writes the third label as `'no' || 'te'` and says so in its `expect`; no
  other proof names the label. The columns `resolution_note`, `decision_filed` and the json key
  `'note_path'` pass because the lint reads whole words.
* `recorded-after-sync`, `applied-from-button` and `request-taken-after` are `blocked` (not failed) when the
  checks did not pass and the request's `error_code` is `daily_cap` or `usage_limit`. `request-taken-after`
  is blocked this way too; the brief names the first two only, and the worker can cap a templated run as
  well (`apply/src/report.ts:125`), so I added it (default 5 below).
* `sync-taken` is `blocked` when the sync request closed `failed` and a `sync-login-required` item was
  raised in this run. It passes on any claimed sync, even one that failed for another reason; the next
  step's `recorded-after-sync` is what requires `done`.
* `applied-from-button` takes a fourth parameter, `after` (`carry:2.request_id`): the button's request must
  have a higher id than the sync's, so one request cannot stand for both steps. It identifies the request by
  the id the page's own insert returned, and then reads the row itself.
* `transform-answers` returns exactly five counts (`session_answers_with_pick_on_file`,
  `session_answers_unstamped`, `session_answers_stamped_since_start`, `supersede_items_looked_at`,
  `supersede_reasked`) and passes on zero rows. It fails when a stamp is missing or a re-asked question is
  found. The unstamped test is 188's own guard block, reimplemented as a read.
* `decisions-filed` names item 3782 in its text, as the brief does.

### What I found about `sync-login-required` (the brief asked me to read the function first)

`db/migrations/091_sync_runner_role.sql` lines 258 to 283: `sync_login_required()` calls
`raise_attention(null, 'stack_must_confirm', null, 'agent_request', 'sync-login-required', ..., 'Blackboard
login needed ...')` and returns the open item's id. It is the one body for two raisers: `sync_close` when a
report says `error = login_required` (line 341 in 091, line 121 in 093) and the login watch. An item that is
already open is updated in place by `raise_attention` (the open-only dedupe index), not duplicated. The
item closes itself in `sync_login_ok()` (lines 395 to 421): state `archived`, `archived_by sync-runner`,
decision `{closed_itself, rule: 'login check passed', ...}`, for kind `stack_must_confirm`, no course, that
ref, state `open`. No later migration re-creates either function (093, 095, 180, 187 and 188 only call the
first or list it among the fourteen `sync_runner` functions). So an **open** item with that ref and no
`field` means the login is dead or the check has not run since; `apply-quiet` counts exactly that. Two
consequences: a login item left open by a past failure blocks the run until the next successful login check
archives it (blocked, not red, which is the brief's rule); and `sync-taken` can tell a dead login from the
sync's own `result` only through this item, because the proofs may not name `result`: it asks for one raised
no earlier than 60 seconds before the run began.

## What I found about `acceptStep()`

`web/e2e/accept.lib.ts` lines 197 to 218: `acceptStep()` calls `test.setTimeout(ACCEPT_TEST_TIMEOUT_MS)`
(9.75 minutes) before it calls the body. It takes no limit as an argument, but the body runs inside the
test, and Playwright lets a test call `test.setTimeout()` again in its body, which replaces the limit. So
`accept23.spec.ts` sets its own limits in the three tests that need them, with no edit to the shared file:
step 3 `test.setTimeout(9.75 min)` for its nine minute watch, step 6 `test.setTimeout(15 min)` for a watch of
up to fourteen, step 7a `test.setTimeout(5 min)` for the 75 second grace and the second press. The shared
config's `timeout: 90_000` is in fact overridden for every `acceptStep()` test, pack 21's included, by that
first call; it never applied. The listing shows all seven tests as skipped without `ACCEPT=1`.

## What I found about the carry of item ids

`bb2dash-stack/scripts/lib/accept-carry.mjs` lets a field cross from a step's facts file only when its name
ends in `_id`, `_ids` or `_at` and its value is a whole number or uuid (or a short list of them) or an ISO
time. A word, a count or a flag never crosses. So step 1's facts name the four items `confirm_item_id`,
`dismiss_item_id`, `note_item_id` and `offline_item_id` (whole numbers), and the manifest reads them as
`carry:1.confirm_item_id` and so on. Step 2 leaves `request_id` (the id the page's own insert returned),
steps 6 and 7a the same.

The run tag is also needed in later stages (the Archived tab holds earlier runs' test cards, and a card is
told from theirs by the tag in its source line). A tag is text, which does not cross. So the tag is made as
a number, seconds since the epoch followed by three random digits (13 digits, which matches
`^[a-z0-9]{6,24}$`), and step 1 writes it as `run_tag_id`. Later steps of the same stage read step 1's facts
file; steps 7a and 7b read `carry.json`. The tag is not a secret and appears in the playbook only as "a
number".

## Edits to shared files

| file | edit | why |
|---|---|---|
| `acceptance/manifest.schema.json` | the five names `apply.doctorRow`, `apply.stop`, `apply.startNoBuild`, `exports.doctorRow`, `exports.runNow` added to the `actionName` enum, after the Workspace names; nothing removed | the brief's list; the same names W-83 adds in bb2dash-stack (its branch was not readable here, so the names are the brief's) |
| `scripts/accept-proofs-kit.mjs` | `PACK_23` loaded beside `PACK_21` (its export unchanged); `argvForPhase(phase, name, params)` added, `argvFor` kept as it was; `clientOn()` moved here as an export so the new file need not copy it (the old file keeps its own copy, untouched); `columnsOf()` now also finds every `add column` of an `alter table` statement (it caught only the first before) and reads a view's select list from `create [or replace] view ... as select` (strings, `--` comments and brackets are read past); the migrations are read once | the brief: pack 23 beside pack 21, and `columnsOf` taught the columns of a view. The `add column` change widens what is found, so pack 21's "every column is in the migrations" test still holds (72 pass) |
| `scripts/package.json` | `accept-proofs-db23.test.mjs` added at the end of the `test` line, nothing else on the line | the brief's rule when the existing file would pass 800 lines: `accept-proofs-db.test.mjs` is 552 lines and the twelve cases with their rows are about 750 |

**Not edited, on purpose:** `acceptance/pack-check.mjs` and `acceptance/OPERATOR.md`. `pack-check.mjs`
line 47 names `web/src/lib/workspace-labels.ts` as the app's strings, but its rule also accepts a text that
stands as a whole quoted string in the phase's own browser-test file (`holdsQuoted(specText, ...)`), and
`accept23.spec.ts` declares every string the playbook quotes (`Apply answers`, `queued`, `done`,
`waiting on the worker…`, `Queued from Apply answers`, `Every answer has been applied.`, `0 answered`, the
sync labels, and so on) as a quoted constant. The pack check passes with no edit, so none was needed.
`OPERATOR.md` has Workspace wording the operator will meet: "Most steps ask the live assistant a real
question", the description of a turn's `badge` and `used`, and the `blocked` test on a `line` that begins
`Your Claude plan's limit is used up`. None of it makes a pack 23 verdict wrong, because the playbook names
each step's own facts and blocked conditions and the `blocked` rule also allows "a precondition is
missing". The one rule that matters is the ten minute limit, below.

## Defaults I took (nobody answers a running worker)

1. **Test limits** are set inside the three bodies with `test.setTimeout` (above); step 3 keeps 9.75
   minutes, which is the shared default, because a nine minute watch plus opening and recording fits it and
   the operator's Bash call cannot run longer than ten.
2. **Step 6's limit is 15 minutes, as the brief says, and that is longer than the operator's own Bash
   timeout of ten (`OPERATOR.md`: "a Bash timeout of 600000 ms. A test ends by itself within ten
   minutes").** The brief did not see this. A Claude run of the worker's own limit, 14 minutes, cannot be
   waited for in one foreground call. I built it as the brief says and wrote the consequence into the
   playbook: if the Bash tool ends the command before the test has printed its result, the verdict is
   `unsure`. A typical single-item run is far shorter, so this should be rare. The PM's choice is to leave
   it, or to let the playbook tell the operator how to wait longer, or to make step 6 resumable (a second run
   that only watches); I did not edit `OPERATOR.md` or invent a resume path. See "Points the brief could not
   be built as written".
3. **Step 3 has two ways to pass.** The operator looks at step 2's pictures before it starts step 3, and a
   container sync takes about two minutes (task 1: 43 to 125 s), so the sync and the apply request it files
   can both be over before the Inbox opens, and a page cannot show the result line of a request it never saw
   open. If the footer already reads `0 answered` when the page opens, the test checks the two cards under
   Archived, checks that nothing was pasted, records `closed_before_the_page_opened` true, and passes with no
   result line. The playbook says so, and the host's `recorded-after-sync` is what proves the request. If the
   count is above zero the test watches nine minutes as the brief says, and a watch that ends with the
   request still open is `inconclusive: the sync was still running after nine minutes`, with the playbook's
   one second run and `blocked` after that.
4. **Blocked, not red, for `daily_cap` and `usage_limit` also on step 7b's proof** (see above), and for a
   `press filed no request` in steps 6 and 7a (a request was already open): the playbook gives those verdicts.
5. **Step 0 counts every open sync or Inbox apply request, of any age.** Pack 21's `planner-fingerprint`
   lets a request older than six hours pass as "stale". For an apply request that would be wrong: the
   one-open index (183) holds an old queued or claimed `inbox_feedback` request against step 6's press, so
   an old one must block.
6. **Which steps block the others**, in the playbook: step 1 not `pass` blocks 2, 3, 4 and 6; step 2 not
   `pass` blocks 3, 4 and 6; step 3 not `pass` blocks 4 and 6. Presses on a half-built run would only spend
   a Claude run.
7. **The card is found by role and text**: `article` named by the fixed sentence, then narrowed by the
   source line that holds `accept/<tag>/<label>`. The answer box is the textbox named `Answer for item N`,
   the reason field `Why for item N`, then the buttons `Save` and `Dismiss`, the tabs by their names, the
   footer by its region `Inbox actions`. No class name and no test id.
8. **Writes the tests let through** (the shared guard aborts the rest): a PATCH of `attention_items` whose
   `id=eq.N` is one of the test's own items, and a POST of `agent_requests` whose body `kind` is the one the
   button files. A route registered after the guard is asked first and falls back to the guard for anything
   else, the pattern `allowArchive()` uses.
9. **The RPC call** uses the headers of a read the page makes as the signed-in owner (a bearer token that is
   not the public key itself): they are used for one in-page `fetch` to `rpc/inbox_accept_question`, four
   times, and are never written to a file, a fact or the log. A refusal reports only the label and the status.
10. **The reason typed in step 6** is the pack's fixed sentence ("a test question of an acceptance run,
    nothing changes, record it and archive it"); the word typed in the Answer box is `accepted`. No course
    text anywhere.
11. **The paste command** is checked in 7a as `claude "/inbox-apply <id>"` with the id of the request the
    press filed, and in 3 and 6 as absent.
12. **Twelve cases**: one `test()` per proof, each with its several rows as helper functions called from
    it, plus two structural tests (the tables, columns and the view's columns against the migrations; the
    twelve names). The count printed is 14 in the new file.
13. **The scripts test file is new**, `accept-proofs-db23.test.mjs`, as the brief allows past 800 lines. It
    uses its own rows and shares nothing with pack 21's data.

## Points the brief could not be built as written

* **Step 6 against the operator's ten minute Bash limit** (default 2 above). Built to the brief; flagged.
* **The `walk` stage's time.** The host's default limit for a sandbox stage is 40 minutes
  (`DEFAULT_STAGE_TIMEOUT_S` 2400). `walk` holds steps 1, 2, 3, 4 and 6: in the worst case (nine minutes of
  step 3, a second run of nine more, fourteen of step 6, plus the operator's own reading) the stage can pass
  it. Typical runs are about 15 minutes. If the PM wants the worst case to fit, the host's stage limit is
  the knob (`stageTimeoutS`); the pack has no field for it.
* **`pack-check.mjs` and `OPERATOR.md` were not edited** (see above). If the PM wants the Workspace-only
  sentences generalised, that is one edit to each, for the PM to order.

## Not checked

* No live run of anything: the selectors and flows were not exercised against the real Inbox. I did build
  an equivalent static page from the Inbox card, tab and footer markup (`InboxCard.tsx`, `Inbox.tsx`,
  `InboxApplyButton.tsx`) in the scratchpad and ran the role locators against it in the local Chromium
  (no network, no site): the card by its name and source line (a second run's card with the same label is
  told apart), the answer and reason boxes, `Save` and `Dismiss`, the three tabs, the `Inbox actions` region,
  the apply button's text without its icon, the status line and the count all resolved to one element each.
  That shows the locators agree with the markup I read; it does not show that Vercel serves that markup.
* That Phase 22's restyle keeps those names and roles (the PM re-runs `just accept 23 --check` after it).
* Whether the response of the page's insert into `agent_requests` carries `id` (PostgREST returns the row
  for `.insert().select().single()`; the test reads an object or the first element of a list, and fails by
  name when neither holds an id).
* Whether the browser may call the RPC from the page (the app itself calls Supabase from the same page; I
  assumed the same cross-origin rules apply to the RPC path).
* W-83's five host actions: I wrote only their names, from the brief. The validator run used stubs.
* That `inbox_accept_question`, `v_inbox_apply_runs` and `inbox_apply_held_items()` are on prod: they are
  187's, applied by the PM after task 4. The cases run them from the migration text, not from prod.
* The final columns of the view after task 4: the case "the view the proofs read has the columns they name"
  holds the twelve names of R2 and fails loudly if the migration changes them.
* Whether the exporter marks the four test decisions skipped in both modes (W-82's code): the proof
  `test-decisions-skipped` reads the database, and was tested on rows made for it.
* `docs/` and `DATA_SYNTAX.md` are not mine and I did not touch them.

## Round 2 (the PM's rulings after the PR-level review)

Merged `origin/fix/phase23-followups` first (head `2b4edd7`, "Round 3" of the brief read).

### 1. The lost backslash in the spec

`web/e2e/accept23.spec.ts` had `/inbox-apply d+/` in step 3's early-close branch (it looked for the letter
d and could never fail). It came from my own edit script, which wrote `\d` inside a template literal and
lost one backslash. Fixed: one named constant, `PASTE_COMMAND = /inbox-apply \d+/`, used by both places
("nothing was pasted" in `expectClosedClean` and in the early-close branch). Counted by bytes with a fixed
string, because `grep -c 'inbox-apply \d+'` in this shell's basic regex does not match even the correct
text (it printed 0 before and after the fix; `od -c` shows the backslash is in the file):

    grep -cF 'inbox-apply \d+' web/e2e/accept23.spec.ts   ->  2   (the constant, and the 7a command regex)
    grep -cF 'inbox-apply d+'  web/e2e/accept23.spec.ts   ->  0

I read every regex and escape of the spec (`/^\d+ answered$/`, `/^Answer for item \d+$/`,
`/^Why for item \d+$/`, `/^claude "\/inbox-apply \d+"$/`), of `accept-proofs-db23.test.mjs` (`\s\S`, `\.`,
`\(`, `\$\$`, `'\n'`), and of `accept-proofs-kit.mjs` (`\b`, `\s`, `\.`, `\(`, `\r?\n`): all intact. The
playbook, the manifest and `proofs.json` hold no regex (the proofs' lint forbids a backslash, and the one
`'^session_link/[0-9]'` style pattern has none). My other edit scripts wrote no escape into a regex.

### 2. R7: step 6 waits no longer than the operator can

* Spec: step 6 watches `APPLY_WATCH_MS` = **9 minutes** from the press (the ruling says at most 9.5; the
  test spends about half a minute opening, saving and pressing first, so 9 keeps the whole command inside
  the operator's ten), test limit 9.75 minutes. A wait that ends with the request open throws
  `inconclusive: the apply request was still open after nine minutes`, after noting `labels_seen`.
* Playbook: the 15 minute paragraph is gone. On `inconclusive: the apply request was still open` the
  operator looks at `6-fail.png` and `labels_seen`, says what the page showed, gives `unsure`, never
  `fail`, and does not run the title again.
* **What the host does with that verdict, which the ruling may not have seen:** in
  `bb2dash-stack/scripts/lib/accept-stages.mjs` (`judgeOne`) the host reads an auto step's proofs only when
  the operator's verdict, the browser test and the evidence all stand. A step the operator gives `unsure`
  is red and its proofs are never read, so the blocked state of `applied-from-button` cannot take effect
  on that path; the run would be red, not repeated. The proof's blocked answer does take effect if the
  operator's verdict is `pass` or `blocked`. If the PM wants "repeat the run" for a slow Claude run, the
  playbook's one word `unsure` should be `blocked`. I built what was ruled; the change is one word in
  `acceptance/23/playbook.md`, step 6.
* Proofs (a request still open when read), each with a case:
  * `applied-from-button`: **blocked** when the checks did not pass and the request is `queued` or
    `claimed` (new), beside `daily_cap` and `usage_limit`.
  * `recorded-after-sync`: **blocked** when the checks did not pass and the apply request, or the sync
    itself, is `queued` or `claimed` (new; the sync still running after step 3's watch is the brief's
    "blocked" case).
  * `request-taken-after`: **blocked** when the request is `claimed` (the worker has it and has not closed
    it: a slow run) or capped; a request still `queued` after the worker was started is **failed**, because
    that is exactly what step 7b tests. This is my default; it is one clause if the PM wants `queued`
    blocked too.

### 3. The view and `filed_by`

The columns are the twelve the proofs were built against (`id`, `state`, `filed_by`, `after_request`,
`claimed_by`, `created_at`, `claimed_at`, `finished_at`, `claude_started`, `error_code`, `archived_count`,
`skip_ids`); the structural test holds them against the migration text. No proof needs changing for
`retry_held`: no proof names `params`, and `filed_by` stays `followup`. `applied-from-button` requires
`filed_by = 'button'`, so it accepts only the request the button filed itself; a new case shows that a
follow-up of it, with or without `retry_held` in its params, fails. `recorded-after-sync` requires
`filed_by = 'sync'` and `after_request` = the sync's id, so a follow-up (whose `after` is the apply
request's id) cannot be taken for it. `request-waiting` and `request-taken-after` require `button`.

### 4. `test-decisions-skipped` against R5

Read, not changed. The exporter skips a test question's decision only when the database allows it; a
decision whose item has a logged write is filed with a note instead. `test-decisions-skipped` expects all
four skipped with no note path, so it can only pass if none of the four has a logged write. The proofs
agree: `nothing-written` holds that the `confirm` and `dismiss` questions have no row in
`inbox_apply_writes`, and `applied-from-button` holds the same for the `note` question (the one that goes to
Claude). The `offline` question is recorded by the worker without Claude (dismissed, no note); no proof
reads its write log, but if it had one, `test-decisions-skipped` would fail on it, which is the right answer.

### Checks

Final tree: acceptance test 41 pass; the four proof files 86 pass (72 + 14); `--list` shows the seven titles; typecheck exit 0; eslint exit 0.
