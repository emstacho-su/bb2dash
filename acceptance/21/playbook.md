# Phase 21 (the Workspace): what each step must show

This file is for the Claude operator of an acceptance run (`acceptance/OPERATOR.md` holds the
general rules). The host sends the operator one `## Stage:` section at a time, with nothing above
or below that section. So each section stands by itself, and these opening paragraphs never reach
the operator. This file holds no course text: this repository is public.

How a section writes a text of the page is a rule of `acceptance/README.md`: in code marks,
exactly as the page has it. `node --test acceptance/acceptance.test.mjs` holds each such text
against the app's own strings.

## Stage: walk

The page under test is the Workspace, a chat page of the app. On the left of the page is the list
of conversations. To the right of the list is the message column, which holds the questions of one
conversation, each question followed by its answer. Under the message column is the question box,
and to the right of the question box is one button. That button reads `Ask`; while an answer is
being written, the same button reads `Stop`. A question is typed into the question box and sent
with that button. An answer carries a badge above its text, which names the model level that wrote
the answer. Under its text an answer may carry a line that starts `Used:` and names the tools the
answer used.

The Workspace service, the program that writes the answers, is running. This stage asks the live
assistant seven questions, three of them at the most expensive level. Run each title one time, in
the order of your list of titles. A title is run a second time only where the operator's rules on
a second run allow it.

Step 3 starts one conversation, and each of steps 4 to 9 asks its question into that conversation.
If `3.json` holds no `conversation_id`, do not run the titles of steps 4 to 9: give each of those
six steps the verdict `blocked`, and say in its `saw` that it waited on step 3.

### Step 2: `2 open`

The test opens the app's home page and follows the link in the top bar that reads `Workspace`. It
asks no question.

Pass when all of this is true:

- `2-open.png` shows the Workspace page with no conversation open:
  - in the top bar, the link that reads `Workspace` is drawn in a different colour from the other
    links of the top bar and has a line under it, and no other link of the top bar has a line
    under it;
  - on the left, a heading that reads `Conversations`, with the list of conversations under it;
  - the message column holds one line, which reads `Ask a question to start a conversation.`, and
    nothing else;
  - under the message column, the question box, and to the right of the question box the button,
    which reads `Ask`.
- Nowhere in `2-open.png` is there a line that reads `The Workspace service is offline.`
- In `2.json`: `path` is `/workspace`, `channel` is `joined`, `offline_line_shown` is false.

The list may hold any number of conversations, or none. That is not a fault.

### Steps 3 to 7: five questions

Each of these five tests asks one question, waits until the answer is finished and takes two
pictures. `<step>-end.png` is the window as it stood when the answer finished: the last lines of
the answer's text and, when the answer has one, its `Used:` line. `<step>-start.png` is the same
window after the message column was scrolled up to that question: the question and the badge.

For each of the five steps, pass when all of this is true:

- In `<step>.json`: `state` is `done`, `line` is null, `answer_chars` is 1 or more, and `badge` and
  `used` are what the list below gives for the step.
- `<step>-start.png` shows the step's question and, between that question and the answer's text,
  a badge with the same text as `badge` in `<step>.json`.
- `<step>-end.png` shows the last lines of the answer's text. When `used` in `<step>.json` is not
  null, the picture also shows that whole line under the answer's text.
- `answer` in `<step>.json` is plain text that answers a question about course work or about the
  owner's own decisions. It is not an error message, it is not empty, and its last word is whole.

What `badge` and `used` must be:

- step 3, `3 lookup haiku`: `badge` reads `Haiku · lookup`, and `used` holds `search_materials`.
- step 4, `4 decision haiku`: `badge` reads `Haiku · lookup`, and `used` holds
  `search_context · bb2dash-inbox-decisions`.
- step 5, `5 document haiku`: `badge` reads `Haiku · lookup`, and `used` holds `get_material_text`.
- step 6, `6 standard sonnet`: `badge` reads `Sonnet · standard`; `used` may hold anything, or be
  null.
- step 7, `7 deep opus`: `badge` reads `Opus · deep work`; `used` may hold anything, or be null.

`used` is the whole line, so it starts `Used:`. It may name more tools than the list does, and
after a tool's name it may add ` · ` and a course, a collection or a document's number. None of
that is a fault, as long as `used` holds the text the list gives for the step.

A picture in which the answer's text runs past the edge of the message column is only the scrolled
view. That is not a cut-off answer and not a fault: whether the answer is whole is judged from
`answer` in `<step>.json`.

Step 3 has one more condition, and only you can judge it. Its question asks what a syllabus says,
and **the answer must name the file it read**: `answer` in `3.json` must hold a document's own
file name, such as a name that ends in `.pdf`, `.docx` or `.pptx`. Naming only the course or the
topic is not enough. `names_file` in `3.json` is a hint from a simple pattern, not the verdict. If
the answer holds no file name, step 3 is a `fail`. In `saw`, say that the answer named a file; do
not copy the file's name or the answer's words.

If `badge` is not the text the list gives for the step (for example the list gives
`Haiku · lookup` and `badge` is `Sonnet · standard`), the step is a `fail`: which level answers
which kind of question is what these five steps are for.

### Step 8: `8 stopped`

The test asks the question of step 7 a second time, as a new question in the same conversation. It
presses the button while that button reads `Stop` and the answer is being written.

Pass when all of this is true:

- In `8.json`: `state` is `stopped`, `line` reads `You stopped this answer.`, `answer_chars` is 1
  or more (some of an answer was written before the stop), `badge` reads `Opus · deep work`, and
  `stopped_sentence_in_view` is true.
- `8-stopped.png` shows answer text in the message column, and a line that reads
  `You stopped this answer.` stands under the last of that text.
- In `8-stopped.png` the button to the right of the question box reads `Ask`, and no button in the
  picture reads `Stop`.

Two things about `8-stopped.png` are not faults:

- The button may look dimmed. The picture is taken straight after the press, and the page dims the
  button while the page waits for the stop to be confirmed. A dimmed button that reads `Ask` meets
  the condition.
- The facts in `8.json` are taken from the page about seven seconds after the picture. So `8.json`
  may hold a `used` line that the picture does not show, and the badge may be above the visible
  part of the message column.

If the test failed and `test_error` in `8.json` begins `inconclusive:`, the answer was finished
before the button could be pressed. Run the title a second time and set `reruns` to 1. If
`test_error` of the second run also begins `inconclusive:`, the verdict is `unsure`.

### Step 9: `9 reload mid-answer`

The test asks the question of step 7 a third time (steps 7 and 8 asked it before), as a new
question in the same conversation, and reloads the page as soon as answer text is being written. A
reloaded page cannot show the text that was written before the reload. Until the answer is
finished, the reloaded page must show, under the question, a line that reads `Answering…` and no
answer text. When the answer is finished, the page must show the finished answer's text.

Pass when all of this is true:

- In `9.json`, about the reloaded page: `state_after_reload` is `streaming`, `line_after_reload`
  reads `Answering…`, `text_chars_after_reload` is 0, `answering_looks` is 1 or more, and
  `ended_as` is `done`.
- In `9.json`, about the finished answer: `state` is `done`, `line` is null, `badge` reads
  `Opus · deep work`, and `answer_chars` is 1 or more.
- `9-reloaded.png` shows this step's question as the last question in the message column, and
  under that question a line that reads `Answering…`. Between that question and that line the
  picture shows no answer text; a badge may stand there.
- `9-end.png` shows the last lines of the finished answer's text.

`answer_landed_first` in `9.json` may be true or false, and neither is a fault. When
`answer_landed_first` is true, the finished answer's text reached the page a moment before the page
marked the answer as finished. The test then waited until the answer was marked as finished, and
checked that the text on the page did not change in between.

Guidance, not a pass condition: the answer of this step follows the answer that step 8 stopped,
and it may open by saying that the earlier reply was empty. That is a known behaviour of the
assistant after a stop and is not a reason to fail step 9. When you see it, write it in `notes`.

If the test failed and `test_error` in `9.json` begins `inconclusive:`, the page did nothing
wrong: the answer was finished before the reload, or before the reloaded page could be recorded.
Run the title a second time and set `reruns` to 1. If `test_error` of the second run also begins
`inconclusive:`, the verdict is `unsure`.

## Stage: offline

The page under test is the Workspace, a chat page of the app. It has a message column, which holds
the questions of one conversation, each question followed by its answer. Under the message column
is the question box, and to the right of the question box is the one button that sends a question.

The host has just stopped the Workspace service, the program that writes the answers. Within three
minutes of that stop the page must show a line that reads `The Workspace service is offline.`
(below: the offline line), and a question asked while the service is stopped must wait: it must
not fail. `ACCEPT_DEADLINE` holds the end of those three minutes. Time matters in this stage: run
the title `14a offline` as your first command, before you read or list anything.

### Step 14a: `14a offline`

The test opens the conversation that this run's earlier `walk` stage asked its questions into (the
host hands that conversation's id over in `carry.json`). It waits until the page shows the offline
line, then asks one question and watches that question for 15 seconds.

Pass when all of this is true:

- In `14a.json`: `offline_line` reads `The Workspace service is offline.`, `offline_seen_at` is not
  later than `deadline`, `state` is `queued`, `line` reads `Waiting for the Workspace service`, and
  `still_queued_at` holds a time. The test writes `still_queued_at` only when the question was
  waiting at the end of the 15 seconds, so a `14a.json` without `still_queued_at` means the
  question did not wait.
- `14a-offline.png` shows, under the question box, a line that reads
  `The Workspace service is offline.`
- `14a-queued.png` shows the question this test asked as the last question in the message column,
  and under that question a line that reads `Waiting for the Workspace service`. Under that
  question the message column shows no answer text and no other line.

Three cases are not the product's fault. In each of them the verdict is `blocked`, and the title
is not run a second time:

- The test failed and `test_error` in `14a.json` begins
  `inconclusive: the page opened after the deadline`: the stage started too late to judge.
- The test failed and `test_error` in `14a.json` names `carry.json`: the host handed over no
  conversation.
- `ACCEPT_DEADLINE` is not set. The test then fails at once, and `test_error` in `14a.json` begins
  `ACCEPT_DEADLINE is not set`.

If `opened_at` in `14a.json` is earlier than `deadline` and `14a.json` holds no `offline_seen_at`,
the page was open in time and the offline line did not show before the deadline. The verdict is
`fail`.

## Stage: back

The page under test is the Workspace, a chat page of the app. On the left of the page is the list
of conversations, one row for each conversation. To the right of the list is the message column,
which holds the questions of one conversation, each question followed by its answer. An answer
carries a badge above its text, which names the model level that wrote the answer.

The host has started the Workspace service, the program that writes the answers, after stopping it
for the stage before this one. The question that step 14a asked while the service was stopped must
now get its answer: that is step 14b. After that, step 15 archives two conversations with the
page's own buttons.

### Step 14b: `14b back`

The test opens the conversation that step 14a asked its question into, finds that question and
waits for its answer. It asks no question. The answer may be on the page already when the page
opens. How long the question waited is not yours to judge in this step: the host checks in the
database that the Workspace service took the question 15 seconds or more after the question was
asked. You judge that the page holds the answer.

Pass when all of this is true:

- In `14b.json`: `state` is `done`, `line` is null, `answer_chars` is 1 or more, and
  `offline_line_shown` is false.
- In `14b.json`, `badge` reads `Haiku · lookup`, or reads `Sonnet · standard`, or reads
  `Opus · deep work`. Any of the three is right: this step asks for an answer, not for a level.
- `14b-start.png` shows that question as the last question in the message column and, between the
  question and the answer's text, a badge.
- `14b-end.png` shows the last lines of the answer's text.
- Nowhere in either picture is there a line that reads `The Workspace service is offline.`

If the test failed and `test_error` in `14b.json` names `carry.json`, the host handed over no
request or no conversation. The verdict is `blocked`. Do not run `15 archive` then: step 15 is
`blocked` too, and its `saw` says that it waited on step 14b.

### Step 15: `15 archive`

The test archives two conversations: the conversation titled `spike`, which is left from the
phase's first trial, and this run's own conversation, the one that steps 3 to 14b asked into. It
archives each of the two by pressing the button that reads `Archive` in that conversation's row of
the list. It deletes nothing. An archived conversation leaves the list, and is listed under the
tick box that reads `Show archived` while that box is ticked.

Pass when all of this is true:

- In `15.json`: `archived_ids` holds every id of `own_ids` and every id of `spike_ids`,
  `archive_writes` equals the number of ids in `archived_ids`, and `spike_archived_rows` is 1 or
  more.
- `15-before.png` shows the list of conversations with one row or more. When
  `spike_was_already_archived` in `15.json` is false, one of those rows is titled `spike`.
- `15-after.png` shows the list of conversations with no row titled `spike`, and `listed_after` in
  `15.json` is less than `listed_before`.
- `15-archived.png` shows rows whose button reads `Unarchive`: the archived conversations. One of
  those rows is titled `spike`. The picture may be scrolled down the list, so the tick box that
  reads `Show archived` may be out of the picture; where the picture does show that box, the box
  is ticked.

If `spike_was_already_archived` is true, an earlier run had archived the conversation titled
`spike`. That is not a fault: the step passes when every other condition holds, and you say in
`saw` that an earlier run had archived that conversation.

If `listed_after` in `15.json` is 1 or more, conversations other than these two are listed after
the test's presses. That is not a fault: the step passes when every condition holds, and you write
that number in `notes`, because those rows may be left from an earlier run.
