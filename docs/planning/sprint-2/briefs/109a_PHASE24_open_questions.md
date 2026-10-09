# Phase 24: Workspace assistant. Stack's seventeen answers, on record

2026-10-08 · one batch of sixteen, answered the same day, and one sentence of his own after it
(answer 17) · this file replaces the draft batch of ten questions that stood here at 4bf223e.

Briefs `109_PHASE24_workspace_assistant.md` (Phase 24a) and `111_PHASE24B_workspace_page.md` (Phase
24b) are drawn to these answers. Where a PM ruling and his words differ, his words win.

**How to read it.** His own words are in quotes. Where he picked an option, the option is given as it
was put to the PM's planning run. Answers 1 to 11 are his. Answers 12 to 16 were listed to him as
taken, and he did not object. Answer 17 is his own sentence, written after the batch; no question
was put for it.

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

### 17. The retrieval store

* **Options.** Not on file: no question was put. It is his own sentence, after the batch. It
  follows the last sentence of answer 2.
* **He wrote, 2026-10-08:** "for phase 24 ensure that a pgvectors rag db is actually put in place,
  scoped specifically to the bb2dash app for future scalability."
* **What is there today** (read on the live database, 2026-10-08, names and counts only). pgvector
  is installed, version 0.8.2. It serves course-file text only: one vector column,
  `bb_text_embeddings.embedding`, 384 numbers a row, with one HNSW index, `bb_text_embeddings_hnsw`.
  It holds 2,011 vectors over 982 pieces of course text, all made by the same model, `gte-small`.
  His uploads and the assistant's memory have no vector home yet.
* **What it decides.** Brief 109 holds the store as a contract clause of its own, "The pgvector
  store, scoped to bb2dash", with its proof in task 49. In five points:
  1. One pgvector store, scoped to bb2dash. Every service 24a builds reads and writes its text and
     its vectors through named functions, and nothing in it reads the vault's separate store or
     any other project. The page has two narrow rights of its own on the store's tables; item 24
     below lists them.
  2. It holds three kinds of content: course files, his uploads and the assistant's memory. One
     search covers all three and names the kind on every hit.
  3. Every vector column has an HNSW index, and every vector row records the model that made it, so
     the content can be embedded again with another model of the same size by adding rows, with no
     change to a table.
  4. Ingestion is a queue with one status row he can read: for each kind, how many are in, how many
     wait and how many failed. The same content sent twice leaves one row.
  5. Nine proofs in the task list show it is there once 24a is applied, each a statement a worker
     runs as written with its expected result. One of the nine has two parts.
* **The default the PM took.** The store is inside the existing bb2dash Supabase project, not a
  second project, and in the schema the app already uses. It is laid out so it could be lifted into
  its own project later, and the brief names what a move would have to change. The largest piece
  is that the course half reads the app's list of files inside its search. Five smaller objects
  also stand on both sides, and the brief lists them. His to object to.
* **What it does not do now.** No second project. No change of the embedding model. Items 23 to 25
  below came with it. Item 23 is a question for him. Items 24 and 25 are defaults.

## Still open, with the default taken

The design needed these and he was not asked. Each default is built unless he says otherwise. None
blocks the freeze but item 23. Items 19 to 22 were added by the challenge round of 2026-10-08
(brief 109, Appendix 2), which also changed the wording of items 2, 3, 6, 10, 11, 14 and 15. Items
19 and 20 are the two a reviewer asked to have put to him by name. Items 23 to 25 came with answer
17 (brief 109, Appendix 3), and the review round of the store's clause changed items 23 and 24
(brief 109, Appendix 4). **Item 23 is not a default.** It corrects one thing he was told, so it is
a question put to him before the freeze, and the freeze waits for his answer.

1. **Deep after one question.** Default: Deep applies to that question, then the menu returns to Auto
   (PM ruling W-9). Quick and Standard stay until he changes them.
2. **Memory before he can see it.** The list and the delete control are on the new page, which is
   24b. Default: the path is built and tested in 24a, and no memory item is written until 24b turns
   it on. The rolling summary that keeps a long conversation in context is not a memory item and is
   on from 24a. When 24b turns memory on, nothing said before the switch is summarised: only a
   conversation answered after it. Most of the conversations there today were made by test scripts.
3. **Deleting a remembered item.** Default: that conversation is not summarised again. Deleting an
   uploaded file takes it out of search at once; an answer already written keeps what it quoted.
4. **The quiet wait before a conversation is summarised.** Default: 15 minutes after its last answer.
5. **Limits.** Defaults: the About me note is 2,000 characters; an upload is 20 MB at most and one of
   pdf, docx, pptx, xlsx, plain text or Markdown; five attachments a question; a remembered item is
   1,000 characters.
6. **The planner: fed or indexed.** He offered both forms. Default: an explicit data feed read on
   every answer (PM ruling W-6), because dates and statuses change and a structured read is exact.
   The feed is never indexed. A remembered summary is, and it is written from conversations that may
   have quoted a due date or a score, so the summary's instructions forbid due dates, statuses and
   scores, a remembered item carries its date, and the assistant is told the feed is the current
   figure. That lowers the chance of a stale date coming back and does not remove it.
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
    through attachments, not through a second search by the model. A passage it finds that way and
    does not open is named in words and is not listed as a source. A long uploaded file is read as
    far as the question's budget allows, and the answer says when it was read in part.
11. **Today's page between the two PRs.** Default: answers stay plain text with no bracket labels
    until 24b, and the sentence for "nothing of his matched" is written by the runner as the answer's
    first line. **What that sentence says.** His answer 8 asks that it say plainly that it found
    nothing of his. The planner is read on every answer and a follow-up rests on the conversation,
    so on a planner question those words would be false. Default: the sentence says that no passage
    of his course files or uploads matched, and it is not written at all when an attached file was
    read. His to reword.
12. **The old transcript volume.** Default: left in place and unused after 24a. Removing it is a step
    on his word.
13. **More PRs than two.** 24a also needs a companion PR in bb2dash-stack (the secret's name, the
    doctor, two acceptance-run actions) and one test-only PR to `main` the day two migrations are
    applied. Default: both, as Phases 21 and 23 had.
14. **Order with the Phase 23 follow-ups.** Default: the follow-ups merge first, and 24a re-does the
    apply image's checks after merging `main`. The follow-ups' brief (110) took worker numbers W-80
    to W-84 the same afternoon, so this phase's umbrella worker is W-85 and the page's three are
    W-86 to W-88. That brief once said neither phase edits a file under `docker/apply/`; 24a edits
    four there, and brief 110 has since corrected its own sentence (read at 500405b). Nothing on
    the follow-ups' branch is the 24a session's to edit.
15. **Phase 21's acceptance pack.** Default: not run again after 24a's cut-over. It is not removed,
    in 24a or in 24b: the acceptance suite uses pack 21 as its fixture, so its files stay in the
    tree. Phase 21 stays accepted.
16. **Drafting help and course rules.** The assistant applies no course AI-use rule (DECISIONS
    2026-10-05, scope calls). Default: unchanged; the routine is his decision.
17. **The Inbox exporter's schedule.** The draft batch would have scheduled it. With notes out it is
    not part of this phase. It stays Phase 23's open item.
18. **A known gap, not fixed here.** The `search` function answers any signed caller with the service
    role. Uploads and memory never pass through it. Fixing it is put to him separately.
19. **Quick, and Auto on short lookups: no model plans the search.** His words in answer 2 ask for "a
    cheap model to orchestrate those retrievals, while a higher level model then takes the context".
    That is what Standard and Deep do. On Quick, and on Auto whenever the router sends a question to
    its low tier, no model plans: the runner searches with his own words and the cheap model writes
    the answer. Auto is the only depth today's page can send, and a reviewer read 20 of 38 stored
    answers at the low tier on 2026-10-08 (4 mid, 14 high; most were test questions). Default: as
    built, because a lookup then costs one turn and not two. If he objects, the cheapest change is a
    planning turn on the low tier as well: one more cheap turn of at most 0.05, inside the same
    ceiling.
20. **The service that reads his uploads, and what a hostile file could do to it.** A file from his
    device is opened by a parser, and for a PDF that parser is a C++ program. In 24a it runs in its
    own container with no model, no Claude sign-in and no service key, as its own user with no
    secret and no network, with a memory limit and a process limit. A file that took over the parser
    could return wrong text for files and nothing else. A file that got past that to the worker
    beside it could read his other waiting uploads and send them out by three ways the Phase 21
    review recorded and he left open "for now" for the Workspace (2026-10-07): another site on a
    shared Cloudflare address, name lookups, and the database's own web requests. There, nothing
    runs code he did not write; here a parser reads files nobody vetted. Default: built as described,
    with those three ways still open. Closing them is a name-checking proxy, a later phase. His to
    object to, or to limit uploads to plain text and Markdown, which no parser reads.
    * **After the probe of 2026-10-08 (P-10).** The parser no longer shares a container with the
      worker. This Docker ignores the setting that would have kept the worker's two secrets from a
      second user, so the parser runs in a service of its own, `workspace-extract`: no network, no
      secret, a read-only file system. A file that took over the parser could still return wrong
      text for files and nothing else; to read his waiting uploads it would now also have to get
      out of its own container. The three ways out named above are unchanged for the worker's
      container. Brief 109, Freeze amendments, F-3.
21. **His name in the greeting.** The reference picture greets its user by name. The app holds no name
    of his anywhere, and a name typed into the code would sit in a public repository. Default: a
    greeting with no name. If he wants one, the cheap moment is before 24a's migration 195 is
    frozen: one column on the About me row, which he fills in himself.
22. **One step that is his own.** The upload service signs in to the database as a new login,
    `workspace_ingest_runner`. Its password is his to set, as on 2026-10-05 for `workspace_runner`: a
    snippet on his laptop makes it, he runs one line in the SQL editor, and the snippet stores the
    connection string in his secrets folder. It never passes through a chat, a repo file or a
    migration. It is needed before the PM's walk and before the cut-over (brief 109, task 48).
23. **A question for him, before the freeze: what the proof of the index shows.** He was told
    that a proof would show the search's query plan using the index. That is true of one of the
    app's searches and not of the one the assistant uses.
    * **Where it is true.** The app has a plain nearest-neighbour search over course files, the
      "vector" mode of its search. The proof reads the plan of that search's own statement, and
      the plan must name the index.
    * **Where it is not.** The assistant's search compares the question against every vector and
      keeps the best piece of each page or slide. At 2,011 vectors that is exact, it misses
      nothing, and it is the ranking Phase 18 timed. It uses no index. For his uploads and the
      assistant's memory there is no nearest-neighbour search yet, so the proof there shows only
      that the index is valid and could serve one.
    * **What he is asked.** (a) Leave the assistant's ranking as it is. Every vector column gets
      its index now, and the assistant's search moves onto the index later, when its timed median
      passes 60 ms. That later move changes two functions and no table. Or (b) move the
      assistant's search onto the index in this phase. That is its own piece of work with its own
      measurement, because it changes which passages come back, and the freeze moves for it.
    * **What the PM would pick:** (a). An index answers "the nearest few first" and starts to
      pay when there are many times more vectors than today.
    * **Before it goes to him** the PM reads on the live database which plan the plain search
      gets today with nothing forced, and writes it here: the index, or a scan of all 2,011
      rows. Either is a fair plan at this size, and he should see which it is.
    * **Read on the live database, 2026-10-08** (the planning session; read-only, `explain
      (analyze)` with a stored vector standing in for the question and no course filter). The
      plain search, the statement of `match_file_text` with nothing forced, gets the index:
      `Index Scan using bb_text_embeddings_hnsw`, 1.0 ms once the index was in memory (195 ms on
      the session's first call). The assistant's search, `hybrid_search_file_text`, called seven
      times in one statement with seven made-up questions: 16.8 to 167.7 ms, median 30.0 ms.
      That is half of the 60 ms line in (a).
    * **Put to him** in the terminal the same evening, with those figures and with the
      correction of what he had been told. If no line beginning `His answer to item 23` stands
      below, he had not answered when that session ended: ask him again before the freeze.
    * **His answer** is then written under this item on a line of its own, indented four spaces,
      that begins with the bold words `His answer to item 23` and carries its date. Brief 109's
      task 12 looks for that line, and the freeze waits for it.
24. **Direct paths to the store's tables: one is closed, three older ones stay, and the page has
    two of its own.** The rule "only through named functions" holds for every service 24a builds,
    for text and for vectors. It was not true of the course half before.
    * **Closed in 24a.** A rule from September lets a holder of the app's public key insert a row
      into the course vectors. No code uses it. The first pass listed it and left it. The review
      round ruled it in, because a store that a stranger can write into is not scoped to
      bb2dash. One migration (198) removes the rule and nothing else. Default: closed. His to
      object to, before 198 is applied.
    * **Three older ones stay as they are.** The sync inserts course text with the public key
      under an insert-only rule. The assistant's read of one whole page goes straight to the
      table with the service key. And his own signed-in session may read and write both course
      tables, though no page does.
    * **What the first of those means.** The insert-only rule is open to anyone who holds the
      public key, not to the sync alone, and that key is in the web app by design. Such a person
      could add a piece of text to a course file. They could not read, change or remove
      anything. Added text would be indexed at the next sync and could come back in an answer,
      marked as a course passage. Closing it means moving the sync's insert behind a function.
      That is a change to the sync, and it is not in this phase. His to say whether it becomes
      its own piece of work.
    * **Two new ones are the page's.** His signed-in session reads the list of his uploads and
      changes an upload's title and course directly. It reads what the assistant remembers
      through a view. The right behind that view would also let his own session read the text
      of his own uploads, which no page does. He was told "never through a table a caller
      touches directly"; for these two that is not so. Default: as built, because the page's
      reads are plain reads by design (brief 111). His to object to.
25. **The same file sent twice is one file.** An upload is known by the SHA-256 of its bytes. The
    page works it out before it sends anything, the file is stored under a name made from it, and
    the upload service checks it against the bytes it downloaded. Default: sending a file that is
    already there uploads nothing and gives him the copy he has, with the title and the course it
    already carries. If he would rather have two entries for one file, that is a change to make
    before migration 190 is frozen.
