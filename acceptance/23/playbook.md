# Phase 23 (the Inbox's Apply answers button and the sync): what each step must show

This file is for the Claude operator of an acceptance run (`acceptance/OPERATOR.md` holds the
general rules). The host sends the operator one `## Stage:` section at a time, with nothing above
or below that section. So each section stands by itself, and these opening paragraphs never reach
the operator. This file holds no course text: this repository is public. The four test questions
this phase raises for itself are written by a database function, and the words typed into them are
the pack's own.

How a section writes a text of the page is a rule of `acceptance/README.md`: in code marks,
exactly as the page has it. `node --test acceptance/acceptance.test.mjs` holds each such text
against the browser-test file's own strings.

## Stage: walk

The page under test is the Inbox of the app, at the address `/inbox`. It has a heading `Inbox` and
three tabs: `Needs you`, `Answered, not applied` and `Archived`. Under the tabs is a list of
cards, one for each question, in the tab that is selected. A card that is open has an answer box,
a field for a reason, and the buttons `Save` and, on some cards, `Dismiss`. At the foot of the page
is a footer with a count of answered questions, such as `0 answered`, and one button that reads
`Apply answers` when nothing is moving. Beside that button the page may show one line of text,
the request's state. The top bar of every page has one more button, `Sync`.

This stage walks the live Inbox with four test questions of its own. Each is a card whose title
starts with `Acceptance run test question`, followed by a label in double quotes: `confirm`,
`dismiss`, `note` or `offline`. The label also stands in the card's source line, after `accept/`
and a number that is the run's tag. Other cards may stand in the Inbox beside them, and that is not
a fault. Nothing in this stage changes a course.

This stage presses `Sync` once and `Apply answers` once, and answers three of its four test
questions. Run each title one time, in the order of your list of titles. A title is run a second
time only where its step below allows it. Never press a button yourself.

If step 1 does not end in `pass`, do not run steps 2, 3, 4 and 6: give each the verdict `blocked`,
and say in its `saw` that it waited on step 1. If step 2 does not end in `pass`, do not run steps
3, 4 and 6: the same, waiting on step 2. If step 3 does not end in `pass`, do not run steps 4 and
6: the same, waiting on step 3.

### Step 1: `1 raise questions`

The test calls the database function that raises the four test questions, opens the Inbox, answers
the card labelled `confirm` with a word and presses `Save` with the reason field empty, and presses
`Dismiss` on the card labelled `dismiss` with the reason field empty. It leaves the cards labelled
`note` and `offline` open.

Pass when all of this is true:

- In `1.json`: `run_tag_id`, `confirm_item_id`, `dismiss_item_id`, `note_item_id` and
  `offline_item_id` are each a whole number above 0, and the four item numbers are all different.
  `cards_seen_open` is 4, `confirmed` is true and `dismissed` is true. `answered_tab_shows` holds
  `confirm` and `dismiss`.
- `1-raised.png` shows the `Needs you` tab selected and the card labelled `confirm` at the top of
  the list. Its source line holds `accept/` and a number. The picture may cut off the cards that
  follow it; `cards_seen_open` in `1.json` is what counts them.
- `1-answered.png` shows the `Answered, not applied` tab selected, with the card labelled
  `confirm` in the list. The cards labelled `note` and `offline` are not in this tab.

If `test_error` in `1.json` begins `inbox_accept_question`, the database refused to raise a
question. The verdict is `fail`.

### Step 2: `2 press sync`

The test opens the home page, presses `Sync` in the top bar and watches the button's label until
it names a phase of the sync container, or until about two and a half minutes have passed.

Pass when all of this is true:

- In `2.json`: `request_id` is a whole number above 0, `label_before` is `Sync`, and `labels_seen`
  holds at least one of `starting…`, `crawling…`, `pulling files…`, `finishing…` and `sync done`.
- `2-pressed.png` shows the top bar with the sync button, and the label on that button is the one
  that `label_at_shot` holds.

If `labels_seen` ends with `waiting on the container…`, the sync container did not take the
request, and the verdict is `fail`.

### Step 3: `3 watch apply`

The test opens the Inbox and presses nothing. It watches the label of the apply button for nine
minutes. The sync that step 2 started ends; then the sync files an apply request by itself, the
apply worker takes it, and the request closes. A page that is open sees the label go from
`Apply answers` through `queued` and `running` to `done`; a phase may pass between two looks of
the test, so `labels_seen` may skip one of them.

You look at step 2's pictures before this test starts, and a sync takes about two minutes, so
the sync and the apply request may both have ended before the page opens. A page cannot show the
result line of a request it never saw open. So the test has two ways to pass.

Pass, way one (the test saw the request run), when all of this is true:

- In `3.json`: `closed_before_the_page_opened` is false, `label_at_start` is `Apply answers`,
  `ended_as` is `done`, `status_line` is a line of text and not null, and `labels_seen` does not
  hold `waiting on the worker…` and ends with `done`.
- `3-watching.png` shows the Inbox with the button in the footer, labelled as `label_at_start`
  says.
- `3-done.png` shows the footer with the count `0 answered`, the button labelled `done`, and
  beside the button the line of text that `status_line` holds.
- Nowhere in `3-done.png` is there a box with a command that starts `claude`: nothing was pasted.

Pass, way two (the request had closed before the page opened), when all of this is true:

- In `3.json`: `closed_before_the_page_opened` is true, `count_at_start` is `0 answered` and
  `status_line` is null.
- `3-watching.png` shows the footer with the count `0 answered`.
- `3-done.png` shows the `Archived` tab selected with the cards labelled `confirm` and
  `dismiss` in the list, the count `0 answered` in the footer, and no box with a command that
  starts `claude`. The picture may cut off the second card; `3.json` is what counts it.
- In `saw`, say that the request had closed before the page opened, so the page showed no result
  line. That is not a fault: the host checks the request itself in the database.

The test takes as long as the sync takes, nine minutes at the most. If `test_error` in `3.json`
begins `inconclusive: the sync was still running after nine minutes`, run the title a second time
and set `reruns` to 1. If `test_error` of the second run also begins `inconclusive:`, the verdict
is `blocked`, and the title is not run a third time.

If `test_error` says that the apply worker did not take the request, the verdict is `fail`.

### Step 4: `4 archived`

The test opens the Inbox and looks at two tabs. It presses nothing but the tabs.

Pass when all of this is true:

- In `4.json`: `answered_tab_empty` is true, and `archived_tab_shows` holds `confirm` and
  `dismiss`.
- `4-answered.png` shows the `Answered, not applied` tab selected, the text
  `Every answer has been applied.` in the list, and the count `0 answered` in the footer.
- `4-archived.png` shows the `Archived` tab selected, with the cards labelled `confirm` and
  `dismiss` in the list, each with a chip that has the word `archived`. The picture may cut off
  the second card; `archived_tab_shows` in `4.json` is what counts them.

### Step 6: `6 note and apply`

The test answers the card labelled `note` with a word and a reason, saves it, and presses
`Apply answers`. The request runs by itself: the apply worker takes it, starts one Claude run,
and closes it. The test watches the label for nine minutes at the most. A Claude run can take
longer than that, and one command of yours is limited to ten minutes, so the test does not wait
for it.

If `test_error` in `6.json` begins `inconclusive: the apply request was still open`, the wait
ended with the request still open. That is not a fault of the product. Look at `6-fail.png` and at
`labels_seen` in `6.json`, say in `saw` what the page showed (the last label, and the line beside
the button if there is one), and give the verdict `blocked`, never `fail` and never `unsure`: the
step could not be judged in the time one command has, and the whole run is repeated. Do not run the
title a second time in this run: the first press already filed its request.

Pass when all of this is true:

- In `6.json`: `saved_with_a_reason` is true, `request_id` is a whole number above 0, `ended_as`
  is `done`, `status_line` is a line of text and not null, and `labels_seen` does not hold
  `waiting on the worker…` and ends with `done`.
- `6-saved.png` shows the `Answered, not applied` tab selected, the card labelled `note` in the
  list, and the count `1 answered` in the footer.
- `6-done.png` shows the `Archived` tab selected with the card labelled `note` in the list, and
  the footer with the count `0 answered`, the button labelled `done`, and beside the button the
  line of text that `status_line` holds. No box with a command that starts `claude` is in the
  picture.

If `test_error` in `6.json` begins `the press filed no request`, a request was already open when
the button was pressed. That is not the product's fault: the verdict is `blocked`, and `saw` says
so. If `test_error` says that the apply worker did not take the request, the verdict is `fail`.

## Stage: offline

The page under test is the Inbox of the app, at the address `/inbox`. It has three tabs:
`Needs you`, `Answered, not applied` and `Archived`; a list of cards under them; and a footer with a
count of answered questions and one button that reads `Apply answers` when nothing is moving.

The host has just stopped the apply service, the program that takes the button's requests. This
stage presses `Apply answers` once, while the service is stopped, and the request must wait.

### Step 7a: `7a offline press`

The test dismisses the card labelled `offline` with the reason field empty, opens the
`Answered, not applied` tab, and presses `Apply answers`. It then waits for the page to call the
request unclaimed, which takes about 75 seconds after the press, and presses the button a second
time. The whole title takes about two minutes.

Pass when all of this is true:

- In `7a.json`: `dismissed` is true, `request_id` is a whole number above 0, `label_after_press`
  is `queued`, `label_after_grace` is `waiting on the worker…`, `command_shown` is true and
  `command_names_the_request` is true.
- `7a-queued.png` shows the footer with the button labelled `queued` and beside it the line
  `Queued from Apply answers`.
- `7a-waiting.png` shows the footer with the button labelled `waiting on the worker…` and beside
  it the line of text that `status_line_after_grace` holds.
- `7a-command.png` shows a box that holds a command starting `claude`, and the number in that
  command is the number that `request_id` holds.

If `test_error` in `7a.json` begins `the press filed no request`, a request was already open when
the button was pressed. That is not the product's fault: the verdict is `blocked`, and `saw` says
so.

## Stage: back

The page under test is the Inbox of the app, at the address `/inbox`. It has three tabs:
`Needs you`, `Answered, not applied` and `Archived`; a list of cards under them; and a footer with a
count of answered questions and one button.

The host has started the apply service again, the program that takes the button's requests. The
request that step 7a filed while the service was stopped must now be taken and closed.

### Step 7b: `7b taken after`

The test opens the Inbox and looks at the `Archived` tab. If the card labelled `offline` is not
there yet, it reloads the page every ten seconds, for three minutes at the most. It presses
nothing but the tabs. How long the request waited is not yours to judge in this step: the host
checks that in the database.

Pass when all of this is true:

- In `7b.json`: `archived_tab_shows` holds `offline` and `nothing_answered` is true.
- `7b-archived.png` shows the `Archived` tab selected with the card labelled `offline` in the list,
  with a chip that has the word `archived`, and the footer with the count `0 answered`.

`label_on_the_button` and `status_line` in `7b.json` may hold anything, or be null. The page was
opened after the request may already have closed, so it may show no result line. That is not a
fault.

If `test_error` in `7b.json` says that the waiting request was not taken, the verdict is `fail`.
