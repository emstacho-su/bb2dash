# Acceptance runs

When a phase is finished, someone has to walk through it on the live site and say "accepted". For
Phase 21 that walk was fifteen steps by hand. An **acceptance run** does the walk without the hand:
one command starts a throwaway container, a Claude session inside it works through the steps the
way a person would, and the laptop checks the hard facts behind its back.

    just accept 21        (from bb2dash-stack, on main, after the phase is merged)

This folder holds what a run needs to know about a phase. The machinery that runs it (the
container, its firewall, the wrapper script) is in bb2dash-stack.

## What happens in a run

1. **Check.** Both repositories are clean and on `main`, Docker is up, and the pack for the phase
   exists at that commit. The run reads the pack from the commit, never from files lying around.
2. **Prepare.** A throwaway container fetches that commit and installs what the browser tests need.
   It holds no secret and no login.
3. **Host steps.** The laptop does the steps that need Docker itself: stopping an old test
   container, starting the Workspace service, reading its health row. A pack can only *name* these
   actions; the commands are a fixed list in bb2dash-stack.
4. **Sandbox stages.** For each one a fresh container starts with a Claude session inside: the
   operator. It runs one browser test per step, opens every screenshot, reads what the page said,
   and writes a report with a verdict per step. It has no Docker, no database and no way to reach
   anything but the site, and it is thrown away when the stage ends.
5. **Host proofs.** After a stage the laptop reads the facts itself, read-only, from the database:
   which model level answered, which tool was used, that Stop was stored as cancelled, that the
   planner is exactly as it was. The operator's word is never the only evidence for these.
6. **Verdict.** The run writes its report, the verdict and every screenshot to a folder outside
   every repository (`C:/Users/stack/.bb2dash-accept/<phase>/<run>/`), because answers quote course
   material and this repository is public.

## What the result means

| result | what it means | what happens next |
|---|---|---|
| **green** | every automated step has a `pass` from the operator, a passed browser test and passing host proofs | it counts as the acceptance: the PM writes the "accepted" record and cleans up, without asking again |
| **red** | at least one step failed, was unclear, or left no evidence | nothing is accepted; the PM brings the report to Stack |
| **blocked** | the run could not judge fairly: the Claude plan's limit was reached, a sync or an Inbox apply was waiting or running when the run began, or the planner changed while one ran | nothing is accepted and nothing is wrong; the run is repeated |

"Unsure" is red. A step with no evidence is red. Only a run started the normal way, from a clean
`main`, can count as acceptance; a trial run with extra flags never does.

## What stays a person's job

- Anything the manifest marks `human`. For Phase 21 that is step 1: confirming that Usage credits
  are off, and reading the plan's usage numbers. The record says the run did not check it.
- Anything marked `waived`, with the reason written beside it. For Phase 21: the desktop-window half
  of step 2 (the picture from the PM's walk stands) and step 12 (the merge had already happened).
- Reading the report when the run is red, and deciding what to do about it.
- One judgement rests on the operator alone: whether an answer "names the file it read" (Phase 21,
  step 3). Everything else also has a database or container proof.

A run costs real questions on Stack's Claude plan. Phase 21's run asks about eight, three of them at
the most expensive level, plus three short operator sessions.

## A pack: three files and one browser-test file

A phase's pack is the folder `acceptance/<NN>/` and one file of browser tests:

| file | what it is | who reads it |
|---|---|---|
| `acceptance/<NN>/manifest.json` | the stages of the run in order, and the steps of the acceptance script with who does each | the wrapper |
| `acceptance/<NN>/playbook.md` | per sandbox stage: what each step does and what must be true for a pass, in plain words | the operator |
| `acceptance/<NN>/proofs.json` | the named read-only questions the laptop asks the database | `scripts/accept-proofs.mjs` |
| `web/e2e/accept<NN>.spec.ts` | one browser test per automated step | the operator runs them |

Shared by every phase: `OPERATOR.md` (the operator's rules: how to run a step, what the four
verdicts mean, what it never does), `manifest.schema.json` and `report.schema.json` (the shapes),
and `web/e2e/accept.lib.ts` (how a test records what it saw).

## Adding a phase

1. **Write the steps down first.** Take the phase's acceptance script and decide, step by step, who
   does it: the operator in the sandbox (`auto`), the laptop alone (`host`), a person (`human`), or
   nobody, with a reason (`waived`).
2. **`web/e2e/accept<NN>.spec.ts`.** One test per `auto` step, declared with `acceptStep()`. Its
   title starts with the step's number (`3 lookup haiku`). It names the pictures it takes
   (`{ shots: ['start', 'end'] }`), records what the page showed, and only then asserts. Copy the
   shape of `accept21.spec.ts`.
3. **`acceptance/<NN>/manifest.json`.** The stages in order (`prepare`, then `host` and `sandbox`
   stages as the script needs them) and every step. An `auto` step names its stage, its test, the
   files its test leaves as evidence, and the proofs that must also pass. The host reads those
   proofs itself after the step's stage, so they are not listed a second time as host actions.
4. **`acceptance/<NN>/proofs.json`.** One entry per fact the laptop must read for itself: its typed
   parameters, one `select`, and a sentence saying what the row must show. A proof that reads a
   row the sandbox pointed at (by an id) also checks that the row is this run's
   (`since`, given `carry:run.started_at`) and is what the step did (for a question, its md5).
5. **`acceptance/<NN>/playbook.md`.** One `## Stage: <id>` section per sandbox stage. For each step:
   what it does, and what must be true in the pictures and in the facts file for a pass. Say what is
   *not* the product's fault too, so the operator can tell `blocked` from `fail`. The operator gets
   one section and nothing around it, and takes every sentence at its word. So write a text of the
   page in code marks, exactly as the page has it (``the button reads `Ask` ``); repeat a thing's
   name where "it" could be two things; and leave out "again", "still" and "as before", which can
   each be read two ways.
6. **Run the checks**, then try it: `node --test acceptance/acceptance.test.mjs`, then
   `just accept <NN> --check` from bb2dash-stack.

A host step can only name an action from bb2dash-stack's list (`scripts/lib/accept-actions.mjs`);
`manifest.schema.json` repeats that list. A new kind of host step is added there first.

## The rules every pack is held to

`node --test acceptance/acceptance.test.mjs` checks every pack in this folder. It needs nothing
installed and reaches nothing.

- The manifest fits `manifest.schema.json`, and its phase is its folder's.
- Stage ids and step ids are used once.
- Every `auto` step names a sandbox stage, a test of that stage, and a title the browser-test file
  really holds; its evidence is exactly its facts file and the pictures its test declares.
- Every test of a stage belongs to exactly one step, and the browser-test file holds no test that no
  stage runs. A title is listed once over all the stages: listed twice, its test would be run twice
  and ask its question twice.
- Every proof a step or a host action names is in `proofs.json`, with the same parameter names and
  values of the stated types; and for every proof a `host` step lists, the step's own stage runs
  that proof with the same values.
- A carried value (`carry:<step>.<field>`) comes from a step that has already run, or from a proof
  saved earlier. A host action reads what the stages before its own left; an `auto` step's proofs
  may also carry from a step of the step's own stage.
- `carry:run.started_at` is the host's own: the time the run started, on the laptop's clock. It is
  there in every run. Nothing else is offered under `run`, and no proof is saved under that name.
- A proof never takes a time from a step. A step's facts are written inside the sandbox, so a time
  among them is the sandbox's word; a proof compares with `carry:run.started_at` or with the
  database's own times.
- Every statement in `proofs.json` is one read: it starts with `select` or `with`, reads schema
  `public` only, and uses exactly its own parameters. It holds no double-quoted name, no comment,
  no backslash and no `$` but a parameter, so the check reads the same text the database does.
- A statement never reads text out. It may name a column that holds text in two ways only:
  `md5(<alias>.content)`, to hold a question against the md5 it was given, and
  `<alias>.title = '<a literal>'`.
- Every sandbox stage has its `## Stage:` section in the playbook, and the section names each of
  the stage's tests.
- **No course text.** The playbook and the manifest quote no answer: no block quote, and no long
  passage between double quotes, single quotes or code marks. Long is more than twelve words (in
  double quotes, also more than sixty characters). A passage is read across line breaks, so
  wrapping one does not hide it. The acceptance script's own questions and the app's own strings
  are the two exceptions.
- **The page's texts, as the page has them.** In a playbook the word "reads" is always followed by
  a text in code marks. A text in code marks that comes straight after "reads", "says" or "shows"
  must stand in `web/src/lib/workspace-labels.ts` or in the phase's browser-test file as a whole
  quoted string, with a quote mark straight before it and the same mark straight after it. That is
  all the check reads: a text in code marks after any other word passes unread.

## For whoever maintains it

**What a test leaves** in the stage's output folder (`ACCEPT_OUT`, never inside a repository):

- `<step>-<label>.png` for each shot it declares, each exactly the browser window (1440 by 900);
  `<step>-fail.png` when it failed.
- `<step>.json`, the facts: `state`, `badge`, `used`, `line`, `request_id`, `conversation_id`,
  `asked_at`, `closed_at`, `names_file`, `answer_chars`, `answer`, `shots`, and whatever else the
  step notes. A second run of a step replaces its files.
- `pw-<slug of the title>.json`, Playwright's own report for that one test. The slug is the title in
  lower case with every run of other characters as one hyphen (`9-reload-mid-answer`).

**The saved session file.** Before each sandbox stage the laptop signs in to the site and saves
that session to one file, which the stage's tests read as `ACCEPT_STATE` and save back after each
test. The file holds more than the sign-in: the browser saves the page's stored data with it, and
the page stores what it last showed, answers included. So it is treated like the answers
themselves. It lives only in the laptop's private folder for that one stage, outside every
repository; the stage's container is handed that one file as `/accept/state.json`; and it is
deleted when the stage ends, after the laptop has signed that one session out. A test refuses to
start when `ACCEPT_STATE` or `ACCEPT_OUT` is inside the checkout, also by way of a link that leads
into it, and the sign-in script refuses the same for the file it saves to (`WALK_STATE_PATH`).

**What crosses from one stage to the next** is the carry-over, which the host keeps. After a
sandbox stage it takes the ids and the times out of each step's facts file and files them under the
step's id: a field crosses only when its name says what it is (`request_id`, `archived_ids`,
`still_queued_at`) and its value is one. A manifest value `carry:3.request_id` reads one back. A
host proof with `"save": "planner_before"` leaves its detail under that name, read back as
`carry:planner_before.fingerprint`. The host adds one value of its own, `carry:run.started_at`:
the time the run started, on the laptop's clock.

The next sandbox stage gets the ids and times, and nothing else, as `carry.json` in the folder the
host hands in (`ACCEPT_IN`): for example `{"3": {"request_id": 412, "conversation_id": "…"}}`. A
test reads an earlier step of its own stage from that step's facts file, and an earlier stage's
from `carry.json`. Phase 21's tests need `3.conversation_id` and `14a.request_id` there.

An id from a step tells a proof which row to read. It is never enough to pass: the proof reads the
row itself and decides. A time from a step is not given to a proof at all. Step 14a's facts still
hold `still_queued_at`, for whoever reads them; no proof takes it.

**A proof is tied to this run and to its question.** A green run counts as the acceptance, so
nothing the sandbox says or writes may be enough, by itself, to make a step green. A sandbox could
hand over the id of an old request that looks right. So Phase 21's proofs also check:

- *It happened in this run.* Each takes `since`, always `carry:run.started_at`, and the row must
  have been made no earlier than 60 seconds before it. The 60 seconds are for a laptop clock that
  runs ahead of the database's.
- *It is the step's question.* `turn`, `turn-stopped` and `turn-answered-after` take
  `question_md5`: the md5 of the question the step's browser test types (for step 14b, the one
  step 14a typed), written out in the manifest. The statement compares it with the md5 of the
  stored question and never returns the question. A test computes each md5 from the browser-test
  file, so the manifest cannot drift from what is typed.
- *One request stands for one step.* Steps 7, 8 and 9 ask the same question, and two of them at
  the same tier. So from step 4 on, each step's proof also takes `after`: the request of the step
  before it (`carry:<that step>.request_id`), and its own request must be the later one. The ids
  of steps 3 to 9 therefore rise, and no one request can be handed in for two steps.
- *The question really waited.* `turn-answered-after` takes `min_wait_s` (15 for step 14b, the
  seconds step 14a's test watches the question wait) and compares two times of the database: when
  the question was asked and when the Workspace service took it. No clock of a sandbox is read.
- *The planner is as it was.* The fingerprint holds the newest change of each progress table, the
  count of assignments, and the number of rows in each progress table, so a deleted row that was
  not the newest also shows. A planner that reads the same passes, whatever else ran: what did not
  change was changed by nobody. `planner-unchanged` is `blocked` only when the planner differs and
  a sync or an Inbox apply could be why: one was queued, taken or finished since the fingerprint
  was read, or one is running now. Then the change cannot be laid at the Workspace.
- *No sync is open when the run begins.* `planner-fingerprint` is the second thing `go-live` does,
  before a container is stopped or a question is spent, and it is `blocked` while a sync or an
  Inbox apply is waiting or running. Start the run again when that request has ended.
- *A request nobody ended is not a running sync.* One left queued or claimed for more than 6 hours
  blocks nothing in either proof. Both count them as `stale_claims`, so that someone closes them.

**Each proof is read once.** An `auto` step's proofs are read by the host straight after the
step's sandbox stage, and only when the operator's verdict, the browser test and the evidence files
all stand. No host stage lists them. A `host` step's proofs are `db.proof` actions of the step's
own host stage, and are read there and nowhere else. Phase 21's manifest therefore holds two
`db.proof` actions: `planner-fingerprint` in `go-live`, which saves how the planner stood before
the walk, and `planner-unchanged` in `walk-proofs`, which is step 11. Its `walk-proofs` stage also
runs step 10's two container checks, and nothing follows its `back` stage: the proofs of steps 14b
and 15 are those steps' own.

**The switch.** A browser test is skipped where it is declared unless `ACCEPT=1`, and then only the
test whose exact title is `ACCEPT_ONLY` runs. With neither set, `npx playwright test -c
e2e/accept.config.ts` lists every test as skipped and writes nothing.

**The proofs script.** `node scripts/accept-proofs.mjs <phase> <proof> --sha <commit> --param k=v …`
reads `proofs.json` at that commit, runs the one statement in a read-only transaction that is always
rolled back, and prints one line: `{"name", "pass", "detail"}`, with `"blocked": true` when the proof
says the run must be repeated. It exits 0 for a pass, 1 for a fail, 3 for blocked, and 2 when it
could give no verdict. It always prints that one line, by whatever path it was started (a link to
the folder too), and it never ends with exit 0 without a verdict. When it cannot read the pack it
says why on stderr in git's own words: a commit that was never fetched and a pack that is not there
are different things to put right.

Its tests are three files in `scripts/`: `accept-proofs.test.mjs` (the rules, with a stand-in for
the database), `accept-proofs-cli.test.mjs` (the script as a process) and
`accept-proofs-db.test.mjs`, which runs each of a pack's statements on rows made for the case, in
a Postgres that lives inside the test (PGlite). That last one needs `npm ci` in `scripts/` first.
None of them reaches the real database.

The database is the first lock, the check of the statement's text the second. Every statement is
sent in the way that lets the database take one statement at a time (the extended protocol), so a
text that holds a second statement is refused by the database itself; and the transaction is
read-only, so a write is refused too.

`detail` holds ids, counts, codes and times, and never text. It keeps a value only when the value
is of a known shape: a number, true, false, null, or a text that is a uuid, an ISO time, a planner
fingerprint or a short token with no blank in it (a state, a tool's name). Anything else shows as
the word `withheld`. A row that carries a key named like a text column (`content`, `prompt`,
`title`, `query`, `note`, `history`, `params`, `result`, `description`, `answer`), at any depth,
fails its proof.

Parameter types: `integer`, `uuid`, `time` (ISO, with its zone), `uuids` (uuids joined by commas),
`text` (a plain name: letters, digits and single `_`, `.` or `-`), `fingerprint` (what
`planner-fingerprint` returns), `hex32` (an md5: 32 lower-case hex characters), and `enum:a|b|c`.
A `?` after a type makes the parameter optional.
`$1` in the statement is the first parameter the proof declares, `$2` the second.

**A statement's verdict** is in the one row it returns: `ok` true passes, anything else does not,
and `blocked` true outranks both.

## What the first proof run taught (2026-10-07)

The first proof run walked steps 2 to 9 on the live site, and the operator failed step 8 on the
playbook, not on the product: "the button reads Ask again, not Stop" meant "reads Ask once more",
and was read as a button labelled "Ask again". So a playbook sentence must be readable one way
only, with every text of the page in code marks exactly as the page has it, and a rule now checks
that. The operator's `notes` are where it reports what is not a step's pass condition: in that run
it noticed that an answer asked after a Stop said the earlier reply was empty, which is worth
knowing and is no reason to fail the step. A proof run (`--proof`) never counts as acceptance,
whatever its result.
