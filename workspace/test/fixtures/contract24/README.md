# contract24: the frozen shapes of Phase 24a

The PM's folder (brief 109, task 12, "Seam inside the phase"). Two workers who meet at a call find
its shape here. Nobody answers a worker mid-run, so a worker never edits a file in this folder: it
builds to the file, and where a file and the brief differ it says so in its verification section and
takes the file. All text here is synthetic.

`workspace/test/probe24-fixtures.test.ts` (the PM's) checks that the nineteen JSON files parse and
that the three text files and the routine seed are there.

## The files

A file is either one sample of one shape, or a wrapper that holds a call's two sides.

| file | holds | met by |
|---|---|---|
| `plan.json` | the planning turn's output, one object | W-77 |
| `batch-request.json`, `batch-answer.json` | the batch child's stdin and stdout, one object each | W-77, W-78 |
| `claim-v2.json` | one row of `workspace_claim_v2` | W-76, W-77 |
| `turn-context.json` | the jsonb `workspace_turn_context` returns | W-76, W-77 |
| `turn-put.json` | `{p_facts, p_sources}`: the two jsonb arguments of `workspace_turn_put` | W-76, W-77 |
| `planner-feed.json` | the jsonb `workspace_planner_feed` returns | W-76, W-77 |
| `job-claim.json` | the jsonb `workspace_job_claim` returns | W-76, W-77 |
| `job-finish.json` | `{args, returns}` of `workspace_job_finish` | W-76, W-77 |
| `search-row.json` | one row of `workspace_search` | W-76, W-78 |
| `attachment-read.json` | the jsonb `workspace_attachment_read` returns | W-76, W-78 |
| `ingest-claim.json`, `ingest-put-text.json`, `ingest-finish.json`, `ingest-heartbeat.json` | `{args, returns}` of each ingest function | W-76, W-79 |
| `embed.json` | `{body, answer}` of the edge function `workspace-embed` | W-78, W-79 |
| `search-function.json` | `{body, answer}` of the edge function `workspace-search` | W-77, W-78 |
| `ask-options.json` | the jsonb `workspace_ask_with` takes | W-76, 24b |
| `sources-event.json` | the payload of the Realtime event `sources` | W-77, 24b |
| `feed-block.txt` | `planner-feed.json` as the prompt holds it, between the block's two lines | W-77 |
| `fence.txt` | the two block lines | W-77 |
| `lines.txt` | the fixed sentences of `lines.ts`, `key: sentence` | W-77, 24b |
| `seed/routines.json` | the six rows of `workspace_routines`, wording included | W-76 |
| `probes/` | the scrubbed recordings of probes P-1 to P-6 and the planning prompt's draft | W-77 reads them |

"Exactly the keys" (brief 109, tasks 19 and 23) means the top-level keys of the sample, and the keys
of each object inside an array of it. Files are LF (`.gitattributes`). A test that compares text with
a `.txt` file compares it byte for byte with the file's one final newline taken off.

## SQL signatures

Every SECURITY DEFINER function is `language plpgsql security definer set search_path = public,
pg_temp`, revokes `public, anon, authenticated, service_role` and is granted to the one role named
(142's form). A bigint travels as a JSON number inside jsonb. A refusal is SQLSTATE 22023 unless a
row says otherwise.

### The browser's four (190, 194). Definer, granted to `authenticated`, owner check first (42501)

```
workspace_upload_register(p_sha256 text, p_title text, p_mime text, p_byte_size bigint,
                          p_signed_url text, p_signed_url_expires_at timestamptz,
                          p_course_id text default null) returns jsonb
  -- {"id": <bigint>, "state": <text>, "existing": <boolean>}
  -- storage_key is made inside: 'u/' || p_sha256. An upload row that already holds the hash, in any
  -- state: nothing is written, its id and state come back with existing true.
  -- 23514: a hash that is not 64 lower-case hex characters; a mime outside the six; a size under 1 or
  -- over 20971520; a title under 1 or over 200 characters; a signed URL that is not
  -- https://goultdzqcavefcgnifdy.supabase.co/storage/v1/object/sign/workspace-uploads/<storage_key>?<query>.
  -- 23503: an unknown p_course_id.
workspace_upload_retry(p_document_id bigint, p_signed_url text, p_signed_url_expires_at timestamptz)
  returns jsonb
  -- {"id", "state"}. Only a `failed` upload: it goes back to `stored` with attempts 0, error_code null
  -- and the new link. 22023 for any other row; 23514 for a link of the wrong shape.
workspace_document_delete(p_document_id bigint, p_object_removed boolean) returns jsonb
  -- {"id", "kind", "state", "storage_key"}. state is 'deleting' or 'deleted'; storage_key is null for
  -- a memory item. false: an upload's units and vectors go, signed_url is cleared, the row stays in
  -- `deleting` (repeatable, same key back). A memory item goes whole at once, memory_opt_out is set,
  -- state 'deleted'. true: drops a row in `deleting`; 22023 for a row in any other state.
workspace_ask_with(p_conversation_id uuid, p_text text, p_options jsonb) returns jsonb
  -- {"conversation_id", "message_id", "request_id"}, as workspace_ask. p_options is ask-options.json;
  -- every key is optional and null means absent. Attachments are numbered files first, in array
  -- order, then uploads, in array order. 23503: an unknown routine, file id or upload id. 23514: a bad
  -- depth or format, an unknown course display id, a key that is not one of the six, more than five
  -- attachments, an upload in `deleting`, a routine whose `needs` is not met (`file`: at least one
  -- attachment; `course_or_file`: a course or an attachment).
```

The six mime types, and the extension the ingest worker names its temp file by:
`application/pdf` (.pdf),
`application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx),
`application/vnd.openxmlformats-officedocument.presentationml.presentation` (.pptx),
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (.xlsx),
`text/plain` (.txt), `text/markdown` (.md).

### The store's reads (192). Invoker, granted to `service_role` only

```
workspace_search(p_q text, p_query_embedding extensions.vector,
                 p_kinds text[] default array['material','upload','memory'],
                 p_courses text[] default null, p_limit integer default 10,
                 p_min_similarity double precision default null,
                 p_model text default 'gte-small')
  returns table (kind text, unit_id bigint, file_id bigint, document_id bigint, course_id text,
                 title text, unit_kind text, unit_no integer, part_no integer,
                 similarity double precision, score double precision, passage text,
                 has_notes boolean)
  -- search-row.json. unit_id is bb_file_text.id for `material` (file_id set, document_id null) and
  -- workspace_document_text.id for `upload` and `memory` (document_id set, file_id null). title is
  -- the file's name, the upload's title or the remembered item's title. passage is at most 2,000
  -- characters of the matched part. p_limit is a kind's limit: at most p_limit rows of each kind
  -- named, best first (by similarity, highest first; a row with no similarity after those, by
  -- score). p_courses null: no course filter. With courses: course materials of those
  -- course ids, uploads tagged with one of them or with none, and every remembered item.
workspace_attachment_read(p_kind text, p_id bigint, p_max_chars integer) returns jsonb
  -- attachment-read.json. p_kind 'file' (p_id is bb_files.id) or 'upload' (workspace_documents.id).
  -- Units in order (unit_kind, unit_no), whole units only, until the next unit would pass
  -- p_max_chars; the first unit is cut to p_max_chars when it alone is longer. state: 'read' (every
  -- unit), 'cut', 'no_text' (the file or upload has no unit), 'not_ready' (an upload in `stored` or
  -- `reading`), 'failed' (an upload in `failed`), 'missing' (no such row, or an upload in
  -- `deleting`). left_out_unit_ids: the ids of the units not returned, at most 40, in order. Every
  -- key is present in every state; a missing row has title and course_id null and the counts 0.
```

### The ingest worker's four (193). Definer, granted to `workspace_ingest_runner`

```
workspace_ingest_claim(p_runner text) returns jsonb          -- null when there is nothing to hand out
  -- ingest-claim.json. One document at a time: null while p_runner holds one inside its 10-minute
  -- lease. step 'read': an upload in `stored`, or in `reading` with an expired lease; it is now in
  -- `reading`. step 'embed': a document in `text_ready` (an upload whose units are put, or a
  -- remembered item); it stays `text_ready`. A remembered item has kind 'memory' and null mime,
  -- byte_size, sha256, signed_url and signed_url_expires_at.
workspace_ingest_put_text(p_runner text, p_document_id bigint, p_units jsonb) returns integer
  -- p_units: [{"unit_kind", "unit_no", "text"}], 1 to 1,000 units, no empty text. Replaces the
  -- document's units and their vectors in one transaction; the row goes to `text_ready`. Returns the
  -- count stored. 22023 for a document p_runner does not hold, or one not in `reading`.
workspace_ingest_finish(p_runner text, p_document_id bigint, p_outcome text, p_error_code text)
  returns text                                               -- the row's state after the call
  -- p_outcome 'indexed': refused (22023) unless the document has a unit and every unit has its
  -- embedded_at. 'failed': the row ends `failed` with p_error_code, one of the ten codes. 'retry': a
  -- try that may be made again; attempts goes up by one and the row goes back to `stored` (from
  -- `reading`) or stays `text_ready`, and on the third it ends `failed` with p_error_code instead.
  -- Every outcome frees the lease; 'indexed' and a `failed` end clear signed_url.
workspace_ingest_heartbeat(p_runner text) returns void
```

The ten error codes of a failed document: `too_large`, `bad_type`, `bad_bytes`, `no_text`,
`extract_timeout`, `extract_failed`, `too_many_units`, `link_expired`, `download_failed`,
`embed_failed`.

### The runner's six (196). Definer, granted to `workspace_runner`

```
workspace_claim_v2(p_runner text)
  returns table (request_id bigint, conversation_id uuid, user_message_id uuid, prompt text)
  -- claim-v2.json; zero rows when nothing is handed out.
workspace_turn_context(p_request_id bigint, p_runner text) returns jsonb
  -- turn-context.json. options is never null: a request with no options row gets
  -- {"depth":"auto","format":"plain","routine_id":null,"course_display_id":null,"course_ids":null}.
  -- routine is null when none. An attachment's state: for a file 'ready' (it has a unit), 'no_text' or
  -- 'missing'; for an upload its document's state, or 'missing'. messages: the conversation's
  -- finished messages before this request's own question and after summarised_through, taken newest
  -- first until 200,000 bytes or 60 messages are passed, handed over oldest first;
  -- messages_left_out counts the rest. last_auto_tier: the tier of the newest answer whose request
  -- had depth auto or no options row, or null.
workspace_turn_put(p_request_id bigint, p_runner text, p_facts jsonb, p_sources jsonb)
  returns integer                                             -- source rows kept by this call
  -- turn-put.json. First call, before the answering turn: p_facts not null; writes the
  -- workspace_turns row and the sources, and sends the event `sources`. Second call, before finish:
  -- p_facts null; appends sources of origin 'tool' after the rows that are there. A second call
  -- with p_facts not null replaces the facts and sends no second event. Row order is array order.
  -- A row whose id is not found is dropped; a row past the 40th is cut.
workspace_planner_feed(p_request_id bigint, p_runner text, p_from date, p_to date) returns jsonb
  -- planner-feed.json. from and to are the window after the clamp. work_more and scores_more count
  -- the rows past the 60 of each part.
workspace_job_claim(p_runner text, p_kinds text[]) returns jsonb   -- null when there is no job
  -- job-claim.json, the same keys for both kinds. 'rolling': messages are the ones the summary is
  -- to take in (older than the newest 14,000 bytes, newer than summarised_through), previous_summary
  -- the rolling summary so far or null, through the created_at of the last of them. 'memory':
  -- messages are the conversation's finished messages, newest 60,000 bytes at most, oldest first;
  -- previous_summary null; through the created_at of the last.
workspace_job_finish(p_runner text, p_conversation_id uuid, p_kind text, p_outcome text,
                     p_summary text, p_through timestamptz) returns jsonb
  -- job-finish.json. p_outcome 'done' (p_summary required: 3,000 characters at most for rolling,
  -- 1,000 for memory), 'failed' (job_failures goes up by one) or 'released' (a claim cut the job
  -- short: no failure is counted). Every outcome frees the lease. returns
  -- {"stored": <boolean>, "document_id": <bigint or null>}: stored is false when the summary equals
  -- the one that is there; document_id is the remembered item's, null for rolling.
```

`workspace_sources`, by kind and origin (turn-put.json holds one row of each):

| kind, origin | ids that are set |
|---|---|
| `material` or `upload` or `memory`, `auto` | a passage of the prompt: `file_id` and `text_id`, or `document_id` and `doc_text_id` |
| `feed`, `auto` | none; one row whenever the feed block is in the prompt |
| `material` or `upload`, `attached` | one row for each attached file that was read, whole or in part: `file_id` or `document_id`, no unit id |
| `material`, `tool` | a unit the model opened: `text_id` from the call's input; the function fills `file_id`, `course_id`, `unit_kind`, `unit_no` and `title` from the unit's row |

## Labels, and what a label resolves to

`[M<n>]`: `workspace_sources.text_id = n`. `[U<n>]`: `doc_text_id = n` of kind `upload`. `[R<n>]`:
`document_id = n` of kind `memory`, the remembered item's own id. `[P]`: the row of kind `feed`. An
attached file's block carries no label: the model names an attached file and its page, slide or
sheet in words, under both format rules.

## The fence

`fence.txt` holds the two block lines with three places to fill: `{marker}` is the turn's 16 hex
characters; `{kind}` is one of `passage`, `memory`, `attachment`, `summary`, `feed`, `turn`;
`{label}` is the block's label, or `-` for a block with none. The opening characters of a block line
are `<<<block`. The two-character prefix a line of data gets is `> ` (a greater-than sign and a
space).

## The feed block

`feed-block.txt` is `planner-feed.json` rendered: the lines between the block's two lines. Two fixed
lines, the work header and its rows, the scores header and its rows, and the left-out line, which is
always there. A work row's kind is `A` or `R`. A due time is New York wall clock,
`YYYY-MM-DD HH:MM`; a row with no due time shows its date; an undated row shows `-`. A date seen is
the New York date. A null is `-`, true and false are `Y` and `N`, a number is printed as the jsonb
holds it. Every value is one line; ` | ` inside a value is written ` / `; a title or a name is cut
to 120 characters.

## The batch child

`node /app/mcp-materials/dist/batch.js`, started with the two environment values the materials
server gets. One JSON object in on stdin (`batch-request.json`), one out on stdout
(`batch-answer.json`), nothing else printed. A query's state is `ok`, `refused` (the search function
answered 4xx) or `failed` (anything else, its 8 s limit included); `ok` is true for `ok` alone.
`courses` null means no course filter. Each attachment comes back as `workspace_attachment_read`
returned it. Exit 0 whenever the object was written, whatever the states inside; non-zero only when
no object could be written (bad stdin, bad configuration).

## The two edge functions

`workspace-search`: POST, `verify_jwt` on, the caller's bearer forwarded. Body keys: `q` (required,
cut to 2,000 characters), `kinds`, `courses`, `limit` (1 to 50), `min_similarity`. 400 with
`{"error"}` for a bad body; 403 with `{"error", "code"}` when the database refuses the caller (42501).

`workspace-embed`: POST, `verify_jwt` on. `document_id` is required (400 without it). An entry of
`failed` is `{"text_id": <bigint>, "error": <text>}`.

## Paths and environment names

`/app/workspace/`, `/app/mcp-materials/dist/index.js`, `/app/mcp-materials/dist/batch.js`,
`/run/workspace/mcp-<request id>.json`, `/run/workspace/mcp-none.json`.

`BB2DASH_MAX_SEARCHES`, `BB2DASH_MAX_READS`: whole numbers; unset means no limit, as today. A call
past its limit is an error result (`isError`), never a protocol error: probe P-6 showed the turn
goes on. `BB2DASH_COURSES`: course ids separated by commas; unset or empty means no scope.
`WORKSPACE_MEMORY_JOBS`: `on` or `off`; anything else is `off`.

## Rulings from the probes that a worker meets (109c has the lines)

* **A planning, summary or rolling turn runs with `MAX_THINKING_TOKENS=0` in the child's
  environment**, added on top of what `childEnv` returns. With thinking left on, a planning turn
  spent about 850 thinking tokens and 9 s; with it off, 1.8 s at the median over 20 questions
  (P-4). The answering turn's environment is unchanged.
* **A plan is the object alone, or the object inside one Markdown code fence.** Every planning
  answer recorded on the pinned CLI came inside a fence, whatever the prompt said. Anything else
  is the fallback plan. `--json-schema` is not used: it makes the CLI call a tool of its own,
  `StructuredOutput`, which the gate denies.
* **The parser runs in its own service, `workspace-extract`** (P-10: this Docker ignores a file
  secret's mode and owner). `probes/plan.draft.md` is the planning prompt the 20 questions were
  asked with; W-77 starts `prompts/plan.md` from it.
