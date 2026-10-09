# Phase 24a (the Workspace behind the page): what each step must show

This file is for the Claude operator of an acceptance run (`acceptance/OPERATOR.md` holds the
general rules). The host sends the operator one `## Stage:` section at a time, with nothing above
or below that section. So each section stands by itself, and these opening paragraphs never reach
the operator. This file holds no course text and no answer: this repository is public.

How a section writes a text of the page is a rule of `acceptance/README.md`: in code marks,
exactly as the page has it. `node --test acceptance/acceptance.test.mjs` holds each such text
against the app's own strings.

**Why the questions are worded as they are** (for whoever maintains the pack). Phase 24a does not
change the page, so it has no control for a depth, a routine or an upload, and the page sends every
question as Auto. The router (`workspace/src/router.ts`) then picks the tier from the words, and a
test of the pack runs the router over every question of `web/e2e/accept24.spec.ts`:

- A lookup opens with one of the router's cue words and holds no execution verb. It goes to the
  lowest tier, which takes no planning turn. Steps 3, 4, 6, 7, 8, 9 (its second question) and 13 are
  lookups.
- A Standard-depth question opens with a word that is neither a cue word nor an execution verb
  (`Explain`). It goes to the middle tier, and the middle tier and the highest tier take a planning
  turn. Step 5 asks one, and so does the first question of step 9, worded to give a long answer so
  that Stop can be pressed while the answer is written. The pack never asks the highest tier.
- The follow-up of step 7 is short, so it keeps the conversation's tier.
- The question of step 8 is made of invented words. It has to stay nonsense: a real word of a course
  or of the synthetic file could match a passage and the retrieval would no longer be empty. Do not
  "improve" it into a real topic.

**The file of steps 11 to 15** is made in each run from a value the test draws (`nonce_id`), so its
hash is one no earlier run used. A run that stopped between steps 11 and 15 leaves a synthetic
upload in the owner's store, searched like any other, until it is removed: the PM removes it
through the page's own session, by the `document_id` in that run's `11.json`.

## Stage: walk

The page under test is the Workspace, a chat page of the app. On the left of the page is the list
of conversations. To the right of the list is the message column, which holds the questions of one
conversation, each question followed by its answer. Under the message column is the question box,
and to the right of the question box is one button. That button reads `Ask`; while an answer is
being written, the same button reads `Stop`. A question is typed into the question box and sent
with that button. An answer carries a badge above its text, which names the model level that wrote
the answer. In the list, each conversation's row has a button that reads `Archive`.

The Workspace service, the program that writes the answers, is running. This stage asks the live
assistant eight questions. Run each title one time, in the order of your list of titles. A title
is run a second time only where the operator's rules on a second run allow it, or where its step
below allows it.

Step 3 starts one conversation, and step 7 asks its question into that conversation. If `3.json`
holds no `conversation_id`, do not run `7 follow-up`: give step 7 the verdict `blocked`, and say in
its `saw` that it waited on step 3.

Each of steps 4 to 9 starts a conversation of its own and, at its end, archives it through the
list. Step 3 does not archive its conversation; step 7 does. Archiving deletes nothing. You see
no picture of it; it is in the facts.

### Step 2: `2 open workspace`

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

### Steps 3 to 8: six questions

Each of these six tests asks one question, waits until the answer is finished and takes two
pictures. `<step>-end.png` is the window as it stood when the answer finished: the last lines of
the answer's text. `<step>-start.png` is the same window after the message column was scrolled up
to that question: the question and the badge.

For each of the six steps, pass when all of this is true:

- In `<step>.json`: `state` is `done`, `line` is null, `answer_chars` is 1 or more, and `badge` is
  what the list below gives for the step.
- `<step>-start.png` shows the step's question and, between that question and the answer's text,
  a badge with the same text as `badge` in `<step>.json`.
- `<step>-end.png` shows the last lines of the answer's text.
- `answer` in `<step>.json` is plain text that answers the question. It is not an error message, it
  is not empty, and its last word is whole.

What `badge` must be:

- step 3, `3 course question`: `badge` reads `Haiku · lookup`. The question asks what a course
  syllabus says about one topic.
- step 4, `4 lookup one turn`: `badge` reads `Haiku · lookup`. The question asks for a list of a
  syllabus's section headings.
- step 5, `5 standard plan`: `badge` reads `Sonnet · standard`. The question asks for an
  explanation that uses a course's slides.
- step 6, `6 planner feed`: `badge` reads `Haiku · lookup`. The question asks which assignments are
  due in the next two weeks.
- step 7, `7 follow-up`: `badge` reads `Haiku · lookup`. The question is short and asks about
  another topic of the same syllabus, in step 3's conversation.
- step 8, `8 nothing matches`: `badge` reads `Haiku · lookup`. The question is made of invented
  words.

If `badge` is not the text the list gives for the step, the step is a `fail`: which level answers
which kind of question is what these steps are for. A `Used:` line under an answer may be there or
not; neither is a fault.

A picture in which the answer's text runs past the edge of the message column is only the scrolled
view. That is not a cut-off answer and not a fault: whether the answer is whole is judged from
`answer` in `<step>.json`.

Steps 4 to 8 also archive the conversation they started (step 7: the one step 3 started). For each
of those five steps, pass needs this too: in `<step>.json`, `archived_ids` holds the step's
conversation (`conversation_id` for steps 4, 5, 6 and 8; the `conversation_id` of step 3 for
step 7), and `archive_writes` equals the number of ids in `archived_ids`.

Step 7 has one more condition: `3.json` and `7.json` hold the same `conversation_id`.

Step 8 has one more condition: `first_line_is_the_fixed_sentence` in `8.json` is true, and the
first line of `answer` is one sentence that says no passage of the owner's course files or uploads
matched the question, so the answer comes from general knowledge. In `saw`, say that the first line
was that sentence; do not copy it. The test has already compared it, word for word, with the
sentence of the app: you judge that it stands as the first line of the answer.

### Step 9: `9 stop then answer`

The test asks a question that gets a long answer, presses the button while that button reads `Stop`
and the answer is being written, and then asks a second, short question in the same conversation.

Pass when all of this is true:

- In `9.json`, about the stopped answer: `state` is `stopped`, `line` reads `You stopped this
  answer.`, `answer_chars` is 1 or more (some of an answer was written before the stop), and
  `badge` reads `Sonnet · standard`.
- `9-stopped.png` shows answer text in the message column, and a line that reads
  `You stopped this answer.` stands under the last of that text. The button to the right of the
  question box reads `Ask`, and no button in the picture reads `Stop`.
- In `9.json`, about the second answer: `next_state` is `done`, `next_badge` reads
  `Haiku · lookup`, and `next_answer_chars` is 1 or more.
- `9-after.png` shows the second question and its answer's text, under the stopped answer, and the
  button reads `Ask`.
- In `9.json`: `request_id` and `next_request_id` are two different whole numbers, the second above
  the first; `archived_ids` holds `conversation_id`, and `archive_writes` equals the number of ids
  in `archived_ids`.

Two things about `9-stopped.png` are not faults. The button may look dimmed: the picture is taken
straight after the press, and the page dims the button while it waits for the stop to be
confirmed. A dimmed button that reads `Ask` meets the condition. And the facts in `9.json` about the
stopped answer are taken a moment before the picture, so a `Used:` line may be in the facts and not
in the picture.

If the test failed and `test_error` in `9.json` begins `inconclusive:`, the answer was finished
before the button could be pressed. Run the title a second time and set `reruns` to 1. If
`test_error` of the second run also begins `inconclusive:`, the verdict is `unsure`.

## Stage: upload

The page under test is the Workspace, a chat page of the app. It has no control for putting a file
in: that control is a later phase's. So this step makes, with the page's own signed-in session, the
calls the control will make. It types nothing on the page and takes no picture.

### Step 11: `11 upload file`

The test draws a value that is new in this run, makes a small plain-text file from it, and then: it
checks that no upload row holds the file's hash, puts the file in the private bucket under a key
made from the hash, makes a signed link valid for seven days, and registers the file.

Pass when all of this is true in `11.json`:

- `nonce_id` is a uuid. `sha256` is 64 lower-case hex characters. `storage_key` is `u/` followed by
  `sha256`. `mime` is `text/plain`. `byte_size` is a whole number above 0.
- `uploaded` is true, `existing` is false, `document_state` is `stored`, and `document_id` is a
  whole number above 0.

If `test_error` begins `the page sent no signed-in read`, no session was taken from the page and
the step could not be judged: the verdict is `blocked`. Any other `test_error` that names an answer
of the database or the bucket (for example `the upload of the object answered 400`) is the
product's: the verdict is `fail`, and `saw` names the answer's number.

## Stage: find

The page under test is the Workspace, a chat page of the app. The file of step 11 has been read and
indexed by the host's ingest worker; the host waited for that before this stage began.
`carry.json` holds step 11's `nonce_id` and `document_id`.

### Step 13: `13 find upload`

The test asks one question that uses words of the file, and waits until the answer is finished. It
takes the two pictures of steps 3 to 8, and archives the conversation it started.

Pass when all of this is true:

- In `13.json`: `state` is `done`, `line` is null, `answer_chars` is 1 or more, and `badge` reads
  `Haiku · lookup`. `archived_ids` holds `conversation_id`, and `archive_writes` equals the number
  of ids in `archived_ids`.
- `13-start.png` shows the question and, between that question and the answer's text, the badge.
- `13-end.png` shows the last lines of the answer's text.
- `answer` in `13.json` is plain text that answers the question. It is not an error message.

Guidance, not a pass condition: the answer should speak of a lamp and its hinges or shade. The host
checks in the database that the answer drew on the file; you check that the answer is whole. Write
in `notes` whether the answer spoke of a lamp.

If `test_error` in `13.json` names `carry.json`, the host handed over no file: the verdict is
`blocked`.

### Step 14: `14 send twice`

The test sends the same file a second time, as the page will: it finds that a row already holds the
hash, uploads nothing, asks for a new signed link, and registers the file again. It takes no
picture.

Pass when all of this is true in `14.json`: `rows_before` is 1, `uploaded` is false, `existing` is
true, `rows_after` is 1, and `document_id` is a whole number above 0.

If `test_error` in `14.json` names `carry.json`, the host handed over no file: the verdict is
`blocked`.

## Stage: delete

The page under test is the Workspace, a chat page of the app. This stage deletes the file of
step 11 in the two steps the page will use. `carry.json` holds step 11's `nonce_id` and
`document_id`. The test takes no picture.

### Step 15: `15 delete upload`

The test calls the delete function with the second argument false, which cuts retrieval and leaves
the row in state `deleting`; removes the object from the bucket; and calls the delete function
again with the second argument true, which drops the row.

Pass when all of this is true in `15.json`:

- `first_call_state` is `deleting`, and `storage_key` is `u/` followed by `sha256`.
- `objects_removed` is 1.
- `second_call_state` is `deleted`, and `rows_after` is 0.

If `test_error` in `15.json` names `carry.json`, the host handed over no file: the verdict is
`blocked`.
