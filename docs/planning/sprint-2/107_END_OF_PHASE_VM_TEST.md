# 107 — End-of-phase test on a clean Linux VM

Date 2026-10-03 · PM: the Phase 19 session · Product manager: Stack · Status: **design note, nothing
built**; question 1 answered (2026-10-03), questions 2 and 3 open.

## What Stack asked for

On 2026-10-03, after Phase 19's run, Stack asked whether testing could be handed off to a machine
that isn't his laptop, with him in the loop only to log in periodically. His direction: "I have a
spare machine at home. I will set it up eventually but I like the idea of spinning up a small always
on linux VM at the end of phases as an explicit testing step."

So there are two parts:

1. **Now:** a clean Linux VM is started at the end of every phase, runs the full test set against the
   phase branch, reports, and is thrown away. It becomes a named gate in the per-phase cycle.
2. **Later:** the spare home machine becomes the always-on host. It runs the same tests plus the
   steps that need Stack's Blackboard login, using Phase 14's containers.

## Why it helps

In Phase 19 the PM ran every suite on Stack's laptop. Three things went wrong or needed him:

* **A pipe hid two exit codes.** Test runs that pipe into `tail` reported success they hadn't proven.
  A runner that fails on any non-zero exit removes that whole class of mistake.
* **The suites depended on the laptop being awake** and on per-worktree `npm ci` runs.
* **The live sync needed Stack's Chrome and his Duo.** That cannot move to a throwaway VM. Phase 14's
  container login, on an always-on machine, can take it.

## Recommendation for part 1: a GitHub Actions workflow

A GitHub-hosted runner (`ubuntu-latest`) **is** a small Linux VM: GitHub starts a fresh one for each
run and deletes it afterwards. bb2dash is a public repo, so the standard runners cost nothing.

`.github/workflows/phase-gate.yml`, started by hand (`workflow_dispatch`) on the phase branch. One job
per area, each failing on any non-zero exit:

| Job | Runs | Needs |
|---|---|---|
| web | `npm ci`, `typecheck`, `build`, `vitest run` in `web/` | nothing secret |
| desktop | `npm ci`, `typecheck`, `vitest run` in `desktop/` | nothing |
| mcp-server | `npm ci`, `typecheck`, `build`, `test` | nothing |
| scripts and ingest | `npm --prefix scripts ci`, `npm --prefix scripts test`; `node --test ingest/*.test.mjs`; `ingest/test_token_budget.py` through `uv` | nothing |
| walk | `web/e2e/login.mjs` and the phase's walk spec against the phase's Vercel preview | the test login and a Vercel bypass token as secrets |

The run's summary page is the evidence: the PM links it in the PR, and the ledger's integration row
cites the run id, not lines copied out of a terminal.

**What it does not do:** the SQL suite (question 1, answered: it stays on Stack's own device and moves to the home box's runner when that is up), and anything that needs Blackboard. Live syncs stay on Phase 14's stack (the
laptop now, the home machine later).

### Secrets on a public repo (the part to get right)

With the SQL job out (question 1), the only secrets are the walk's test login and a Vercel bypass token.

* Secrets live in a GitHub **environment** (`phase-gate`) that only `workflow_dispatch` runs on the
  owner's branches can use. No `pull_request_target`, and no secrets for pull requests from forks
  (GitHub withholds them by default).
* Values are never echoed. The DSN is passed through `env:` to `db-test.mjs` only.
* `db_test_runner`'s DSN is **not** stored in GitHub (question 1): it is a production login that bypasses
  row-level security, and its grants have grown each phase (Phase 19's security review flagged this as low).

## Part 2, later: the home machine

The home box is Stack's MacBook, being factory reset for it (2026-10-03). Phase 14's containers are Linux
containers, so on macOS they run under a Docker runtime; if it is an Apple-silicon Mac, check that Phase 14's
images build for arm64 before moving the stack there. GitHub's self-hosted runner supports macOS.

* **SQL suite:** the `sql` job runs here (`runs-on: [self-hosted, home]`), with the DSN in the box's own
  gitignored `.env.local`, never in GitHub.

* Install the Phase 14 stack (`compose.yaml`, the noVNC login, the keep-alive) and Claude Code.
* Register it as a **self-hosted runner** for this repo with a label like `home`. The same
  `phase-gate.yml` then gains a `live-sync` job (`runs-on: [self-hosted, home]`) that queues a sync,
  waits for it to fold, and checks it. If the Blackboard login has expired, it pings Stack for his Duo.
* Until that machine exists, the `live-sync` job is skipped, and the phase's live sync stays the step
  Stack runs himself.

## Where it goes in the cycle

ORCHESTRATOR §3, between step 6 (Gates) and step 7 (Docs + PR): **"6b. VM gate. Run
`phase-gate.yml` on the phase branch and record the run id in the ledger; a red job goes back to its
worker as the next round."**

## Size and order

Small: one workflow file, three secrets, the §3 line, a README paragraph. It needs nothing from
Phase 14, so it can come first. It would be cheapest to land right after Phase 19 merges, so that
Phase 14's own end can use it.

## Open questions for Stack

1. ~~**The SQL job's credential.**~~ **Answered 2026-10-03:** "lets keep the sql suite on my device for now." The
   GitHub workflow has no SQL job; the suite runs on Stack's laptop, then on the home box's runner.
2. **When it runs:** by hand at the end of a phase (default), or also on every push to a phase branch?
3. **Where it lands:** a small phase of its own after 19 (default), or folded into Phase 14?
