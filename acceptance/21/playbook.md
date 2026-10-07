# Phase 21 (the Workspace): what each step must show

This file is for the Claude operator of an acceptance run (`acceptance/OPERATOR.md` holds the
general rules). The host sends the operator one `## Stage:` section at a time, with nothing above
or below it, so each section stands by itself. It holds no course text: this repository is public.

The Workspace is a chat page of the app. A question is typed into a box and sent with the Ask
button; the answer is written under it while the reader watches. Each answer carries a badge that
names the model level that wrote it, and a line that starts "Used:" and names the tools it used.

## Stage: walk

The Workspace service is running. This stage asks seven questions of the live assistant, three of
them at the most expensive level, so run each title once and in this order. Step 3 starts one
conversation and every later step asks into it: if step 3 did not leave a `conversation_id` in
`3.json`, mark steps 4 to 9 `blocked`, waiting on step 3.

### Step 2: `2 open`

It opens the home page and goes to the Workspace by the link in the top bar. It asks nothing.

Pass when all of this is true:

- `2-open.png` shows the Workspace page: the top bar with Workspace marked as the current page, a
  list of conversations on one side, an empty message column with one line that says how to start,
  a question box and a button that reads Ask.
- The picture shows no line that says the service is offline.
- In `2.json`: `path` is `/workspace`, `channel` is `joined`, `offline_line_shown` is false.

The list may hold any number of conversations. That is not a fault.

### Steps 3 to 7: five questions

Each of these asks one question, waits for the whole answer and takes two pictures: `<step>-end.png`
is the window as the reader had it when the answer finished, with the end of the answer and its
"Used:" line; `<step>-start.png` is the same conversation scrolled to the start of the turn, with
the question and the badge.

For each of the five, pass when all of this is true:

- In the facts: `state` is `done`, `line` is null, `answer_chars` is well above zero, and `badge`
  and `used` read as the table below says.
- The start picture shows the question and, above the answer, the badge with the same words.
- The end picture shows the end of an answer. When the facts hold a `used` line, the picture shows
  that line too, whole, under the answer.
- The answer reads as an answer to a question about course work or about the owner's own decisions:
  plain text, not an error, not empty, not cut off mid-word at the end.

| step | title | `badge` must read | `used` must name |
|---|---|---|---|
| 3 | `3 lookup haiku` | "Haiku · lookup" | `search_materials` |
| 4 | `4 decision haiku` | "Haiku · lookup" | `search_context · bb2dash-inbox-decisions` |
| 5 | `5 document haiku` | "Haiku · lookup" | `get_material_text` |
| 6 | `6 standard sonnet` | "Sonnet · standard" | nothing in particular; it may be absent |
| 7 | `7 deep opus` | "Opus · deep work" | nothing in particular; it may be absent |

A `used` line may name more tools than the table does, and may add a course or a collection after a
tool's name. That is fine as long as the named tool is there.

Step 3 has one more condition, and only you can judge it. The question asks what a syllabus says,
and **the answer must name the file it read**: a document's own file name, such as a name ending in
`.pdf`, `.docx` or `.pptx`, not only the course or the topic. Read `answer` in `3.json`. `names_file`
is a hint from a simple pattern, not the verdict. If the answer names no file, step 3 is a `fail`.
In `saw`, say that it named a file; do not copy the name of the file or the words of the answer.

If a badge reads a different level from the table (for example Sonnet where Haiku is expected), the
step is a `fail`: which level answers which kind of question is what these steps are for.

### Step 8: `8 stopped`

It asks the step 7 question again and presses Stop while the answer is being written.

Pass when all of this is true:

- In `8.json`: `state` is `stopped`, `line` is "You stopped this answer.", `answer_chars` is above
  zero (part of an answer was written before the stop), `badge` is "Opus · deep work", and
  `stopped_sentence_in_view` is true.
- `8-stopped.png` shows a partly written answer with the sentence "You stopped this answer." under
  it, and the button reads Ask again, not Stop.

If the test failed with a message that begins `inconclusive:`, the answer was finished before Stop
could be pressed. Run the title one more time, and record the second run. If the second run says
the same, the verdict is `unsure`.

### Step 9: `9 reload mid-answer`

It asks the same question a third time and reloads the page as soon as answer text is being
written. A reloaded page cannot show the half-written text, so it must say "Answering…" in its
place until the answer is finished, and then show the finished answer.

Pass when all of this is true:

- In `9.json`: `state_after_reload` is `streaming`, `line_after_reload` is "Answering…",
  `text_chars_after_reload` is 0, `answering_looks` is 1 or more, `ended_as` is `done`; and at the
  end `state` is `done`, `line` is null, `badge` is "Opus · deep work" and `answer_chars` is well
  above zero.
- `9-reloaded.png` shows the question with the line "Answering…" under it and no answer text for
  that question.
- `9-end.png` shows the end of the finished answer.

If the test failed with a message that begins `inconclusive:`, the page did nothing wrong: the
answer was over before the reload, or before the reloaded page could be recorded. Run the title one
more time, and record the second run. If the second run is inconclusive too, the verdict is
`unsure`.

## Stage: offline

The host has just stopped the Workspace service. Within three minutes of the stop the page must
say so, and a question asked meanwhile must wait instead of failing. `ACCEPT_DEADLINE` holds the
end of those three minutes. Time matters in this stage: start the test at once, before anything
else.

### Step 14a: `14a offline`

It opens the run's conversation, waits for the page to say the service is offline, then asks one
question and watches it for a quarter of a minute.

Pass when all of this is true:

- In `14a.json`: `offline_line` is "The Workspace service is offline.", `offline_seen_at` is earlier
  than `deadline`, `state` is `queued`, `line` is "Waiting for the Workspace service", and
  `still_queued_at` is there.
- `14a-offline.png` shows the line "The Workspace service is offline." under the question box.
- `14a-queued.png` shows the new question at the end of the conversation with the line "Waiting for
  the Workspace service" under it, and no answer and no error under it.

Three cases are not the product's fault, and none of them is run a second time:

- The test failed with a message that begins `inconclusive: the page opened after the deadline`.
  The stage started too late to judge. The verdict is `blocked`.
- The test failed because the carry-over holds no conversation (the message names `carry.json`).
  The verdict is `blocked`.
- `ACCEPT_DEADLINE` is not set. The verdict is `blocked`.

If the page was open in time and the offline line did not show before the deadline, that is a
`fail`.

## Stage: back

The host has started the Workspace service again. The question that waited in the last stage must
now be answered, and then the run tidies up after itself through the page.

### Step 14b: `14b back`

It opens the run's conversation, finds the question that was asked while the service was stopped
and waits for its answer. It asks nothing new. The answer may already be there when the page opens.

Pass when all of this is true:

- In `14b.json`: `state` is `done`, `line` is null, `badge` names a model level, `answer_chars` is
  well above zero, and `offline_line_shown` is false.
- `14b-start.png` shows that question with a badge above its answer, and `14b-end.png` shows the
  end of the answer.
- Neither picture shows a line that says the service is offline.

Any of the three badges is right here: the step asks for an answer, not for a level.

If the test failed because the carry-over holds no request or no conversation (the message names
`carry.json`), the verdict is `blocked`, and step 15 is `blocked` too.

### Step 15: `15 archive`

It archives two things with the list's own Archive button: the conversation titled `spike`, which
is left from the phase's first trial, and the run's own conversation. It deletes nothing; an
archived conversation is still there under "Show archived".

Pass when all of this is true:

- In `15.json`: `archived_ids` holds every id of `own_ids` and of `spike_ids`, `archive_writes`
  equals the number of ids in `archived_ids`, and `spike_archived_rows` is 1 or more.
- `15-before.png` shows the list before anything was archived.
- `15-after.png` shows the list afterwards: no row titled `spike`, and fewer rows than before.
- `15-archived.png` shows the list with "Show archived" ticked: the archived conversations are
  there, each with a button that reads Unarchive, and one of them is titled `spike`.

If `spike_was_already_archived` is true, an earlier run had archived it. That is not a fault: the
step still passes when everything else holds, and you say so in `saw`.

If rows other than these are still listed afterwards, the step still passes; name the number left
in `notes`, because a list that is not empty may be a leftover of an earlier run.
