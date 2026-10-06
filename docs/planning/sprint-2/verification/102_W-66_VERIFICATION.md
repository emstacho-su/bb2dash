# 102 — W-66 verification note (Phase 21, the web stream)

Worker W-66 · branch `feat/workspace-21-web` · worktree `bb2dash-wt-21-web`. Owns the "W-66" row of
brief 102 §Workers. Wave 1 tasks: **15** (query layer) and **4** (stream hook and route skeleton).
Task 16 (the screen and the nav link) waits for the Realtime spike (task 5) and is not started.

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
