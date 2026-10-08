# Phase 24: Workspace assistant. Stack's sixteen answers, on record

2026-10-08 · one batch · answered the same day · this file replaces the draft batch of ten questions
that stood here at 4bf223e.

Briefs `109_PHASE24_workspace_assistant.md` (Phase 24a) and `111_PHASE24B_workspace_page.md` (Phase
24b) are drawn to these answers. Where a PM ruling and his words differ, his words win.

**How to read it.** His own words are in quotes. Where he picked an option, the option is given as it
was put to the PM's planning run. Answers 1 to 11 are his. Answers 12 to 16 were listed to him as
taken, and he did not object.

**What this record could not check.** The exact wording of each question as shown to him is not in a
file this record was built from. The options under "options" are the draft batch's (this file at
4bf223e) and the challenger's list (`109b_PHASE24_draft_challenge.md` at 4bf223e) where a question
matches one of them, and are marked "not on file" where it does not.

## His request

"Regarding the workspace section, the Replit Web keyword png's in my downloads should serve as both
ui and feature inspiration. Once you complete the visual passes (or while they are going in
parallel), I want you to redesign the features and functionality to upgrade the workspace section so
that it begins functioning properly as a personalized chatbot connected to my materials and rag db
with RAG pulling (as well as the upsertion pipeline) automated."

## The answers

### 1. What it remembers by itself

* **Options.** Nothing automatic, with an "About me" note he writes and a Keep button on an answer
  (the draft's default). A summary of each conversation written by a background turn. Facts learned
  about him.
* **He chose, 2026-10-08:** automatic summaries. Each finished conversation is summarised and stored
  automatically by a cheap background turn, listed where he can delete any of them, plus an "About
  me" note he writes that it reads on every question.

### 2. Where memory lives

* **Options.** His notes store (`harness-memory`), through a vault note (the draft's default). Inside
  bb2dash only.
* **He wrote, 2026-10-08:** "inside this app only. We also need to ensure that the RAG DB with the
  chunked materials (syllabi, assignments, etc), using a cheap model to orchestrate those retrievals,
  while a higher level model then takes the context, the prompt, any other attached documents (add
  this feature if it isnt one). I also want a bb2dash specific rag databse and session storage (for
  scalability purposes) so ensure that is implemented during this phase if it is not already."

### 3. Attaching a file

* **Options.** Only files already in his materials (the draft's default). Also new files from his
  device, and then: private to the Workspace, or joining the course materials everywhere.
* **He wrote, 2026-10-08:** "pick from materials as default, option to browse and select from device."
* **And chose:** a file uploaded from his device is private to the Workspace: indexed in bb2dash's own
  RAG database, findable in later conversations, not shown on Materials or course pages.

### 4. The planner

* **Options.** No new reach, with example prompts that carry a title and a date (the draft's default).
  The assistant reads due dates and progress.
* **He wrote, 2026-10-08:** "Yes and it should. Planner should also be ingested into the RAG db or
  called as an explicit data feed for the assistant."

### 5. Grades

* **Options.** Due dates and progress without grades. With grades.
* **He wrote, 2026-10-08:** "It can have access to grades."

### 6. Session storage

* **Options.** Not on file.
* **He chose, 2026-10-08:** the database is the source. Every turn rebuilds its context from
  bb2dash's database; nothing that matters lives on the container, so the runner can be replaced,
  moved or run more than once later.

### 7. His class notes in the vault's store

The store is the separate Supabase project `harness-memory`.

* **Options.** The class-note collections of his current courses, his Inbox decisions and kept
  answers (the draft's default). Everything. Fewer. None.
* **He chose, 2026-10-08:** leave notes out. The assistant uses course materials, uploads, the
  planner and grades, and its own memory only.

### 8. When nothing of his matches

* **Options.** Answer from general knowledge and say so. Decline.
* **He chose, 2026-10-08:** it answers from general knowledge and says plainly that it found nothing
  of his.

### 9. Study routines

* **Options.** Not on file beyond the five named.
* **He chose, 2026-10-08:** all five to start: Quiz me, Study guide, Explain this file, Summarise a
  reading, Plan my week.

### 10. Graded work

* **Options.** Whether a routine may write or rewrite his own text for graded work. The other options
  as shown: not on file.
* **He chose, 2026-10-08:** "Drafting help", a routine that drafts or rewrites text for an assignment.
  This is his decision. The briefs record it and do not argue it.

### 11. Delivery

* **Options.** The page waits for Phase 22 and the whole phase merges once. The backend merges first
  as its own PR.
* **He chose, 2026-10-08:** two parts. Everything behind the page in one PR; then the redesigned page
  in a second PR after Phase 22 (styling) is on `main`.

### 12. Formatted answers (listed as taken, not objected to)

* **Options.** Formatted, rendered safely (the draft's default). Plain text, as today.
* **Taken, 2026-10-08:** answers are formatted (headings, lists, tables). No image is ever drawn and
  no link is fetched.

### 13. Depth (listed as taken, not objected to)

* **Options.** A menu with Auto as the starting choice (the draft's default). The router alone.
* **Taken, 2026-10-08:** a depth menu, Auto, Quick, Standard, Deep, starting on Auto.

### 14. How much of his plan a question may use (listed as taken, not objected to)

* **Options.** Unchanged (the draft's default). A lower or higher ceiling. A daily ceiling or an Off
  switch.
* **Taken, 2026-10-08:** the usage ceiling stays as it is, one question at a time.

### 15. A file that failed to index (listed as taken, not objected to)

* **Options.** Retried at the next sync, with the page showing how many wait (the draft's default). A
  database timer that retries within minutes.
* **Taken, 2026-10-08:** new course files are indexed on every sync, and a failed one retries at the
  next sync with the page showing how many wait.

### 16. What it may write (listed as taken, not objected to)

* **Options.** Nothing beyond its own records (the draft's default). Changes to the planner, as a
  later phase with a propose-then-approve step.
* **Taken, 2026-10-08:** the assistant writes nothing except its own memory, each answer's source
  list and the index of his uploads.

## Still open, with the default taken

The design needed these and he was not asked. Each default is built unless he says otherwise. None
blocks the freeze.

1. **Deep after one question.** Default: Deep applies to that question, then the menu returns to Auto
   (PM ruling W-9). Quick and Standard stay until he changes them.
2. **Memory before he can see it.** The list and the delete control are on the new page, which is
   24b. Default: the path is built and tested in 24a, and no memory item is written until 24b turns
   it on. The rolling summary that keeps a long conversation in context is not a memory item and is
   on from 24a.
3. **Deleting a remembered item.** Default: that conversation is not summarised again.
4. **The quiet wait before a conversation is summarised.** Default: 15 minutes after its last answer.
5. **Limits.** Defaults: the About me note is 2,000 characters; an upload is 20 MB at most and one of
   pdf, docx, pptx, xlsx, plain text or Markdown; five attachments a question; a remembered item is
   1,000 characters.
6. **The planner: fed or indexed.** He offered both forms. Default: an explicit data feed read on
   every answer (PM ruling W-6), because dates and statuses change and a structured read is exact.
   Nothing of the planner is embedded.
7. **The "graded so far" figure.** Default: the feed carries posted scores, and the assistant points
   to the Grades screen for the figure. The figure is computed in the web app and cannot be run by the
   runner as the same computation (brief 109, The planner and grades feed).
8. **What the feed leaves out.** Default: feedback text, totals and calculated columns, effort and
   suggested start.
9. **Inbox decision notes.** Leaving notes out also removes the Inbox decisions collection the
   assistant could search since Phase 21. Default: removed with the rest (PM ruling W-2). A question
   about a past Inbox decision is then answered only from what the planner and grades show.
10. **The answering model's own second search.** Default: it may search course materials up to three
    more times and open ten units. Uploads and memory reach an answer through the runner's search and
    through attachments, not through a second search by the model.
11. **Today's page between the two PRs.** Default: answers stay plain text with no bracket labels
    until 24b, and the sentence for "nothing of his matched" is written by the runner as the answer's
    first line.
12. **The old transcript volume.** Default: left in place and unused after 24a. Removing it is a step
    on his word.
13. **More PRs than two.** 24a also needs a companion PR in bb2dash-stack (the secret's name, the
    doctor, two acceptance-run actions) and one test-only PR to `main` the day two migrations are
    applied. Default: both, as Phases 21 and 23 had.
14. **Order with the Phase 23 follow-ups.** Default: the follow-ups merge first, and 24a re-does the
    apply image's checks after merging `main`.
15. **Phase 21's acceptance pack.** Default: not run again after 24a's cut-over, and removed in 24b.
    Phase 21 stays accepted.
16. **Drafting help and course rules.** The assistant applies no course AI-use rule (DECISIONS
    2026-10-05, scope calls). Default: unchanged; the routine is his decision.
17. **The Inbox exporter's schedule.** The draft batch would have scheduled it. With notes out it is
    not part of this phase. It stays Phase 23's open item.
18. **A known gap, not fixed here.** The `search` function answers any signed caller with the service
    role. Uploads and memory never pass through it. Fixing it is put to him separately.
