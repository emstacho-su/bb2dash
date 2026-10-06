# 102 — W-66 verification note (Phase 21, the web stream)

Worker W-66 · branch `feat/workspace-21-web` · worktree `bb2dash-wt-21-web`. Owns the "W-66" row of
brief 102 §Workers. Wave 1 tasks: **15** (query layer) and **4** (stream hook and route skeleton).
Wave 2, after the Realtime spike (task 5) passed: **16** (the screen and the nav link) and the
list of ruling T2. It is under its own heading, "Wave 2"; the sections before it are wave 1's
record as it was written (the file was renamed from `102_W-66_VERIFICATION.md` in wave 2).
Wave 2b, the items of ruling U1, is under "Wave 2b". The review round, ruling V4 (CR-8, CR-9,
CR-12), is under "Review round" at the end.

Fixtures only: no database read or write, no prod change, no docker command. The database objects
of migrations 140–142 are typed by hand from the Contract; every test stubs the Supabase client.

All checks run from `C:/Users/stack/projects/bb2dash-wt-21-web/web`. `npm ci` exited 0.

## Starting count (branch at 228fdd5, before any change)

| Suite | Command | Result |
|---|---|---|
| web | `npx vitest run` | `Test Files  137 passed (137)` · `Tests  2427 passed (2427)` |

It equals the count at the cut (2427).

---

## Task 15 — the query layer (`web/src/lib/queries.workspace.ts`, P-86)

Hand-declared row types (the `queries.sync.ts` pattern), pure normalisers, `xOptions()` and hooks.

* **Ask.** `parseQuestion` trims and refuses empty or over-8000-character text before any request.
  Characters are counted as `char_length()` counts them (code points), so the page and the database
  agree on a question that holds emoji. `askWorkspace` calls
  `rpc('workspace_ask', { p_conversation_id, p_text })`; SQLSTATE 23505 and 22023 come back as a
  `WorkspaceRefusal` whose `message` is the frozen sentence, and any other error is thrown as it came.
* **`?c=`.** `parseConversationId` returns a uuid in lower case, or null. Lower case because the topic
  is `workspace:<uuid>` as Postgres prints it.
* **Request ids.** `toRequestId` reads a positive integer given as a number or as digits. Rows, the
  ask result and the broadcast payloads all go through it, so two ids are compared as numbers.
* **Conversations.** `conversationsOptions(archived = false)` filters `archived = false`; the archived
  list is `conversationsOptions(true)`, under its own key.
* **Messages, requests, status.** All three set `staleTime: 0`. Messages refetch every 5 s only while
  a request is open; status every 30 s (`WORKSPACE_STATUS_REFETCH_MS`). `isWorkspaceOffline` is true
  for a null `polled_at`, an unreadable one, or one more than 120 s old.
* **Never read.** The select lists do not name `claude_session_id` or `cost_usd`.
* **Writes.** `cancelWorkspaceRequest` (`workspace_cancel`), `setConversationArchived` (one column).

Check (a): `npx vitest run test/queries.workspace.test.ts`

* RED (3c56d42, test first, module absent):
  `Error: Failed to resolve import "@/lib/workspace-labels" from "test/queries.workspace.test.ts". Does the file exist?`
  → `Test Files  1 failed (1)` · `Tests  no tests`.
  2580804 added the hook cases to the same file while the module was still absent (same red).
* GREEN (30efdf6): `Test Files  1 passed (1)` · `Tests  103 passed (103)`.

Check (d): `npx eslint src/lib/queries.workspace.ts test/queries.workspace.test.ts --max-warnings 0`
→ exit 0, no output.

Three things in this task that the row does not spell out:

1. **`web/src/lib/workspace-labels.ts` exists already, with three strings.** Task 15's check maps
   23505 and 22023 to their sentences, task 4's check names the line "Answering…", and the Contract
   says those strings are held in that file. It holds exactly those three
   (`REFUSAL_STILL_ANSWERING`, `REFUSAL_QUESTION_LENGTH`, `LATE_STREAM_LINE`). The queued line, the
   offline line and the eight error sentences come with task 16 behind `workspace-labels.test.ts`,
   which will be red when it is written.
2. **The open-request query reads every request of the conversation** (`requestsOptions`), in id
   order, and `openRequestOf()` picks the one still `queued` or `claimed`. Task 16 needs each
   question's request row for the state under it, so one query serves both. It polls every 5 s only
   while one is open.
3. **Archive is in the layer now** (`setConversationArchived`, `useSetConversationArchived`), with
   its cases, since the list in task 16 needs it and it is one column on a file this task owns.

---

## Task 4 — the stream hook and the route skeleton (P-87)

`web/src/lib/use-workspace-stream.ts`, `web/src/app/(app)/workspace/page.tsx`, `Workspace.tsx`,
`Workspace.module.css`.

* **One private channel.** `await supabase.realtime.setAuth()`, then
  `supabase.channel(topic, { config: { private: true } })` with handlers for `delta` and `done`. The
  topic is `workspace:<uuid>` when `?c=` is a uuid, else `workspace:lobby`. The old channel's leave is
  awaited before the next join, so the page never holds two. A change of the followed request alone
  does not reopen the channel.
* **The stream rule.** A pure reducer keeps deltas by seq, per request id. The view is the contiguous
  run from seq 1. If deltas arrived and seq 1 is not among them, `late` is true and the text is
  empty. A gap holds later text back, and text past a gap is never shown, `done` or not. A repeated
  seq is dropped (the first text stays). Another request id is never rendered.
* **Payload keys.** `parseDelta` and `parseDone` read the named keys; `id` and any other key are
  ignored. A seq that is not a positive integer, or a delta that is not text, drops the event.
* **`done`** invalidates the conversation's messages and requests, and the list.
* **No state is set in an effect body** (the lint rule is at error). Events carry their topic and the
  view is derived against the topic the page is on.
* **The skeleton** shows the stream area only. Cache-dependent markup waits for `useHydrated()`.
  The stored messages, the list, the composer, the service line and the nav link are task 16.

Check (a): `npx vitest run test/use-workspace-stream.test.tsx`

* RED (d1565e1, test first, hook and route absent):
  `Error: Failed to resolve import "@/lib/use-workspace-stream" from "test/use-workspace-stream.test.tsx". Does the file exist?`
  → `Test Files  1 failed (1)` · `Tests  no tests`.
* GREEN (a969d8f): `Test Files  1 passed (1)` · `Tests  53 passed (53)`.

Two more red-then-green rounds on the same file:

* RED (1c35fb0): `Tests  1 failed | 54 passed (55)`,
  `TestingLibraryElementError: Unable to find role="alert"`. A failed read of the conversation's
  requests left the stream area empty with no word of why.
  GREEN (b3309e1): `Tests  55 passed (55)`. The page now says
  "Could not load this conversation: <message>" (the Inbox's form). The green commit also repairs
  the case's fake read: its first version overrode a chain whose filters returned the original one,
  so the error never reached the query. The red was real either way (there was no alert to find).
* RED (cf1de8e): `Tests  1 failed | 55 passed (56)`,
  `AssertionError: expected { …(6) } to match object { …(2) }` (the view read `joined` where
  `joining` was expected). After conversation, lobby, conversation with no wait, the state had never
  seen another topic and kept the status of a channel that was already gone.
  GREEN (c966b51): `Tests  56 passed (56)`. The join now says `joining` once the last channel has
  left.

Check (d): `npx eslint . --max-warnings 0` → exit 0, no output.

### What the spike (task 5) reads on the page

The stream area is `[data-workspace-stream]`, a card under the "Workspace" heading. Its text is the
streamed text, or the one line "Answering…" for a late stream, or nothing. It carries:

| attribute | value |
|---|---|
| `data-topic` | the channel held: `workspace:<uuid>` or `workspace:lobby` |
| `data-channel` | `joining`, `joined` or `error` |
| `data-channel-detail` | on `error` only: the client's reason (for example `CHANNEL_ERROR: …`) |
| `data-request-id` | the conversation's open request, when it has one |

Before the send, `data-channel` should read `joined` and `data-request-id` the spike's request id. The
page follows the conversation's open request (`queued` or `claimed`), so the delta must name that
id. After the request is cancelled the page drops the text at its next read of the requests (within
5 s), as the brief expects.

### One-off check against the real Realtime client (not committed)

The committed test uses a fake client, which cannot show a wrong reading of supabase-js. So the hook
was also run once over the real `@supabase/supabase-js` 2.116.0 client with a fake WebSocket as its
transport (a temporary file under `web/test/`, deleted after the run; the Files table gives W-66
five test files and this would be a sixth).

* The join frame the client sent:
  topic `realtime:workspace:6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11`, event `phx_join`, payload
  `{"config":{"broadcast":{"ack":false,"self":false},"presence":{"key":"","enabled":false},"postgres_changes":[],"private":true},"access_token":"<the test client's placeholder key>"}`.
  So `private: true` and a token are in the join, which is what `setAuth` before `channel` is for.
* A pushed frame `{type: 'broadcast', event: 'delta', payload: {id, request_id: 42, seq: 1, delta: 'spike-ok 1'}}`
  rendered as `spike-ok 1`.
* Moving from one conversation to another sent `phx_join` A, `phx_leave` A, `phx_join` B, in that
  order.
* Three moves with no wait (A, lobby, B, A) sent `phx_leave` A then `phx_join` A and nothing for the
  two topics passed through, and the channel joined again.
* Result: `Tests  1 passed (1)`.

It does not prove the live server side (the 141 policy, the partition, the replication slot). That
is task 5.

---

## Gates for the two tasks (branch at c966b51)

| Gate | Command | Result |
|---|---|---|
| named tests | `npx vitest run test/use-workspace-stream.test.tsx test/queries.workspace.test.ts` | `Test Files  2 passed (2)` · `Tests  159 passed (159)` |
| lint | `npx eslint . --max-warnings 0` | exit 0, no output |
| types | `npm run typecheck` | exit 0 |
| build | `npm run build` | exit 0; the route list holds `/workspace` |
| whole suite, with coverage | `npm run test:coverage` | `Test Files  139 passed (139)` · `Tests  2586 passed (2586)` · exit 0 |

2586 = 2427 at the cut + 103 + 56. Coverage, all files: lines 90.97 % (floor 83 %).
`queries.workspace.ts` lines 100 %; `use-workspace-stream.ts` lines 97.8 % (lines 183–184, the
reducer's unreachable `default` branch). `Workspace.tsx` and `workspace-labels.ts` are not in the
text table. The table omits `use-hydrated.ts` too, so I read that as the reporter leaving out some
files rather than as zero coverage; I did not confirm why.

The standing scans in the suite pass: no "Submit" control, no service-role credential word under
`web/src`, no env read outside the two public names, no raw-HTML sink, no status spelled by a
screen. No `composes` is used in the new CSS Module.

## Notes for the PM

* **A warning that is not this stream's.** Under `--reporter=verbose` the hydration case prints
  "The current testing environment is not configured to support act(...)" twice. The existing
  `PlannerWeek.hydration` and `ItemPopout.hydration` files print it too (6 times between them): it
  comes from `test/hydration-harness.tsx` calling React's `act` in a suite where
  `IS_REACT_ACT_ENVIRONMENT` is never set. That file is not mine and no test fails on it.
* **Wording that is mine, not frozen.** The header kicker "Assistant", the Suspense fallback
  "Loading the Workspace…" and the problem line "Could not load this conversation: <message>". Each
  follows the form its neighbours use (Materials' "Library", Planner's "Loading the week…", the
  Inbox's "Could not load the inbox: …"). Say if any should read differently.
* **`web/test/queries.workspace.test.ts` is 944 lines**, over the 800-line house limit. It is the
  one file the Contract names for the layer's tests, so it was not split.
* **Stream state is kept per request id** (the newest three per topic). "Ignored" is implemented as
  never rendered: a delta that reaches the page a moment before the page has read the open request
  is kept, and shows once the request is known.

---

## Wave 2

2026-10-06 · branch `feat/workspace-21-web` · task **16** (the screen and the nav link) and the
list ruling T2 handed to it. Fixtures only again: no database read or write, no prod change, no
docker command, no `claude -p`, no secret or env value read.

**First step.** `git fetch origin`, then `git merge origin/feat/workspace-21` → a fast-forward to
bbb2d28 (49 commits, no change under `web/`), pushed. The brief on the branch did not change in
that merge, so `rulings-3.md` was read beside it.

**Starting count** (bbb2d28): `npx vitest run` → `Tests  2586 passed (2586)`, 139 files.

All commands below run from `C:/Users/stack/projects/bb2dash-wt-21-web/web`.

### 1. From the wave 1 check (ruling T2)

| item | what was done | commits |
|---|---|---|
| the file name | `git mv` to `102_W66_VERIFICATION.md` | cbdf901 |
| two test files over 800 lines | split into named siblings over one shared fake (below) | 5805678 |
| a failed `removeChannel` is logged | red, red, green (below) | a36b1f0, edc7806, 5f86521 |
| the effect is split | `openChannel`, `channelEvent`, `joinAfter`, `leaveChannel`; the longest function in the file is 41 lines | 5f86521, 6e7172b |
| a request id past 2^53 | committed cases; green on the first run (below) | 0939e07 |
| the real-client check | committed as `web/test/use-workspace-stream.realtime.test.tsx` | 9cc6f77 |
| a queued request that turns cancelled with no broadcast | a committed case on a fake clock (section 3) | 5e1774a, 59aa05e |
| `useNow(30_000)` in the offline line | wired in `Workspace.tsx`, proven on a fake clock (section 3) | 59aa05e |

**The split.** Same 159 cases before and after (`Tests  159 passed`), nothing dropped.

| file | lines before | lines now | holds |
|---|---|---|---|
| `test/queries.workspace.test.ts` | 944 | 764 | everything task 15's row lists (reads, the two RPCs, the normalisers, offline, the intervals) |
| `test/queries.workspace.hooks.test.tsx` | new | 319 | the request-id reader, the archive write, the invalidation, the hooks, 23503 |
| `test/use-workspace-stream.test.tsx` | 816 | 554 | everything task 4's row lists (the wire, the stream rule, the hook) |
| `test/use-workspace-stream.screen.test.tsx` | new | 395 | the cases that mount the screen; in task 16 it gained the end of a stream |
| `test/workspace-harness.tsx` | new | 355 | the one fake Supabase client those suites and task 16's share (not a test file) |

Task 15's and task 4's row commands still name a file that holds what the row lists.

**A failed leave is logged.**

* RED (a36b1f0), `npx vitest run test/use-workspace-stream.test.tsx`:
  `AssertionError: expected "error" to be called 1 times, but got 0 times` →
  `Tests  1 failed | 44 passed (45)`. The leave rejected and `.catch(() => undefined)` swallowed it.
* RED (edc7806), same command: `Tests  3 failed | 45 passed (48)`. supabase-js types a leave as
  resolving to `'ok' | 'timed out' | 'error'`, so a failure can arrive as an answer, not a throw.
* GREEN (5f86521), `npx vitest run test/use-workspace-stream.test.tsx test/use-workspace-stream.screen.test.tsx`:
  `Test Files  2 passed (2)` · `Tests  60 passed (60)`. `leaveChannel` logs any answer but `ok`
  (`workspace: leaving <topic> answered "<answer>"`) and any rejection
  (`workspace: could not leave <topic>`, with the error); the next join still does not wait on it.

**A request id past 2^53** (0939e07). `toRequestId` already refused what a number cannot hold
exactly, so these cases were green on their first run and nothing under `src/` changed; there is no
red to quote. They pin it: `2 ** 53`, `'9007199254740992'` and `'9007199254740993'` read as no
request (the last would round to its neighbour as a number); a request row and an ask result with
such an id are dropped; `parseDelta` and `parseDone` drop a broadcast that carries one, so a delta is
never credited to the neighbouring request. `Number.MAX_SAFE_INTEGER` still reads.

**The real-client check** (9cc6f77), `npx vitest run test/use-workspace-stream.realtime.test.tsx` →
`Tests  5 passed (5)`, three runs in a row. The client is the real `@supabase/supabase-js` 2.116.0;
only its transport is a fake WebSocket. It shows the join frame with `private: true` and a token, a
pushed `broadcast` frame rendered as text, `phx_join` A / `phx_leave` A / `phx_join` B for a move,
and one leave and one join for three moves made with no wait.

It also corrected my own reading. I first wrote a case expecting a leave the server never answers
to resolve to `timed out`; it failed (`expected "error" to be called 1 times, but got 0 times`).
On this client the channel is already `leaving` when the leave is pushed, so
`@supabase/phoenix` confirms it to itself at once (`if (!this.canPush()) leavePush.trigger("ok", {})`):
`removeChannel` answers `ok` whether or not the server replies, and the channel removes itself
from the client's list on close. The committed case says that. So on 2.116.0 the logged branches
do not fire in practice; they stay for the other answers the type allows.

### 2. Task 16: the strings and the nav link

**`web/src/lib/workspace-labels.ts`.** Check: `npx vitest run test/workspace-labels.test.ts`.

* RED (2ebaa27): `Failed Tests 19`, first of them
  `AssertionError: expected undefined to be 'Waiting for the Workspace service'`.
* GREEN (884b563): `Tests  23 passed (23)`.

Held word for word against the brief: the queued line, the late-stream line, the offline line, the
eight `error_code` sentences (the `sign_in_expired` one has no backticks; the stopped sentence is
the one for `cancelled`), the two refusals, "Ask" and "Stop", "Archive", "Unarchive",
"Show archived", the three tier badges, "Used:", and ruling T2's three skeleton strings (the kicker,
the fallback, the problem line), which `page.tsx` now reads from there. No string in the module
holds `$`, a money word, or any digit outside "1 to 8000".

**`NAV_LINKS`.** Check: `npx vitest run test/TopNav.workspace.test.tsx`.

* RED (ee1d617): `Failed Tests 3`, first of them
  `AssertionError: expected [ 'Home', 'Planner', 'Inbox', …(2) ] to deeply equal [ 'Home', 'Planner', 'Inbox', …(3) ]`.
* GREEN (138e1f7): with the two existing TopNav files, `Test Files  3 passed (3)` · `Tests  18 passed (18)`.

One line in `TopNav.tsx`. `git diff --stat origin/main...HEAD -- web/src/components/shell/TopNav.module.css`
prints nothing.

### 3. Task 16: the screen

`Workspace.tsx`, `Workspace.module.css`, and under `web/src/components/workspace/`:
`ConversationList`, `MessageList`, `Composer`, `TierBadge`, `ServiceStatus` (each with its module),
plus two small modules the Files table does not name: `thread.ts` (the pure rules) and `route.ts`
(the path and `?c=`, spelled once).

* RED (5e1774a), the five files at once: `Failed Tests 47`.
  `test/Workspace.test.tsx (34 tests | 31 failed)`;
  `test/use-workspace-stream.screen.test.tsx (17 tests | 11 failed)`;
  `test/queries.workspace.test.ts (78 tests | 1 failed)` (`refetchOnWindowFocus`);
  `test/queries.workspace.hooks.test.tsx (32 tests | 4 failed)` (23503 and the reason reader);
  `test/Workspace.thread.test.ts`: `Error: Failed to resolve import "@/components/workspace/thread"`.
* GREEN (59aa05e), the row's command and the audits beside it,
  `npx vitest run test/Workspace.test.tsx test/TopNav.workspace.test.tsx test/workspace-labels.test.ts test/audits.test.ts test/raw-html.audit.test.ts test/status-vocabulary.test.ts test/Workspace.thread.test.ts`:
  `Test Files  7 passed (7)` · `Tests  114 passed (114)`.

Two cases in the red files were changed in the green commit, and the behaviour they hold was not.
One was wrong about timing: TanStack calls a mutation's function a tick after `mutate`, so "the
cancel was sent" is now waited for. The other, the focus case, passed for the wrong reason on real
timers (the 5 s interval caught it), so it was moved onto a fake clock where only the focus refetch
can explain it. The assertion that matters most, the stopped sentence in the same tick as the press,
is still read with no wait.

What the screen does, each with the file that holds it:

| the Contract says | where it is held |
|---|---|
| one tier badge per assistant row | `Workspace.test.tsx` |
| "Used:" from the `ok: true` calls, `tool · scope` or `tool`, `, `-joined in call order, an identical entry once, absent when none | `Workspace.test.tsx`, `Workspace.thread.test.ts` |
| `<script>` in content is literal text; never a tool's result, the stored `query` or the cost | `Workspace.test.tsx` |
| "Ask"; "Stop" only while a request is open; Enter asks, Shift+Enter is not cancelled | `Workspace.test.tsx` |
| 1 to 8000 characters, refused before any request; 23505 → "This conversation is still answering." | `Workspace.test.tsx` |
| 23503 → "Could not load this conversation: <reason>", not the question-length sentence | `Workspace.test.tsx`, `queries.workspace.hooks.test.tsx` |
| the state under a question from its `workspace_requests` row; one sentence per code, chosen by the request row, with or without an assistant row | `Workspace.test.tsx`, `Workspace.thread.test.ts` |
| after Stop the stopped sentence shows at once | `Workspace.test.tsx` (the RPC is held; the row still reads `claimed`) |
| archived rows left out; "Archive" on each row; "Show archived" off by default, its rows "Unarchive", read only when on | `Workspace.test.tsx` |
| lowest seq not 1 → only "Answering…" | `Workspace.test.tsx`, `use-workspace-stream.screen.test.tsx` |
| exactly one private channel, `workspace:<uuid>` or `workspace:lobby` | `Workspace.test.tsx` |
| offline once the clock passes `polled_at` + 120 s with no new data; back when a newer one arrives | `Workspace.test.tsx`, fake timers |
| answers are `white-space: pre-wrap` text | `MessageList.module.css` `.text`; the nodes are React text |
| the end of a stream: `done`, and a refetch on focus, never the interval alone | `use-workspace-stream.screen.test.tsx` |
| a gap: text past a missing seq never shows; at `done` the stored row takes over | `use-workspace-stream.screen.test.tsx`, `Workspace.thread.test.ts` |

**The end of a stream.** `messagesOptions`, `requestsOptions` and `statusOptions` set
`refetchOnWindowFocus: 'always'`, so the refetch on focus does not rest on the app client's
default. Three cases hold it, with the tab hidden (`focusManager.setFocused(false)`) and a client
whose default is no refetch on focus; two of them run on a fake clock:

* `done` arrives in a hidden tab → the stored row, the badge and "Ask" are there.
* A queued request is cancelled in the database with no broadcast (task 5's own sequence): 15 s
  pass in the background and the page still says "Waiting for the Workspace service"; the tab
  regains focus and within 100 ms it says "You stopped this answer." and the button reads "Ask".
* The requests query is read 0 times across three hidden intervals, once on focus, and once per
  5 s again in the foreground.

Checked that they bite: with `REFETCH_ON_FOCUS` set to `false` by hand, the last two fail
(`expected 'Waiting for the Workspace service' to be 'You stopped this answer.'`,
`expected 1 to be 2`); with the mark in `useStop` removed, the at-once case fails. Both edits were
reverted before the commit.

**Follow-up rounds.**

* 6e7172b, refactor: `useStop`, `useArchive`, `StreamArea`, `ArchivedToggle`, `joinAfter`. No
  function in the files I own is over 50 lines (the longest: `Thread`, 48).
* f37c2b0, `test/Workspace.failures.test.tsx`: written after the screen, so not red-first. A failed
  read of the list or the messages, a question that could not be sent, a Stop that failed or came
  too late, an Archive that was refused, the button's wait, the column's scroll. All passed as
  written but one: "the refusal is gone" needed a wait, for the same zero timer as above.
* RED (279b45b), `npx vitest run test/Workspace.failures.test.tsx -t "same tick"`:
  `AssertionError: expected [ 'workspace_ask', 'workspace_ask' ] to deeply equal [ 'workspace_ask' ]`.
  Two Enters in one tick (a held key) sent the question twice, and the second came back as 23505.
  GREEN (8dd8ab0), `npx vitest run test/Workspace.failures.test.tsx test/Workspace.test.tsx`:
  `Tests  49 passed (49)`. The composer holds a question in flight in a ref.
* 44ee672, refactor: that guard took `Composer` to 54 lines, so the text and the one-at-a-time ask
  moved into `useQuestion`; `Composer` is 40 again.
* RED (bc14a76), `npx vitest run test/Workspace.thread.test.ts`:
  `AssertionError: expected [ { …(7) }, …(1) ] to have a length of 1 but got 2` →
  `Tests  1 failed | 36 passed (37)`. Found reading my own diff: a request whose question row was
  not read got its own turn carrying its assistant row, and the same row was then placed again as a
  stand-alone turn, so the answer showed twice.
  GREEN (f4cfcde), same command: `Tests  37 passed (37)`. The request's turn claims its answer
  before the stand-alone pass.

### 4. Gates (branch at f4cfcde, the last commit that changes `web/`)

All six were run again from the start on f4cfcde, in this order, with nothing under `web/` edited
while they ran. (An earlier full run on 8dd8ab0 was green too, 2719 cases; three commits followed it.)

| gate | command | result |
|---|---|---|
| whole suite | `npx vitest run` | `Test Files  147 passed (147)` · `Tests  2720 passed (2720)` · exit 0 |
| coverage | `npm run test:coverage` | `Tests  2720 passed (2720)` · exit 0 · all files, lines 91.33 % (floor 83 %) |
| build | `npm run build` | exit 0; the route list holds `○ /workspace` |
| types | `npm run typecheck` | exit 0 |
| lint | `npx eslint . --max-warnings 0` | exit 0, no output |
| task 16's row | `npx vitest run test/Workspace.test.tsx test/TopNav.workspace.test.tsx test/workspace-labels.test.ts test/audits.test.ts` | `Test Files  4 passed (4)` · `Tests  67 passed (67)` · exit 0 |

2720 = 2586 at the start of the wave − 159 + 293. The ten Workspace files hold 293 cases:
`queries.workspace` 78, `.hooks` 32, `use-workspace-stream` 49, `.screen` 17, `.realtime` 5,
`Workspace` 34, `.thread` 37, `.failures` 15, `TopNav.workspace` 3, `workspace-labels` 23.

Coverage of what the wave wrote: `Workspace.tsx` lines 100 %; `components/workspace/` lines 100 %;
`queries.workspace.ts` lines 100 %; `use-workspace-stream.ts` lines 98.01 % (183–184, the
reducer's unreachable `default`, as in wave 1).

Standing scans, all in the suite and green: no "Submit" control; neither service-key word under
`web/src` (my files were also grepped for them, for env reads and for raw-HTML sinks: no hit); no
status spelled by a screen. No new dependency: `web/package.json` and `web/package-lock.json` are
unchanged against `origin/main`. Every file I own is at most 800 lines (the largest:
`test/queries.workspace.test.ts`, 764; `src/lib/queries.workspace.ts`, 733).

`composes` in the built app: each new module composes straight from `tokens.module.css`, one level
(`btnPrimary`, `btnGhost`, `input`, `tagOutline`). Read in the build's chunk:
`button:"Composer-module__…__button "+e.i(79333).btnPrimary`, which resolves to
`tokens-module__…__btnPrimary tokens-module__…__btn`. Nothing composes a local class that composes.

### 5. Not done, and not proven

* **I have not seen the screen in a browser.** My worktree has no `web/.env.local`, and I read no
  env value. Every claim above is from jsdom, the type checker and the build. The layout (the list
  beside the thread, the column's `max-height: 62dvh`, the two themes) is unseen until the PM's
  walk on the preview.
* **`/code-review` and `/security-review` were not run by me.** The brief gives both to the PM at
  task 23, on the PRs. I read my own diff for the same things; that is not a review.
* **The real leave** (section 1) is read from supabase-js under a fake socket, not from the live
  server.

### 6. Notes for the PM

**Decisions in the screen that the Contract does not spell.** Each is small, and each is yours to
overrule.

1. **A claimed request with no text yet says "Answering…".** The Contract gives that line to a
   stream whose lowest seq is not 1 and names no line for "claimed, nothing received yet". Blank
   looked dead, and acceptance step 9 expects "Answering…" on a reloaded page before any delta has
   arrived. The same line shows for the moment between a `done` row and its stored answer.
2. **The partial text stays under the stopped sentence.** After Stop the page keeps what had
   streamed until the runner's stored row replaces it, so the text does not blink out and back. For
   a queued request cancelled with no runner (task 5's own case) no runner ever streamed; if a
   delta was sent by hand first, it stays until a reload.
3. **Enter while a request is open still sends the question**, and the database refuses it with
   23505 ("refused by the database, not only by the button"). The button itself reads Stop.
4. **The stream follows the newest request until its stored answer has landed**, not only an open
   one, so there is no blank frame when the request row arrives before the message row.
   `data-request-id` on the stream area is still the open request only.
5. **A request whose question row was not read gets its own turn**, and so does an assistant row
   with no request row. Nothing that was read is dropped.
6. **Archiving the selected conversation moves the page to `/workspace`.**
7. **A failed request with no code on either row** says the `cli_error` sentence (the runner's own
   rule: anything unrecognised is `cli_error`).
8. **The message column scrolls inside itself** (`max-height: 62dvh`) and follows an answer while
   the reader is at its end, so the composer and Stop stay in reach during a long answer.
9. **An assistant row with no stored tier gets no badge.** The page names no tier it was not given.

**Wording that is mine, not frozen.** All in the last section of `workspace-labels.ts`, marked.

| string | where |
|---|---|
| "Conversations" | the list's heading and its region name |
| "New conversation" | a link to `/workspace` with no `?c=`, at the top of the list |
| "No conversations yet." / "No archived conversations." | an answered, empty list |
| "Messages", "Question" | screen-reader names of the column and the text box |
| "You asked", "The assistant answered" | screen-reader labels inside a turn |
| "Could not load the conversations: <reason>" | the list could not be read |
| "Could not load the Workspace service status: <reason>" | the status could not be read |
| "Could not send this question: <reason>" | a question failed for a reason that is neither refusal nor 23503 |
| "Could not stop this answer: <reason>" | Stop failed |
| "Could not change this conversation: <reason>" | Archive or Unarchive failed |

`<reason>` is the error's own message. For 23503 that is the database's sentence about the foreign
key, shown after "Could not load this conversation:".

**"New conversation" is a control the Contract does not list.** Without it the only way back to an
empty composer is the top bar's Workspace link. Say if it should go.

**Files beyond the Files table**, all inside what W-66 owns: `web/src/components/workspace/thread.ts`,
`web/src/components/workspace/route.ts`, `web/test/workspace-harness.tsx`,
`web/test/queries.workspace.hooks.test.tsx`, `web/test/use-workspace-stream.screen.test.tsx`,
`web/test/Workspace.thread.test.ts`, `web/test/Workspace.failures.test.tsx`. The two `.hooks` /
`.screen` siblings are the split ruling T2 asked for; I chose their names.

**For `walk21.spec.ts`.** The page carries these, none of them styled:
`[data-workspace-stream]` with `data-topic`, `data-channel`, `data-channel-detail`,
`data-request-id` (the open request); each turn `li[data-turn]` (`queued`, `streaming`, `done`,
`failed`, `stopped`, or empty) with `data-request-id`; inside it `[data-tier]`,
`[data-answer-text]`, `[data-used]`, `[data-turn-line]`; `[data-workspace-offline]` on the offline
line; `[data-last-activity]` in a list row. The list is `navigation` "Conversations"; the box is
`textbox` "Question"; the row buttons are named exactly "Archive" and "Unarchive".

### 7. Fix round (the PM's check of 3f1330d)

2026-10-06, same branch. Four problems came back from the check: one must-fix and three minor.
Three are fixed, each red first; the fourth waits for wording. Fixtures only, as before: no database
read or write, no docker command that changes state, no `claude -p`, no secret or env value read.

**First step.** `git fetch origin`, then `git merge origin/feat/workspace-21` → merge commit 59bb427
(the phase branch was one docs commit ahead, 4ca39d9: `102a` and `DECISIONS.md`, nothing under
`web/`), pushed. That commit carries git's own merge message.

| problem | severity | result | commits (red, green) |
|---|---|---|---|
| a missed `done` broadcast could leave the page on "Answering…" with the answer stored | must-fix | fixed | 9581b15, cd7116c |
| the offline line was said from an old status row | minor | fixed | 23d1963, ef1ef21 |
| a refusal and a failed-Stop line outlived their reason | minor | fixed | 01c4bec, 8b4eec4 |
| the message column is an empty box in three states | minor | not done: needs PM wording (below) | none |

**The missed broadcast.** `Workspace.tsx` gained `useStoredRowOnClose`: when a request stops being
the open one, the messages are read once. `workspace_finish()` commits the request and the row
together, so that read holds the stored row. `messagesOptions` is unchanged, so task 15's row
("refetches every 5 s only while a request is open") still holds.

* RED (9581b15), `npx vitest run test/use-workspace-stream.screen.test.tsx`:
  `AssertionError: expected null to be 'The stored answer.'` → `Tests  1 failed | 17 passed (18)`.
  The case is the check's own sequence on a fake clock with the tab in front: claimed, one extra
  read of the messages at 2.6 s to shift the two polls apart, the rows turned to `done` plus the
  stored answer at 7.7 s with no broadcast, the requests poll at 10 s.
* GREEN (cd7116c), the six Workspace files
  (`test/use-workspace-stream.screen.test.tsx test/use-workspace-stream.test.tsx test/Workspace.test.tsx test/Workspace.failures.test.tsx test/queries.workspace.test.ts test/queries.workspace.hooks.test.tsx`):
  `Test Files  6 passed (6)` · `Tests  226 passed (226)`. The case also holds that the close costs
  exactly one read of the messages, and that nothing is read in the two minutes after it.

**The offline line.** `ServiceStatus.tsx` says offline only from a row read within two refetch
intervals (`STATUS_TRUSTED_FOR_MS = 2 * WORKSPACE_STATUS_REFETCH_MS`, compared against
`dataUpdatedAt`). An older row says nothing until the read a mount or a return to the tab has
already sent comes back.

* RED (23d1963), `npx vitest run test/Workspace.test.tsx`: `Tests  3 failed | 34 passed (37)`, each
  `AssertionError: expected <p class="_offline_33c9e2" …(2)></p> to be null`. The three: a row
  restored ten minutes after it was read, with the service up (the first paint); the first frame
  back from three minutes in a hidden tab during a streaming answer, with a current heartbeat in
  the database; and the edge, a row read 60 000 ms ago speaks and one read 60 001 ms ago does not.
* GREEN (ef1ef21), `npx vitest run test/Workspace.test.tsx test/Workspace.failures.test.tsx test/use-workspace-stream.screen.test.tsx`:
  `Test Files  3 passed (3)` · `Tests  70 passed (70)`. The existing fake-clock case (offline past
  `polled_at` + 120 s, back with a newer one) passes unchanged: the status is re-read every 30 s.

**The two lines that outlived their reason.** In `Workspace.tsx`, `refusalLine` shows "This
conversation is still answering." only while the rows show an open request (the question-length
sentence still stays until the text changes), and `useStop` reports a failed Stop only while the
request it was pressed on is the open one.

* RED (01c4bec), `npx vitest run test/Workspace.failures.test.tsx`: `Tests  2 failed | 17 passed (19)`.
  `AssertionError: expected [ Array(1) ] to deeply equal []` (received
  `"Could not stop this answer: permission denied"`) after the request had finished, and
  `AssertionError: expected <p class="_refusal_96f077" …(1)></p> to be null` after the answer was
  stored.
  Two more cases in that commit pin the other side and passed as written, so they have no red: the
  refusal still shows for an open request the page had not read yet, and the question-length
  refusal shows with no request open.
* GREEN (8b4eec4), `npx vitest run test/Workspace.failures.test.tsx test/Workspace.test.tsx test/use-workspace-stream.screen.test.tsx`:
  `Test Files  3 passed (3)` · `Tests  74 passed (74)`.

One step past the fix as the check worded it. The check asked for the Stop line to go when no
request is open. Keyed that way it came back under the next question's request, which never had
Stop pressed on it (the mutation still holds the old error). So it is keyed on the request Stop
was pressed on; the red case asks a second question and holds that no line returns.

**Not done: the empty message column.** The check says it needs PM wording, to be decided at the
preview walk. Nothing was changed. What the code can tell apart, for when the wording comes: no
conversation selected (`?c=` absent or not a uuid); rows still being read; and a uuid whose reads
answered with no rows (a first question always stores its message, so that is an id that does
not exist or is not the owner's).

**The check's probes, run again** on 8b4eec4 (the junction made, the probe config run from `web/`,
the junction removed with `rmdir`; `web/node_modules` intact, worktree clean): 11 of 12 pass. The
one that fails is the first form of the missed-broadcast probe (`probe.test.tsx`, P2). It holds the
request row at `done` while a read of the messages sent after it still returns the unfinished row;
`workspace_finish()` writes both in one transaction, so the database cannot answer that way. The
second form (`probe2.test.tsx`, "events in their real order"), which is the one committed above,
passes, as do both offline probes and the refusal probe.

**Gates** (branch at 8b4eec4, the last commit that changes `web/`), all six run in this order with
nothing under `web/` edited while they ran:

| gate | command | result |
|---|---|---|
| whole suite | `npx vitest run` | `Test Files  147 passed (147)` · `Tests  2728 passed (2728)` · exit 0 |
| types | `npm run typecheck` | exit 0 |
| lint | `npx eslint . --max-warnings 0` | exit 0, no output |
| task 16's row | `npx vitest run test/Workspace.test.tsx test/TopNav.workspace.test.tsx test/workspace-labels.test.ts test/audits.test.ts` | `Test Files  4 passed (4)` · `Tests  70 passed (70)` · exit 0 |
| build | `npm run build` | exit 0; the route list holds `○ /workspace` |
| coverage | `npm run test:coverage` | `Tests  2728 passed (2728)` · exit 0 · all files, lines 91.35 % (floor 83 %) |

2728 = 2720 + 8: `use-workspace-stream.screen` 17 → 18, `Workspace` 34 → 37, `Workspace.failures`
15 → 19. `Workspace.tsx` lines 100 %; `components/workspace/` lines 100 %. No function in the files
changed is over 50 lines (`Thread` 49, `Workspace` 42); the largest file touched is
`test/Workspace.test.tsx`, 658 lines. No new dependency, no new string in `workspace-labels.ts`.

**Still not proven, and one thing left as it was.**

* The screen is still unseen in a browser by me; every line above is from jsdom.
* After Stop, text that arrives in the runner's last seconds is still appended under "You stopped
  this answer." (the check's note 3 leaves that to the PM). The stored row of a stopped answer is
  taken at its `done` broadcast or at the next focus refetch; if that broadcast is missed with the
  tab in front, the page keeps the streamed text under the stopped sentence until then. The state
  and the button are right in that case, so I left it.

---

## Wave 2b

2026-10-06 · branch `feat/workspace-21-web` · scope: every item of ruling U1 in `rulings-4.md`,
nothing else. Fixtures only, as before: no database read or write, no prod change, no docker
command of any kind, no `claude -p`, no secret or env value read.

**First step.** `git fetch origin`, then `git merge origin/feat/workspace-21` → a fast-forward to
37f46cf (the phase branch held this branch's own wave 2 merge, W-64's wave 2 and the 102a commit
that records rulings U1–U4), pushed. Brief 102 was read in full on that commit, with `rulings-3.md`
and `rulings-4.md`.

**Starting count** (37f46cf): `npx vitest run` → `Test Files  147 passed (147)` ·
`Tests  2728 passed (2728)`.

All commands below run from `C:/Users/stack/projects/bb2dash-wt-21-web/web`.

### 1. Ruling U1, item by item

| U1 says | result | commits (red, green) |
|---|---|---|
| the "New conversation" link at the top of the list stays | kept; the label moved among the PM's wording and is held word for word | 1d27422, d2728e5 |
| a claimed request with no text yet shows "Answering…" | confirmed, no change; held by `Workspace.thread.test.ts` ("reads claimed as streaming", line `LATE_STREAM_LINE`) | none |
| after Stop the partial text stays under "You stopped this answer." until the stored row replaces it | confirmed, no change; held by `Workspace.thread.test.ts` ("keeps the partial text under the stopped sentence until the stored row lands") and now on the screen by the after-Stop cases of section 6 | none |
| a `?c=` uuid with no rows says "This conversation was not found." with the "New conversation" link; the composer does not ask into it | done | 1ed32dd, 3b9a14f |
| a 23503 from `workspace_ask` shows the same line; the database's sentence is never shown | done | 1ed32dd, 3b9a14f |
| the empty column's three lines, and the placeholder | done | 1ed32dd, 3b9a14f |
| while a request is open Enter does not send; 23505 stays the backstop and keeps its test | done | ed2580d, 902fd9d |
| the status is re-read at once when a request in view becomes `claimed` and when its first delta arrives | done | 0d9a467, 00c22c6 |
| after Stop on a claimed request the messages are re-read about 3 s and about 10 s after the press | done | cb29832, bff4f3c |
| the screen-reader label before a status line with no answer text is "Status" | done | 515f5f4, 7104bd6 |
| the ten strings W-66 listed are accepted as PM wording; a failed leave is logged, nothing more | the ten are now asserted word for word in `workspace-labels.test.ts`; the leave is untouched | 1d27422, d2728e5 |
| W-66's files beyond the brief's table are accepted | no change | none |

### 2. The strings (`web/src/lib/workspace-labels.ts`)

New, word for word from the ruling: `COLUMN_START_LINE` "Ask a question to start a conversation.",
`COLUMN_LOADING_LINE` "Loading the conversation…" (the one ellipsis character, as "Answering…"
has), `COLUMN_NOT_FOUND_LINE` "This conversation was not found.", `QUESTION_PLACEHOLDER`
"Ask about your courses or your decisions" (no closing stop), `STATUS_ROLE_LABEL` "Status".
`NEW_CONVERSATION_LABEL` moved into the PM's section. The file's last section is now headed
"Accepted as PM wording (ruling U1)".

Check: `npx vitest run test/workspace-labels.test.ts`.

* RED (1d27422): `Test Files  1 failed (1)` · `Tests  4 failed | 27 passed (31)`, first of them
  `AssertionError: expected undefined to be 'Ask a question to start a conversatio…'`.
  The four other new cases passed as written, so they have no red: "New conversation" and the ten
  accepted strings exist already.
* GREEN (d2728e5): `Test Files  1 passed (1)` · `Tests  31 passed (31)`.

The standing cases still hold over the new strings: no `$`, no money word, and no digit outside
"1 to 8000".

### 3. The empty column, an unknown `?c=`, 23503, the placeholder

`emptyColumnOf()` in `thread.ts` (pure) decides one of `start`, `loading`, `missing`, or null;
`MessageList` shows the line in place of the turns; `Workspace.tsx` feeds it and disables the
composer on `missing`.

* **start**: `?c=` absent or not a uuid.
* **loading**: a uuid whose two reads (messages, requests) have not both answered. Before
  hydration the page says this too, so the server never claims "not found".
* **missing**: both reads answered with no rows and no error; or `workspace_ask` answered 23503.
  The line is an alert, and the "New conversation" link (to `/workspace`) sits beside it, in the
  column.
* A read that failed is none of the three: the problem line says
  "Could not load this conversation: <reason>" and the column claims nothing.
* **The composer on `missing`**: the box and the button are disabled, and `ask` itself returns
  early (a key event still reaches a disabled box). What was typed stays in the box.
* **23503**: no problem line is built for it, so the database's sentence has no path to the
  screen. It outranks rows read before the conversation was gone: the turns are replaced by the
  line.
* **The placeholder** is on the box in every state.

Check: `npx vitest run test/Workspace.empty.test.tsx test/Workspace.thread.test.ts test/Workspace.test.tsx test/Workspace.failures.test.tsx test/use-workspace-stream`

* RED (1ed32dd): `Test Files  4 failed | 3 passed (7)` · `Tests  21 failed | 165 passed (186)`.
  `test/Workspace.empty.test.tsx (15 tests | 13 failed)`, for example
  `Unable to find an element with the text: This conversation was not found.` and
  `expected null to be 'loading'`;
  `test/Workspace.thread.test.ts (43 tests | 6 failed)`: `TypeError: emptyColumnOf is not a function`;
  `test/Workspace.test.tsx (37 tests | 1 failed)` and `test/Workspace.failures.test.tsx (19 tests | 1 failed)`:
  the two cases that held the old 23503 wording, turned to the new one.
  The two cases of the new file that passed as written pin the other side: a failed read does not
  say "not found", and a conversation with rows says none of the three.
* GREEN (3b9a14f), same command: `Test Files  7 passed (7)` · `Tests  186 passed (186)`.

**Existing cases changed in the red commit, and why.** Under U1 a uuid with no rows is a
conversation that was not found, so a case that asked into one was asking into a state that
cannot be asked into. Each kept its assertions and gained a seeded, answered conversation:
`Workspace.test.tsx` "asks on Enter…" and "refuses an empty question…";
`Workspace.failures.test.tsx` "says it could not be sent…", "takes a refusal away once the text is
edited", "makes the button wait…", "sends one question for two Enters…" and "still says "still
answering" for an open request this page had not read". All seven passed before the code changed
and after. Two were rewritten because they asserted what U1 forbids: the 23503 case of
`Workspace.test.tsx` (it expected the foreign-key sentence in an alert) and "shows one line when
the read and the question fail for the same reason" in `Workspace.failures.test.tsx`, which is now
"says a failed read in its own words and a missing id in the not-found line, never the foreign-key
sentence". `problemLines` no longer removes duplicates: its three lines have three different
openings, so two can no longer be the same. The harness gained `readGate`, which holds the reads
open for the loading cases; with no gate set a read answers exactly as it did.

### 4. Enter while a request is open

`Composer.tsx`: Enter is still prevented in every state (it never adds a line), and while a
request is open it returns before `ask`. Shift+Enter is the browser's new line, as before.

Check: `npx vitest run test/Workspace.test.tsx test/Workspace.failures.test.tsx`

* RED (ed2580d): `Test Files  1 failed | 1 passed (2)` · `Tests  2 failed | 56 passed (58)`, both
  `AssertionError: expected [ { fn: 'workspace_ask', …(1) } ] to deeply equal []`
  (queued and claimed).
* GREEN (902fd9d), `npx vitest run test/Workspace.test.tsx test/Workspace.failures.test.tsx test/Workspace.empty.test.tsx test/use-workspace-stream`:
  `Test Files  6 passed (6)` · `Tests  145 passed (145)`.

**The 23505 backstop keeps its tests.** The mapping (23505 → "This conversation is still
answering.") is untouched in `queries.workspace.test.ts`. On the screen the refusal used to be
reached by pressing Enter over an open request the page could see, which no longer sends. The
three screen cases now reach it the way the backstop is reached: a second question asked from
another tab, open in the database and not yet read by this page, so the button still reads Ask
and Enter sends. They are "says the conversation is still answering when the database refuses a
second question (23505, the backstop)" in `Workspace.test.tsx`, and "takes "still answering" away
once the answer is stored…" and "still says "still answering" for an open request this page had
not read" in `Workspace.failures.test.tsx`. They pass before and after the change.

### 5. The status, at once, when the service is seen answering

`Workspace.tsx`, `useStatusOnAnswer`: the status query is invalidated when the open request's row
reads `claimed`, and when the followed request's first delta arrives (text from seq 1, or a
stream joined late, whose text is held back). Each is once per request.

Check: `npx vitest run test/Workspace.rereads.test.tsx` (new file; a fake clock, the tab in front).
The scene: one queued question under a heartbeat five minutes old, so the offline line shows; then
the service returns (a current heartbeat, the request claimed).

* RED (0d9a467): `Test Files  1 failed (1)` · `Tests  3 failed | 1 passed (4)`, each
  `AssertionError: expected 1 to be 2`: at 5.2 s (the requests poll has shown the claim) and 100 ms
  after a first delta, the status had still been read once. The fourth case, a request that only
  waits costs no extra read in 20 s, passed as written.
* GREEN (00c22c6), with the screen's other files
  (`test/Workspace.rereads.test.tsx test/Workspace.test.tsx test/Workspace.failures.test.tsx test/Workspace.empty.test.tsx test/use-workspace-stream`):
  `Test Files  7 passed (7)` · `Tests  149 passed (149)`. The offline line is gone at 5.2 s in the
  first case and 100 ms after the delta in the other two, with the status poll not due until 30 s.

The delta cases also hold that the second delta costs no read, that the row on the page still
read `queued` when the delta told it (so it was the delta), and that the claim, seen at the next
poll, is the other moment: one more read and no more.

### 6. The messages, about 3 s and about 10 s after Stop on a claimed request

`Workspace.tsx`, `useStoredRowAfterStop`, called from `useStop`: each Stop pressed on a request
whose row reads `claimed` schedules two reads of the messages (`STOP_REREAD_DELAYS_MS`, 3 000 and
10 000). Leaving the conversation clears what is still to come.

Check: `npx vitest run test/Workspace.rereads.test.tsx`. The scene: an answer being written, one
delta ("Week one: ") on the page, Stop pressed, the cancel answered; then the runner stores
"Week one: Monday" with `error_code` `cancelled`, and its `done` broadcast never arrives.

* RED (cb29832): `Test Files  1 failed (1)` · `Tests  2 failed | 6 passed (8)`:
  `AssertionError: expected 3 to be 4` (no read at 3.1 s) and
  `AssertionError: expected 'Week one: ' to be 'Week one: Monday'` (stored at 6 s, never read).
  Two cases pin the other side and passed as written: Stop on a queued request reads nothing in
  the next 15 s, and unmounting after Stop drops both reads.
* GREEN (bff4f3c), the same seven files as section 5: `Test Files  7 passed (7)` ·
  `Tests  153 passed (153)`. Stored at 2 s: unread at 2.9 s, shown at 3.1 s, one more read at
  10.1 s, none in the minute after. Stored at 6 s: still the partial text at 9.9 s, the stored row
  at 10.1 s. The stopped sentence stays under the text throughout.

This closes the last bullet of section 7 above ("if that broadcast is missed with the tab in
front…").

### 7. The screen-reader label

`MessageList.tsx`, `Answer`: a turn with a line and no text gets `STATUS_ROLE_LABEL`; any turn
with answer text keeps "The assistant answered".

Check: `npx vitest run test/Workspace.test.tsx`

* RED (515f5f4): `Test Files  1 failed (1)` · `Tests  1 failed | 39 passed (40)`,
  `TestingLibraryElementError: Unable to find an element with the text: Status.`
* GREEN (7104bd6), every Workspace file and the audits
  (`npx vitest run test/Workspace test/use-workspace-stream test/workspace-labels.test.ts test/queries.workspace test/TopNav.workspace.test.tsx test/audits.test.ts`):
  `Test Files  13 passed (13)` · `Tests  348 passed (348)`.

The case holds three turns: a queued question ("Status", and no "The assistant answered"), a
stored answer, and a partial answer with its stopped sentence under it (both "The assistant
answered", and no "Status").

### 8. Gates (branch at a8028d4, the last commit that changes `web/`)

a8028d4 is comments only (two notes that said what the page did before U1). All five gates were
run on it in this order, with nothing under `web/` edited while they ran.

| gate | command | result |
|---|---|---|
| whole suite | `npx vitest run` | `Test Files  149 passed (149)` · `Tests  2768 passed (2768)` · exit 0 |
| types | `npm run typecheck` | exit 0 |
| lint | `npx eslint . --max-warnings 0` | exit 0, no output |
| build | `npm run build` | exit 0; `✓ Compiled successfully`; the route list holds `○ /workspace` |
| coverage | `npm run test:coverage` | `Tests  2768 passed (2768)` · exit 0 · all files, lines 91.41 % (floor 83 %) |
| task 16's row | `npx vitest run test/Workspace.test.tsx test/TopNav.workspace.test.tsx test/workspace-labels.test.ts test/audits.test.ts test/use-workspace-stream test/queries.workspace` | `Test Files  9 passed (9)` · `Tests  263 passed (263)` |

**Run again after a second merge.** While the wave ran the phase branch gained two of the PM's
commits (f60a7e9, the regenerated `web/src/lib/supabase/database.types.ts`, and 0efe975, 102a).
They were merged in as 9a23a4a, with no conflict and nothing of W-66's changed, and the five gates
were run again on that commit, in the same order: `npx vitest run` → `Test Files  149 passed (149)`
· `Tests  2768 passed (2768)`, exit 0; `npm run typecheck` exit 0; `npx eslint . --max-warnings 0`
exit 0; `npm run build` exit 0, `○ /workspace`; `npm run test:coverage` exit 0, 2768 passed, all
files lines 91.41 %.

2768 = 2728 + 40: `workspace-labels` 23 → 31, `Workspace.thread` 37 → 43, `Workspace` 37 → 40,
`Workspace.empty` 15 (new), `Workspace.rereads` 8 (new); `Workspace.failures` stays 19 (rewrites).
The four screen files with new cases were run three times in a row: `Tests  82 passed (82)` each
time.

Coverage of what the wave touched: `app/(app)/workspace` lines 100 %; `components/workspace`
lines 100 %; `queries.workspace.ts` lines 100 %. No function in the files changed is over 50 lines
(`Composer` 49, `Thread` 46, `Workspace` 46). The largest file touched is
`test/Workspace.test.tsx`, 725 lines; `Workspace.tsx` is 398. No new dependency. Nothing outside
`web/` and this file changed (`git diff --stat 37f46cf -- . ":(exclude)web"` printed nothing
before this section was written).

### 9. Decisions the ruling does not spell (each is the PM's to overrule)

1. **"The composer does not ask into it"** is built as: the box and the button are disabled.
   The other readings (hide the composer; leave the box live and ignore the send) were not taken.
2. **The "New conversation" link is in the column**, beside the not-found line. The list's own
   link stays, so a not-found page has two links with that name.
3. **Only the not-found line is an alert.** The start and loading lines are plain paragraphs.
4. **"Not found" is said from the saved cache too**: both reads having answered counts whether the
   answer came from the restored cache or the database. I could not find a way for the cache to
   hold "no rows" for a conversation that exists (ids are made by the database, and a first
   question stores its rows with the conversation), so the line does not wait for the fresh read.
5. **Asking is allowed while the rows are still being read.** That is the one way a 23503 is
   reached now, and it then says the not-found line at once.
6. **After a 23503 the line stays until the page leaves that `?c=`**, and the turns read before
   are not shown under it.
7. **Enter over an open request is still prevented**, so it neither sends nor adds a line.
8. **The two status moments are separate**, so one answer can cost two extra status reads (the
   delta, then the claim at the next poll, or the other way round), a reload in the middle of an
   answer included.
   The invalidation cancels a read already in flight and starts another, so the row in hand is
   always from a read begun after the page saw the answer.
9. **Every Stop on a claimed request schedules both reads**; a second press inside ten seconds
   replaces what the first still had to come. They are not skipped when the stored row has already
   landed: two reads of one conversation.
10. **"Status" goes by text, not by state**: a line and no answer text. A turn that shows a tier
    badge and a line but no text is labelled "Status".

### 10. Not done, and not proven

* **The screen is still unseen in a browser by me.** Every line above is from jsdom, the type
  checker and the build. The three lines, the link and the disabled box have their classes from
  existing tokens (`MessageList.module.css` `.empty`, `.emptyLink` composing `btnGhost`); how they
  look is for the preview walk.
* **The two timed behaviours are proven on a fake clock over a fake client**, not against the
  runner: that the runner's heartbeat is current when it claims, and that it stores a stopped
  answer inside ten seconds, are the runner's own (task 21 reads Stop live, "within 10 s").
* **`/code-review` and `/security-review` were not run by me.** The brief gives both to the PM at
  task 23.

### 11. Notes for the PM

* **Two more test files beyond the Files table**: `web/test/Workspace.empty.test.tsx` and
  `web/test/Workspace.rereads.test.tsx`. Putting their 23 cases into `Workspace.test.tsx` would
  have taken it past 800 lines.
* **For `walk21.spec.ts`.** The empty column carries `[data-column-empty]` with `start`, `loading`
  or `missing`. Task 22's `02-empty.png` is described as "an empty message column": with no `?c=`
  that column now reads "Ask a question to start a conversation.", and the box shows its
  placeholder. On a not-found page `getByRole('link', { name: 'New conversation' })` matches two
  links; scope it to the list or to `[data-workspace-stream]`.
* **The acceptance script is not changed by this wave**, but step 8 reads slightly differently on
  the page: after Stop the stored partial answer now arrives within about ten seconds without a
  reload or a return to the tab.

## Review round

2026-10-06 · branch `feat/workspace-21-web` · scope: ruling V4 of `rulings-5.md` in full (CR-8,
CR-9, CR-12), nothing else. CR-10 is recorded by the ruling and not changed. Fixtures only, as
before: no database read or write, no prod change, no docker command of any kind, no `claude -p`,
no secret or env value read.

**First step.** `git fetch origin`, then `git merge origin/feat/workspace-21` → a fast-forward to
e9f0852 (W-65's merge, 102a with the two reviews and rulings V1–V5), pushed. `rulings-5.md` was
read in full, then `rulings-4.md` and `rulings-3.md`, and the findings under "/code-review main
high" and "/security-review" in 102a.

**Starting count** (e9f0852): `npx vitest run` → `Test Files  149 passed (149)` ·
`Tests  2768 passed (2768)`, exit 0.

All commands below run from `C:/Users/stack/projects/bb2dash-wt-21-web/web`.

### 1. Ruling V4, item by item

| V4 says | result | commits (red, green) |
|---|---|---|
| CR-12: one definition of the open states, imported where it is used | done: `WORKSPACE_OPEN_STATES`, written once under `src/`, with a standing audit | aa923d7, bfb1953 (moved to its final file in 69cd76a) |
| CR-8: offline from the server's `polled_age_seconds` plus the local time since that read, on a monotonic clock, never the browser's wall clock | done | e152189, 5e09a3d |
| CR-8: the column is optional; while it is absent the page falls back to today's wall-clock comparison | done: the standing service-line cases, whose rows have no such column, pass unchanged | e152189, 5e09a3d |
| CR-9: the two timers after Stop go | done: `useStoredRowAfterStop`, `STOP_REREAD_DELAYS_MS` and the press counter are removed | d8fd1a5, 69cd76a |
| CR-9: the messages query polls every 5 s while a request is open, and while the followed request's assistant row is unfinished and that request closed less than 60 s ago | done | d8fd1a5, 69cd76a |
| CR-10 is recorded and not changed | not touched | none |

223ef2f is a comment only (the clock module's header).

### 2. CR-12: the open states

The pair `queued`, `claimed` was written out in `queries.workspace.ts` and again in
`components/workspace/thread.ts`. It is now `WORKSPACE_OPEN_STATES`, written once, exported from
the query layer; `thread.ts` imports it. In the CR-9 commit the definition moved, with
`openRequestOf`, into `lib/workspace-poll.ts` (the rule the pair decides) and
`queries.workspace.ts` exports both on, so no importer changed.

Check: `npx vitest run test/queries.workspace.poll.test.ts` (new file). Its audit reads every
Workspace source file under `src/` (the route, `components/workspace/`, `lib/*workspace*`) for the
pair written as an array literal.

* RED (aa923d7): `❯ test/queries.workspace.poll.test.ts (4 tests | 3 failed)`:
  `AssertionError: expected undefined to deeply equal [ 'queued', 'claimed' ]` (no export);
  `expected [ 'queued', 'claimed' ] to deeply equal undefined`; and the audit,
  `expected [ …(2) ] to deeply equal [ 'lib/queries.workspace.ts' ]`, the second being
  `components/workspace/thread.ts`. The fourth case, that the audit finds the files it means to
  read, passed as written.
* GREEN (bfb1953): `Test Files  1 passed (1)` · `Tests  4 passed (4)`; every Workspace file and the
  audits (`npx vitest run test/Workspace test/use-workspace-stream test/queries.workspace test/workspace-labels.test.ts test/TopNav.workspace.test.tsx test/audits.test.ts`):
  `Test Files  14 passed (14)` · `Tests  352 passed (352)`.

Left as it is, on purpose: `web/test/workspace-harness.tsx` keeps its own two-word list. It is the
fake database's rule (what migration 140's `workspace_ask` and `workspace_cancel` check), and a
fake that took its rule from the code under test would agree with a wrong list. The audit reads
`src/` only. `src/lib/queries.sync.ts` names the same two words for `agent_requests`, the sync
queue: another table, not this rule, and not W-66's file.

### 3. CR-8: offline, by the database's count

**What the page does now.**

* `WorkspaceStatus.polled_age_seconds?: number | null` (hand-declared, optional).
  `normalizeStatus` keeps a number that is finite and not negative, keeps null, and leaves the key
  out when the column is absent or its value cannot be read.
* `isWorkspaceOffline(status, nowMs, sinceReadMs = 0)`. With the count: null → offline;
  otherwise `count × 1000 + sinceReadMs > 120 000`. `nowMs` is not read. Without the count: the
  comparison as it was (`polled_at` against `nowMs`), and `sinceReadMs` is not read.
* `lib/workspace-clock.ts` (new): `monotonicNowMs()` is `performance.now()`;
  `useMonotonicNow(tickMs)` is that clock for a render, an external store shaped like
  `use-now.ts` (which is unchanged); `stampRead(row)` and `readAtMs(row)` hold the moment this page
  read a row, beside the row in a `WeakMap`, never in the row. The query cache is saved to
  localStorage, and a monotonic reading means nothing to the next page load.
* `statusOptions()`: the queryFn stamps the row it returns; `structuralSharing: false`, so a read
  that brings an unchanged row is still its own object with its own moment; the view is read
  whole (`select('*')`).
* `ServiceStatus.tsx`: for a counted row, "read how long ago" is the monotonic clock against the
  row's stamp (floor 0); the two-refetch trust window and the offline rule both use it. A counted
  row with no stamp says nothing. For a row without the count, every line is as it was.

**Why the view is read whole.** A select list that names `polled_age_seconds` fails until 143 is
applied (PostgREST answers 42703 for a column that does not exist), and the page would show
"Could not read the service status" on the preview. Read whole, the column is there or it is not.
The view has four columns today and five after 143, none of them one the page must not read, and
`normalizeStatus` keeps only the declared ones (a case holds that).

Check: `npx vitest run test/workspace-clock.test.tsx test/queries.workspace.clock.test.ts test/Workspace.service.test.tsx test/queries.workspace.test.ts`

* RED (e152189): `Test Files  4 failed (4)` · `Tests  5 failed | 80 passed (85)`.
  The two files that import the new module do not load:
  `Error: Failed to resolve import "@/lib/workspace-clock" from "test/queries.workspace.clock.test.ts"`
  and the same from `test/workspace-clock.test.tsx` (`(0 test)` each, so their 30 cases have no
  red of their own).
  `test/Workspace.service.test.tsx (7 tests | 4 failed)`:
  the browser's clock ten minutes ahead, a heartbeat 10 s old →
  `AssertionError: expected <p class="_offline_33c9e2" …(2)></p> to be null` (a running service
  called offline); ten minutes behind, a heartbeat five minutes old →
  `Unable to find an element with the text: The Workspace service is offline.` (a stopped one
  not called so); the same message for a row 100 s old that ages 30 s on the page; and a restored
  row → `expected <p class="_offline_33c9e2" …(2)></p> to be null`.
  `test/queries.workspace.test.ts (78 tests | 1 failed)`:
  `AssertionError: expected [ Array(1) ] to deeply equal [ '*' ]`.
  Three screen cases passed as written and pin the other side: an hour's jump of the system clock
  between two reads does not make a running service offline, a null count reads as never polled,
  and a restored row gives way to what the page's own read brings.
* GREEN (5e09a3d), same command: `Test Files  4 passed (4)` · `Tests  115 passed (115)`
  (10 + 20 + 7 + 78). Every Workspace file with the two clock files
  (`npx vitest run test/Workspace test/use-workspace-stream test/queries.workspace test/workspace-labels.test.ts test/workspace-clock.test.tsx test/TopNav.workspace.test.tsx test/audits.test.ts test/use-now.test.tsx`):
  `Test Files  18 passed (18)` · `Tests  394 passed (394)`.

**Both sides of the apply.** Before 143: the six standing cases of "the service line" in
`Workspace.test.tsx` and the four of `isWorkspaceOffline` in `queries.workspace.test.ts` have rows
without the column; none was edited and all pass. After 143: the new files. The fake timers of
this vitest (5.0.0) move `performance.now()` with the timers, and `vi.setSystemTime()` moves the
wall clock alone; a throwaway probe showed both before any test was written (30 000 ms after
`advanceTimersByTime(30_000)`, unchanged after `setSystemTime(+1 h)`), and
`workspace-clock.test.tsx` now holds the same two facts.

### 4. CR-9: the poll in place of the two timers

**What the page does now.** `lib/workspace-poll.ts` (new) decides whether the messages are polled,
from the rows:

* a request is open (`queued` or `claimed`): every 5 s, as before;
* the newest request has closed and its assistant row is unfinished
  (`unstoredClosedRequestOf`): every 5 s, for 60 s (`WORKSPACE_CLOSED_POLL_MS`) from the moment
  the messages query first saw it so.

`messagesOptions(conversationId, requests)` and `useWorkspaceMessages(conversationId, requests)`
take the conversation's requests in place of the `requestOpen` flag, and `refetchInterval` is a
function of the query. TanStack asks it again after every read, so the poll ends by itself: when
the stored row lands, or when the 60 s have passed. Nothing is armed at the press of Stop, so what
the page held at that moment no longer matters, which was the finding.

Check: `npx vitest run test/queries.workspace.poll.test.ts test/queries.workspace.test.ts test/queries.workspace.hooks.test.tsx test/Workspace.rereads.test.tsx`

* RED (d8fd1a5): `Test Files  3 failed | 1 passed (4)` · `Tests  25 failed | 118 passed (143)`.
  `test/queries.workspace.poll.test.ts (23 tests | 20 failed)`:
  `TypeError: workspace.unstoredClosedRequestOf is not a function` (9 cases),
  `Error: refetchInterval is not a function of the query` (9 cases),
  `AssertionError: expected undefined to be 60000`, and the audit,
  `expected [ 'lib/queries.workspace.ts' ] to deeply equal [ 'lib/workspace-poll.ts' ]`.
  `test/queries.workspace.test.ts (78 tests | 1 failed)`: `expected 5000 to be false`.
  `test/Workspace.rereads.test.tsx (10 tests | 4 failed)`:
  `expected 4 to be 3` (a read at 3 s, where the poll makes none before 5 s);
  `expected 'Week one: ' to be 'Week one: Monday'` (the runner stored at 12 s, after both timers);
  `expected null to be 'Week one: Monday'` (Stop pressed on a row the page still read as
  `queued` while the runner had begun: no timer was armed, the finding's own case);
  `expected 2 to be greater than or equal to 5` (two reads in 30 s, not a poll).
* GREEN (69cd76a), same command: `Test Files  4 passed (4)` · `Tests  143 passed (143)`. The 18
  files of section 3: `Test Files  18 passed (18)` · `Tests  415 passed (415)`.

What the screen cases hold, on a fake clock with the tab in front and the `done` broadcast never
delivered: the partial answer stored 2 s after Stop is unread at 4 s and on the page at the first
poll (5.3 s), with the stopped sentence still under it and the button back to Ask, and a minute on
nothing more was read; stored at 12 s it shows at the third poll; with the row never stored there
are 5 or 6 reads in the first 30 s, 11 to 13 by 70 s, and none in the five minutes after; Stop on
a queued request with no assistant row reads nothing in 15 s; leaving the conversation ends it.

### 5. Existing cases changed, and why

No assertion was loosened. Each change is one the ruling makes necessary.

* `queries.workspace.test.ts`: the status select list is `['*']` where it named four columns
  (CR-8); the row the case expects back is unchanged. The interval case reads `refetchInterval` as
  a function of the query through the file's own `intervalFor`, and expects the same two values,
  5 000 and `false` (CR-9). Fourteen call sites pass `ONE_OPEN` or `NONE_OPEN` (a claimed request,
  or none) where they passed `true` or `false`. The file has 78 cases before and after.
* `queries.workspace.hooks.test.tsx`: two call sites pass `[]` where they passed `false`.
* `Workspace.rereads.test.tsx`, the after-Stop group: the two cases that asserted a read at 3 s
  and one more at 10 s ("two reads, not a poll") are rewritten for the poll, because V4 removes
  what they asserted; two cases are new; "drops both reads when the page leaves the conversation"
  is renamed "stops polling when the page leaves the conversation" with its body unchanged; the
  queued-Stop case is unchanged. The four status cases above them are untouched.
* `workspace-harness.tsx`: the fake's one-row read (`maybeSingle`, the status) now waits on
  `readGate` as its list reads do. The CR-8 screen cases need a status read that does not answer.
  The whole suite passed with it, so no standing case leaned on the gap.

**Ruling U1 after this round.** The item "the messages are re-read about 3 s and about 10 s after
the press" is replaced by V4, as V4 says. Every other item is as wave 2b left it, and its cases
pass unedited: the three lines of the empty column, the not-found line and 23503, the placeholder,
Enter over an open request, the status re-read at a claim and at a first delta
(`Workspace.rereads.test.tsx`, first group, 4 cases), the partial text under the stopped sentence
until the stored row replaces it, and "Status". No string in `workspace-labels.ts` was touched:
`git diff e9f0852 -- web/src/lib/workspace-labels.ts web/test/workspace-labels.test.ts` is empty.

### 6. Gates (branch at 223ef2f, the last commit that changes `web/`)

All five were run on 223ef2f in this order with a clean tree (`git status --short` empty before
and after).

| gate | command | result |
|---|---|---|
| whole suite | `npx vitest run` | `Test Files  153 passed (153)` · `Tests  2830 passed (2830)` · exit 0 |
| types | `npm run typecheck` | exit 0 |
| lint | `npx eslint . --max-warnings 0` | exit 0, no output |
| build | `npm run build` | exit 0; `✓ Compiled successfully`; the route list holds `○ /workspace` |
| coverage | `npm run test:coverage` | `Tests  2830 passed (2830)` · exit 0 · all files, lines 91.46 % (floor 83 %) |

2830 = 2768 + 62: `queries.workspace.poll` 23 (new), `queries.workspace.clock` 20 (new),
`workspace-clock` 10 (new), `Workspace.service` 7 (new), `Workspace.rereads` 8 → 10. The six timed
files (`Workspace.rereads`, `Workspace.service`, `queries.workspace.poll`, `queries.workspace.clock`,
`workspace-clock`, `Workspace.test.tsx`) were run three times in a row: `Tests  110 passed (110)`
each time.

Coverage of what the round touched: `workspace-clock.ts`, `workspace-poll.ts` and
`ServiceStatus.tsx` are not in the report's table, which lists only files with something
uncovered; `queries.workspace.ts`, `Workspace.tsx` and `thread.ts` read lines 100 %.

Sizes: the largest file of W-66's is `web/src/lib/queries.workspace.ts`, 789 lines (734 before the
round); `web/test/queries.workspace.test.ts` 774; `web/test/Workspace.test.tsx` 725 (untouched).
The new files: `workspace-poll.ts` 110, `workspace-clock.ts` 89, `queries.workspace.poll.test.ts`
308, `queries.workspace.clock.test.ts` 219, `Workspace.service.test.tsx` 176,
`workspace-clock.test.tsx` 122. No function is over 50 lines. No new dependency. Nothing outside
`web/` and this file changed: `git diff --stat e9f0852 HEAD -- . ":(exclude)web"` printed nothing
before this section was written.

### 7. Decisions the ruling does not spell (each is the PM's to overrule)

1. **The 60 s are counted from the moment this page first saw the request closed with its row
   unfinished, on the page's monotonic clock.** The ruling says "closed less than 60 s ago". The
   one timestamp of the close is `finished_at`, the database's, and setting it beside the
   browser's clock is the fault CR-8 names: a laptop a minute ahead would never poll, one an hour
   behind would poll for an hour. So `finished_at` is not read (a case holds that a close stamped
   ten minutes either side of the browser's clock polls the same). What differs from the literal
   reading: a page opened on a conversation whose last request closed long ago with its row still
   unfinished polls for 60 s (12 reads) and stops, where the literal reading would not poll at
   all. Once per conversation per page load.
2. **"Its assistant row is unfinished" means a row exists and is unfinished.** A closed request
   with no assistant row is not polled for: `workspace_begin()` is refused once a request is no
   longer claimed, so no row can follow. This keeps U1's "Stop on a queued request reads nothing".
3. **The status view is read whole** (`select('*')`), for the reason in section 3. The module's
   header said every select list names its columns; it now says the three tables' lists do.
4. **A counted row this page did not read itself says nothing**, online or offline, until the
   page's own read answers (a mount sends it at once). The saved cache restores such rows, and
   there is no monotonic measure of how long ago another page load read one. Before 143 the
   restored row speaks as it did (within two refetch intervals by the wall clock), because that
   is "today's comparison".
5. **A count that cannot be read** (a string, a negative number, not finite) is treated as an
   absent column, so the page falls back to `polled_at`, rather than as "never polled".
6. **`messagesOptions` and `useWorkspaceMessages` changed their second argument** from a flag to
   the conversation's requests. Both are W-66's and have one caller in `src/`.
7. **`useStoredRowOnClose` stays.** It reads the messages once when a request stops being the open
   one. The new poll runs only for an assistant row the page already holds unfinished; an answer
   begun and finished between two polls is read by that hook.
8. **The poll's 60 s belong to the messages query of one conversation and to one request.** A
   later request stopped in the same conversation starts its own; a system clock that jumps
   neither ends nor extends it.

### 8. Not done, and not proven

* **Nothing here ran against the database.** Migration 143 is not on this branch and not applied.
  The column's name, type and null rule are taken from ruling V3 word for word; if W-63's view
  differs (another name, a `numeric`, an interval), the page falls back to the wall clock
  silently, which is the old fault. One `select polled_age_seconds from v_workspace_status` after
  the apply settles it.
* **That a named column fails before the apply (42703) is PostgREST's documented behaviour, not a
  run of mine**, and so is "read whole, a new column simply appears". The preview walk on both
  sides of the apply is the proof.
* **The screen is still unseen in a browser by me.** Every line above is from jsdom, the type
  checker and the build.
* **`performance.now()` in a real browser.** Some browsers do not advance it while the machine
  sleeps. After a wake the row in hand can then look fresher than it is until the next read (the
  status is re-read every 30 s and on a return to the tab), so the line can be up to one read
  late. The wall clock had the opposite fault. Not exercised.
* **The first frame after the screen remounts** reads the clock store's last tick, as `useNow`
  does: the store re-reads at subscribe. Same as before the round, for both clocks.
* **`/code-review` and `/security-review` were not run by me.** The second run on the delta is the
  PM's.

### 9. Notes for the PM

* **Six files beyond the brief's table**: `web/src/lib/workspace-clock.ts`,
  `web/src/lib/workspace-poll.ts`, `web/test/workspace-clock.test.tsx`,
  `web/test/queries.workspace.clock.test.ts`, `web/test/queries.workspace.poll.test.ts`,
  `web/test/Workspace.service.test.tsx`. The two source files exist because
  `queries.workspace.ts` had 66 lines of room and the round needed more; the four test files
  because `queries.workspace.test.ts` (774) and `Workspace.test.tsx` (725) had none.
* **`queries.workspace.ts` is at 789 of 800 lines.** Its next change should split it; the input
  validation block (about 130 lines, no dependency on the rest) is the clean cut.
* **For W-63.** The page takes `polled_age_seconds` as a JSON number, zero or more, or null.
* **For the brief.** Two sentences of 102 now describe the page before this round: the offline
  bullet ("reads the clock through `useNow(30_000)`": true only while the column is absent) and
  U1's 3 s and 10 s. They are the PM's to change.
* **For the acceptance script.** Step 8: after Stop the stored partial answer shows at the first
  5 s poll after the runner stores it. Step 14 (offline within three minutes) is unchanged in
  time: 120 s plus one tick of 30 s at most.
* **A later cleanup, not this phase's.** Once 143 is applied everywhere the page runs, the
  wall-clock branch of `isWorkspaceOffline`, the `now` prop of `ServiceStatus` and the fallback in
  `sinceRead` can go.
