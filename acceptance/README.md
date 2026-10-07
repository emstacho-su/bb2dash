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
5. **Host proofs.** As soon as a sandbox stage ends, the laptop reads the facts behind each of its
   steps itself, read-only, from the database: which model level answered, which tool was used,
   that Stop was stored as cancelled, that the planner is exactly as it was. The operator's word is
   never the only evidence for these.
6. **Verdict.** The run writes its report, the verdict and every screenshot to a folder outside
   every repository (`C:/Users/stack/.bb2dash-accept/<phase>/<run>/`), because answers quote course
   material and this repository is public.

## What the result means

| result | what it means | what happens next |
|---|---|---|
| **green** | every automated step has a `pass` from the operator, a passed browser test and passing host proofs | it counts as the acceptance: the PM writes the "accepted" record and cleans up, without asking again |
| **red** | at least one step failed, was unclear, or left no evidence | nothing is accepted; the PM brings the report to Stack |
| **blocked** | the run could not judge fairly: the Claude plan's limit was reached, or a sync ran while the planner was being compared | nothing is accepted and nothing is wrong; the run is repeated |

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
   files its test leaves as evidence, and the proofs that must also pass. A `host` step is a label
   and a sentence: each action of its stage that proves it carries `"step": "<id>"`. A `waived`
   step says why in its text, and names the file that stands in its place when one does.
4. **`acceptance/<NN>/proofs.json`.** One entry per fact the laptop must read for itself: its typed
   parameters, one `select`, and a sentence saying what the row must show.
5. **`acceptance/<NN>/playbook.md`.** One `## Stage: <id>` section per sandbox stage. For each step:
   what it does, and what must be true in the pictures and in the facts file for a pass. Say what is
   *not* the product's fault too, so the operator can tell `blocked` from `fail`.
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
  stage runs.
- Every proof a step or a host action names is in `proofs.json`, with the same parameter names and
  values of the stated types.
- A `host` step names a host stage, and at least one action of that stage carries its label.
- A carried value comes from a step that has already run (`carry:<step>.<field>`) or from
  something the host saved earlier (`carry:host.<name>`). A stage's deadline counts from one.
- A file under `docs/` that a step's text names is in the repository.
- Every statement in `proofs.json` is one read: it starts with `select` or `with`, reads schema
  `public` only, never names a column that holds message text, and uses exactly its own parameters.
- Every sandbox stage has its `## Stage:` section in the playbook, and the section names each of
  the stage's tests.
- **No course text.** The playbook and the manifest quote no answer: no block quote, and no quoted
  passage longer than a short label, except the acceptance script's own questions.

## For whoever maintains it

**What a test leaves** in the stage's output folder (`ACCEPT_OUT`, never inside a repository):

- `<step>-<label>.png` for each shot it declares, each exactly the browser window (1440 by 900);
  `<step>-fail.png` when it failed.
- `<step>.json`, the facts: `state`, `badge`, `used`, `line`, `request_id`, `conversation_id`,
  `asked_at`, `closed_at`, `names_file`, `answer_chars`, `answer`, `shots`, and whatever else the
  step notes. A second run of a step replaces its files.
- `pw-<slug of the title>.json`, Playwright's own report for that one test. The slug is the title in
  lower case with every run of other characters as one hyphen (`9-reload-mid-answer`).

**What crosses from one stage to the next** is the carry-over. After a sandbox stage the host takes
the ids and the times out of each step's facts file (a whole number, a uuid, an ISO time, a short
list of ids; nothing else), and files them under the step's id. A manifest value
`carry:3.request_id` reads one back. What the host's own actions save sits under `host`:
`carry:host.stopped_at` and `carry:host.started_at` are the times of the last stop and start of the
Workspace, and a `db.proof` with `"save": "planner_before"` leaves its whole detail at
`carry:host.planner_before`.

The next sandbox stage gets the ids and times as `carry.json` in the folder the host hands in
(`ACCEPT_IN`), for example `{"3": {"request_id": 412, "conversation_id": "…"}, "host":
{"stopped_at": "…"}}`. A test reads an earlier step of its own stage from that step's facts file,
and an earlier stage's from `carry.json`. Phase 21's tests need `3.conversation_id` and
`14a.request_id` there.

**A stage's deadline** is `{"from": "carry:host.stopped_at", "plus_seconds": 180}`: so many seconds
after a time the run already has. The host works it out and hands it to the tests as
`ACCEPT_DEADLINE`.

**A step's proofs** are run by the host itself, as soon as the step's sandbox stage has ended and
only when the operator's verdict, the browser test and the evidence files all stand. Phase 21's
manifest also lists the same proofs as actions of its `walk-proofs` and `back-proofs` stages; those
read each fact a second time.

**The switch.** A browser test is skipped where it is declared unless `ACCEPT=1`, and then only the
test whose exact title is `ACCEPT_ONLY` runs. With neither set, `npx playwright test -c
e2e/accept.config.ts` lists every test as skipped and writes nothing.

**The proofs script.** `node scripts/accept-proofs.mjs <phase> <proof> --sha <commit> --param k=v …`
reads `proofs.json` at that commit, runs the one statement in a read-only transaction that is always
rolled back, and prints one line: `{"name", "pass", "detail"}`, with `"blocked": true` when the proof
says the run must be repeated. `detail` holds ids, counts, codes and times, never message text. It
exits 0 for a pass, 1 for a fail, 3 for blocked, and 2 when it could give no verdict.

Parameter types: `integer`, `uuid`, `time` (ISO, with its zone), `uuids` (one uuid, several joined
by commas, or a JSON list), `text` (a plain name: letters, digits and single `_`, `.` or `-`),
`fingerprint` (what `planner-fingerprint` returns: the string, or its whole detail as JSON, which
is how the host hands a saved proof back), and `enum:a|b|c`. A `?` after a type makes the
parameter optional. `$1` in the statement is the first parameter the proof declares, `$2` the
second.

**A statement's verdict** is in the one row it returns: `ok` true passes, anything else does not,
and `blocked` true outranks both.
