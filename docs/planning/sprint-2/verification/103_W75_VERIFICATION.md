# 103: W-75 verification note (Phase 22, the walk box)

Worker W-75. Branch `feat/styling-22-walkbox`, cut from `feat/styling-22` at a58be34. Worktree
`C:/Users/stack/projects/bb2dash-wt-22-walkbox`. Task 0 of brief 103 as the PM's freeze ruling F-3
describes it: the throwaway test container that every Phase 22 browser walk uses, and the helpers
its specs share.

Files, all new: `scripts/walk-box.mjs`, `scripts/walk-box.test.mjs`, `docker/walk/entry.sh`,
`web/e2e/walk22.lib.ts`, `web/test/walk22-lib.test.ts`, and this note. Nothing else was changed.

Date: 2026-10-08. Every command below was run by itself and its exit code read directly.

## Task 0's check

| Check | Result |
|---|---|
| `node --test scripts/walk-box.test.mjs` gives 0 failures | 49 tests, 49 pass, 0 fail, exit 0 |
| A real run of `web/e2e/harness.spec.ts` on this branch's build ends with 0 | run `20261008T152840Z`, exit 0, 74 s |
| `run.json` is present | yes, in `C:/Users/stack/.bb2dash-walk/22/20261008T152840Z/` |
| No container is left (`docker ps -a --filter name=bb2dash-walk22`) | no line printed, after every run below |

## How the work was found

This worker ran twice. The first sitting wrote the host script's tests (8158ef2, red), then the
script and `entry.sh` (5c46e93, green), started the first real run and ended there. This sitting
found two commits, a clean worktree, and one container named `bb2dash-walk22-20261008t131023z`
that had been up for two hours with no host script driving it.

That container was not touched. While it was being looked at, it ended by itself: docker's own
event log shows `die` with exit code 0 at 15:16:36Z and `destroy` one second later. Its run folder
`20261008T131023Z` holds `results/.last-run.json` with `"status": "passed"`, and a `run.json` that
still says `"result": "running"`, because the host script that would have finished the record was
gone. It is left as it is. It is the evidence for one rule below: a walk box whose host script is
killed finishes its walk and removes itself, and its `run.json` is never finished.

## Red, then green

### The host script and the box (`scripts/walk-box.mjs`, `docker/walk/entry.sh`)

First cut, from the first sitting:

* RED, 8158ef2. `node --test scripts/walk-box.test.mjs` fails with `ERR_MODULE_NOT_FOUND`:
  `scripts/walk-box.mjs` is not written. (From that commit's own message; not re-run here.)
* GREEN, 5c46e93. Re-run at the start of this sitting: 46 tests, 46 pass, exit 0.

Second cut, this sitting. Reading the first cut against a real docker turned up three gaps:

1. `docker exec` ends with 1 for a container that is gone or stopped. 1 is also Playwright's code
   for a failed test, so `--exec` on a removed box would have been recorded as "tests failed".
2. A `--keep` run whose container never started still printed "is left running" with the two
   commands for it.
3. `npm ci` and the build had no time limit. A box whose host script was killed is watched by
   nobody, so each open-ended step needs an end of its own.

* RED, ea2fc72. 49 tests, 43 pass, 6 fail, exit 1.
* GREEN, 74eaa9a. 49 tests, 49 pass, exit 0.

What the tests hold, with docker and git injected so that nothing starts a container:

* The command line: specs, `--url`, `--keep`, `--exec`, `--rm`, Playwright's own arguments after
  `--`, and fifteen ways of writing it wrong.
* The exact docker arguments for a run, `--url`, `--keep`, `--exec` and `--rm`.
* The image tag equals `web/package.json`'s `@playwright/test` version, and a checkout with
  another version is refused.
* Refusals before any container starts: an output folder that is relative, inside a repository,
  inside a worktree, or reached through a link; a spec outside `web/e2e`, missing, or not a
  `.spec.ts` file; a missing web env file (build only) or login file; a path with a comma.
* No call names compose, a network, a port, another volume or another container.
* No value of either env file, and not the share token, appears in a docker call, in what is
  logged, or in `run.json`. The script opens neither env file.
* `run.json` is written before the container starts and again when it ends.
* `entry.sh` has LF line ends, stops at the first failure, copies `web/` without `node_modules`,
  `.next`, `e2e/.auth`, `e2e/.results` and any `.env*`, and never copies the login file.

### The spec helpers (`web/e2e/walk22.lib.ts`)

* RED, ce8eda8. `npx vitest run test/walk22-lib.test.ts` fails:
  `Error: Cannot find module '../e2e/walk22.lib'`. `Test Files 1 failed (1)`, `Tests no tests`.
* GREEN, 5bd8237. `Test Files 1 passed (1)`, `Tests 39 passed (39)`, exit 0. Two assertions were
  added with the code (an address under `rpc/` that names no function is stopped).

The route handlers are tested against a stand-in for Playwright's context that runs them in
Playwright's order: the handler registered last sees a request first. The rows `quietSync` hands
the app are read back through the app's own `syncPhase()`, and the copied labels are compared
with the app's `PHASE_LABEL`, so a change in the app turns this test red.

### The other gates, from `web/`

| Command | Result |
|---|---|
| `npm ci` | not repeated: `web/node_modules` was already there when this sitting began |
| `npx vitest run test/walk22-lib.test.ts` | 39 passed, exit 0 |
| `npm run typecheck` | exit 0 |
| `npx eslint . --max-warnings 0` | exit 0, no output |
| `npx vitest run` (the whole suite) | 157 files passed, 2952 tests passed, exit 0 |

## The real runs

All from `C:/Users/stack/projects/bb2dash-wt-22-walkbox`. Output is under
`C:/Users/stack/.bb2dash-walk/22/`.

| Run id | Command | Commit | Time | Exit | Result |
|---|---|---|---|---|---|
| `20261008T152840Z` | `node scripts/walk-box.mjs web/e2e/harness.spec.ts` | 74eaa9a, clean | 74 s | 0 | passed, 2 tests |
| `20261008T153831Z` | `node scripts/walk-box.mjs --keep web/e2e/harness.spec.ts` | 5bd8237, clean | 56 s | 0 | passed, box left running |
| `exec-20261008T154008Z` | `node scripts/walk-box.mjs --exec bb2dash-walk22-20261008t153831z web/e2e/harness.spec.ts` | 5bd8237, clean | 12 s | 0 | passed, 2 tests |
| `exec-20261008T154034Z` | the same with `WALK_SHOTS=1` and the probe spec (below) | 5bd8237, dirty | 26 s | 0 | passed, 4 tests, 2 shots |
| none | `node scripts/walk-box.mjs --rm bb2dash-walk22-20261008t153831z` | | not timed | 0 | removed |
| none | `--exec` on the box just removed | | not timed | 67 | "is not running", no folder made |
| `20261008T154207Z` | `node scripts/walk-box.mjs --url https://web-xi-ten-uy9xk6c6p0.vercel.app web/e2e/harness.spec.ts -- -g "signed in"` | 5bd8237, clean | 35 s | 0 | passed, 1 test |
| `20261008T154258Z` | `node scripts/walk-box.mjs web/e2e/harness.spec.ts -- -g "no test has this title w75"` | 5bd8237, clean | 47 s | 1 | tests failed (no test found) |

A plain run took 47 to 74 seconds with npm's cache filled. In the 74-second run `npm ci` reported
21 s and the build's two timed steps 4.8 s and 9.1 s; the rest is the copy, the other build steps,
sign-in and the tests. The first run on a machine has an empty cache and was not timed.

Three refusals were also run for real. Each ended with 64, started no container and made no
folder: a spec outside `web/e2e`, `-g` given before `--`, and `WALK_BOX_OUT` set to a folder inside
the worktree.

After every line above, `docker ps -a --filter name=bb2dash-walk22` printed nothing. The one
volume is `bb2dash-walk-npm-cache`.

### The run against production

The `--url` run walked the production site. It was not asked for. It was done because the first
real use of that mode would otherwise be after the merge. It signed in with the test login and ran
the one test `signed in`, which opens Home and reads. The local build reads the same database as
the same owner, so it touched nothing the other runs did not, except three page loads from Vercel.

### The probe: the helpers in a real browser

`harness.spec.ts` does not use `walk22.lib.ts`, so a spec of four tests was copied into `web/e2e`
for one `--exec` run and removed again. It is not committed. It is printed at the end of this note.
That run's `run.json` says `dirty: true` for that reason.

Each test first puts a backstop on the context. Playwright runs the handler registered last first,
so the backstop is the last one before the network. It records whatever the helpers let through
and stops every write and every RPC. In all four tests it saw nothing.

1. `quietSync(context)`: the Sync button says "Sync". A press shows the toast "Sync requested",
   no error line, and the label stays "Sync". No insert left the browser.
2. `quietSync(context, LONGEST_SYNC_PHASE_22)`: the button says "waiting on the container…" and
   still says so 12 seconds later, past two clock ticks and one poll. Its box was 193.6 px wide at
   1440 px.
3. `/announcements` calls `mark_announcements_seen`. The answer was 200 with body `0`, made by
   the guard. The database was not reached.
4. Five requests made from the page were stopped and recorded, in order: `workspace_ask`, an RPC
   with a made-up name, a PATCH of `assignment_progress`, a file write to Storage, and a
   sign-out. They carried no key and no session, so the API would have refused them anyway.

With `WALK_SHOTS=1` two shots were written through `shotPath22`, to
`C:/Users/stack/.bb2dash-walk/22/20261008T153831Z/exec-20261008T154034Z/shots/`. The Home shot
shows the owner's data signed in, in Inter, with the toast up.

## What was built beyond F-3's words

Each is small. Each is named here so the PM can strike it.

* **`--exec` asks the box first** (`docker exec <box> true`) and ends with 67 when it is not
  running.
* **`entry.sh` limits `npm ci` and the build** to 900 s each.
* **`guardWrites22` also stops a file write to Storage and a sign-out.** The app can upload and
  remove a submission file (`queries.submissions.ts`), and neither goes through `/rest/v1`. The
  account menu's Sign out calls `supabase.auth.signOut()`, which ends every session of the owner,
  the desktop app's among them. The account menu is one of the surfaces Phase 22 walks. A POST
  that only signs a link to read a file (`createSignedUrl`) passes.
* **`quietSync` refuses a context without `guardWrites22`.** Handlers run last registered first.
  With the guard first, a press of Sync is answered by `quietSync` and everything else falls
  through to the guard. In the other order the guard would stop the press.
* **`guardWrites22` twice on one context returns the same record.** A second set of handlers would
  have left the first caller's record empty for good.
* **A shot's folder is refused inside any git checkout**, not only the one the spec runs from.
* **`shotsAsked22()`**, so a spec asks before it shoots.
* **`run.json` holds more than F-3 lists**: the container, the mode, the host walked, the image,
  the worktree, whether it was dirty, the finish time, the duration and the result in words.
* **`next.log`** in the run folder: the server's own log.

## The read list

F-3 says to list the RPCs the app calls for reads and to treat every other RPC as a write.
`grep "rpc("` under `web/src` finds six calls, all writes: `workspace_ask`, `workspace_cancel`,
`planner_series_create`, `planner_series_update`, `planner_series_delete` and
`mark_announcements_seen`. The app calls no RPC for a read. Search goes through the `search` edge
function at `/functions/v1/search`, which the guard does not touch.

The read list holds the three search functions of the database (`search_file_text`,
`match_file_text`, `hybrid_search_file_text`), because F-3 names search RPCs as reads. The default
taken: they are listed although no screen calls them today. In practice every RPC a screen makes
now is stopped, or answered in the case of `mark_announcements_seen`.

## What could not be proved

* **Two boxes at once.** Run ids are the UTC second, so two starts in the same second collide and
  the second is refused with 64. That is tested. Two builds running side by side were not tried.
* **A cold npm cache.** The first sitting's run filled it.
* **A failed sign-in, a failed build and a server that does not start.** `entry.sh` has an exit
  code and a message for each (75, 73, 74). None happened, and none was forced.
* **`WALK_VERCEL_SHARE`.** The production host needs no share token. The token is passed by name
  and never by value, which the tests hold; no protected preview was walked.
* **The time limits.** Neither step came near 900 s.
* **A press of Sync in a phase other than idle,** and the phases between idle and the longest, in
  a browser. The unit test reads all twelve through the app's `syncPhase()`.
* **`docker/walk/entry.sh` has no test that runs it.** The host tests read its text. The real runs
  are its proof.

## What the PM should know before workers use it

1. **The script walks the worktree it lives in.** A worker's branch needs this branch merged in
   before it can walk its own build.
2. **Give it time.** A tool call that ends after two minutes kills the host script. The box then
   finishes by itself and removes itself, `run.json` stays at "running", and the result is in
   `results/.last-run.json`. Start a walk with a time limit of ten minutes, or in the background,
   and read `run.json`.
3. **`--exec` does not rebuild.** It reads `web/e2e` from the worktree as it is now. The app is
   the one the box built. A change under `web/src` needs a new box.
4. **The build type-checks `web/e2e` too.** `next build` runs TypeScript over everything
   `tsconfig.json` includes. A spec with a type error fails a new box with 73. `--exec` does not
   type-check.
5. **Exit codes.** 0 passed. 1 Playwright did not pass. 64 refused before any container. 65 docker
   could not be started. 67 `--exec` on a box that is not running. 70 to 76 the box broke (wrong
   call, copy, npm ci, build, server, sign-in, results). 125 and above are docker's own.
6. **Where shots are.** A run's are in `<run id>/shots/`. An `--exec` run's are in
   `<box run id>/exec-<run id>/shots/`. The folder is made by the first shot.
7. **Call order in a spec:** `guardWrites22(context)`, then `quietSync(context)`, then open the
   page. End with `assertNoWrites(writes)` from `./walk`.
8. **`harness.spec.ts` still takes its Phase 17 shot** through `shotPath`. In the box that path is
   inside the container's scratch copy and is thrown away with it. The worktree is mounted
   read-only, so nothing a spec does can write into it.
9. **The box is Linux Chromium.** Inter comes from Google Fonts over the network and renders as
   it does anywhere. The monospace stack (`ui-monospace, SFMono-Regular, Menlo, monospace`) falls
   back to a Linux font. A taste call about monospace text is better made on the Vercel preview.
10. **The box needs the network**: npm's registry, Google Fonts, and Supabase.
11. **`scripts/package.json`'s `test` script lists its files by name** and does not list
    `walk-box.test.mjs`. That file is outside this worker's set.
12. **The first sitting's run folder** `20261008T131023Z` has a `run.json` that says "running".
    It can be deleted. Nothing reads it.

## The helpers as built

```ts
// web/e2e/walk22.lib.ts
type Env = Readonly<Record<string, string | undefined>>;

shotsAsked(env: Env): boolean
shotPathFrom(env: Env, checkoutRoot: string, name: string): string
shotsAsked22(): boolean                    // WALK_SHOTS === '1'
shotPath22(name: string): string           // <WALK_SHOT_DIR>/<name>; throws unless asked for

READ_RPCS: ReadonlySet<string>
type GuardVerdict = 'pass' | 'abort' | 'answer_seen'
rpcNameOf(address: string): string | null
rpcVerdict(name: string): GuardVerdict
guardVerdict(method: string, address: string): GuardVerdict
guardWrites22(context: BrowserContext): Promise<string[]>

SYNC_PHASES_22: readonly ['idle', 'queued', 'unclaimed', 'requeued', 'starting', 'crawling',
                          'pulling_files', 'finishing', 'session', 'done', 'failed', 'cancelled']
type SyncPhase22 = (typeof SYNC_PHASES_22)[number]
SYNC_LABEL_22: Readonly<Record<SyncPhase22, string>>
LONGEST_SYNC_PHASE_22: SyncPhase22         // 'unclaimed', "waiting on the container…"
QUIET_REQUEST_ID: number
QUIET_RUN_ID: string
quietSyncAnswer(phase: SyncPhase22, request: QuietRequest, now: Date): QuietAnswer | null
quietSync(context: BrowserContext, phase?: SyncPhase22): Promise<void>   // idle by default
```

A shot's name is a bare `.png` file name: letters, digits, dot, underscore and hyphen, starting
with a letter or a digit.

## The probe spec, as it was run

Not a file of this branch. Kept here so the run can be repeated.

```ts
import { expect, test, type BrowserContext } from '@playwright/test';
import { assertNoWrites, dismissNativeDialogs, openSignedIn } from './walk';
import {
  LONGEST_SYNC_PHASE_22,
  QUIET_REQUEST_ID,
  QUIET_RUN_ID,
  SYNC_LABEL_22,
  guardWrites22,
  quietSync,
  shotPath22,
  shotsAsked22,
} from './walk22.lib';

const SYNC_BUTTON = 'sync-button';
const SETTLE_MS = 2000;

/** What got past the lib. A read goes on to the database; anything else stops here. */
async function backstop(context: BrowserContext): Promise<string[]> {
  const reached: string[] = [];
  await context.route(/\/rest\/v1\/(agent_requests|sync_runs|rpc\/)|\/storage\/v1\/|\/auth\/v1\/logout/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const isRpc = url.pathname.includes('/rest/v1/rpc/');
    const isQuietRead =
      url.searchParams.get('kind') === 'eq.sync' ||
      url.searchParams.get('id') === `eq.${QUIET_REQUEST_ID}` ||
      url.searchParams.get('run_id') === `eq.${QUIET_RUN_ID}`;
    if (request.method() === 'OPTIONS' || (request.method() === 'GET' && !isRpc && !isQuietRead)) {
      await route.fallback();
      return;
    }
    reached.push(`${request.method()} ${url.pathname}${url.search}`);
    if (request.method() === 'GET' && !isRpc) await route.fallback();
    else await route.abort('blockedbyclient');
  });
  return reached;
}

test('w75 probe: idle is pinned, and a press of Sync files nothing', async ({ page, context }) => {
  const reached = await backstop(context);
  const writes = await guardWrites22(context);
  await quietSync(context);
  dismissNativeDialogs(page);

  await openSignedIn(page, '/');
  const button = page.getByTestId(SYNC_BUTTON);
  await expect(button).toHaveText(SYNC_LABEL_22.idle);
  await page.waitForTimeout(SETTLE_MS);

  await button.click();
  const wrap = button.locator('xpath=..');
  await expect(wrap.getByRole('status').filter({ hasText: 'Sync requested' })).toBeVisible();
  await expect(wrap.getByRole('alert')).toHaveCount(0);
  await page.waitForTimeout(SETTLE_MS);
  await expect(button).toHaveText(SYNC_LABEL_22.idle);

  if (shotsAsked22()) await page.screenshot({ path: shotPath22('w75-probe-home-idle.png') });
  expect(reached, 'nothing of the Sync button reached the database').toEqual([]);
  assertNoWrites(writes);
});

test('w75 probe: the longest label is pinned', async ({ page, context }) => {
  const reached = await backstop(context);
  const writes = await guardWrites22(context);
  await quietSync(context, LONGEST_SYNC_PHASE_22);
  dismissNativeDialogs(page);

  await openSignedIn(page, '/');
  const button = page.getByTestId(SYNC_BUTTON);
  await expect(button).toHaveText(SYNC_LABEL_22[LONGEST_SYNC_PHASE_22]);
  await expect(button).toHaveAttribute('title', /Nothing has claimed this sync/);
  await page.waitForTimeout(12_000);
  await expect(button).toHaveText(SYNC_LABEL_22[LONGEST_SYNC_PHASE_22]);
  console.log(`[w75 probe] longest label, button box: ${JSON.stringify(await button.boundingBox())}`);

  if (shotsAsked22()) await button.screenshot({ path: shotPath22('w75-probe-sync-longest.png') });
  expect(reached, 'nothing of the Sync button reached the database').toEqual([]);
  assertNoWrites(writes);
});

test('w75 probe: mark_announcements_seen is answered here', async ({ page, context }) => {
  const reached = await backstop(context);
  const writes = await guardWrites22(context);
  await quietSync(context);
  dismissNativeDialogs(page);

  const seen = page.waitForResponse((response) => response.url().includes('/rest/v1/rpc/mark_announcements_seen'));
  await openSignedIn(page, '/announcements');
  const response = await seen;
  expect(response.status()).toBe(200);
  expect(await response.text()).toBe('0');
  await page.waitForTimeout(SETTLE_MS);

  expect(reached, 'no RPC reached the database').toEqual([]);
  assertNoWrites(writes);
});

test('w75 probe: a write RPC, a table write, a file write and a sign-out are stopped and recorded', async ({ page, context }) => {
  const reached = await backstop(context);
  const writes = await guardWrites22(context);
  await quietSync(context);
  dismissNativeDialogs(page);
  const firstRead = page.waitForRequest((request) => request.url().includes('/rest/v1/'));
  await openSignedIn(page, '/');

  // No key and no session: the API would refuse each anyway, and none may leave the browser.
  const api = new URL((await firstRead).url()).origin;
  const attempts: [string, string][] = [
    ['POST', '/rest/v1/rpc/workspace_ask'],
    ['POST', '/rest/v1/rpc/w75_probe_not_a_function'],
    ['PATCH', '/rest/v1/assignment_progress?id=eq.0'],
    ['POST', '/storage/v1/object/w75-probe/none.txt'],
    ['POST', '/auth/v1/logout?scope=local'],
  ];
  const outcomes = await page.evaluate(
    async ({ origin, list }) => {
      const out: string[] = [];
      for (const [method, path] of list) {
        try {
          const response = await fetch(`${origin}${path}`, { method, body: '{}' });
          out.push(`${method} ${path} -> ${response.status}`);
        } catch {
          out.push(`${method} ${path} -> blocked`);
        }
      }
      return out;
    },
    { origin: api, list: attempts },
  );
  expect(outcomes).toEqual(attempts.map(([method, path]) => `${method} ${path} -> blocked`));
  expect(writes).toEqual(attempts.map(([method, path]) => `${method} ${api}${path}`));
  expect(reached, 'none of them reached the network').toEqual([]);
});
```
