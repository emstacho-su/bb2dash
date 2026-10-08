# Phase 24: Workspace assistant. Ten questions for Stack

2026-10-08 · one batch · ordered by how much the answer changes the build · DRAFT beside
`brief-draft.md`.

Answer "defaults" to take all ten as written. Each answer becomes a DECISIONS row the day you give it.
Nothing is built before you answer.

Two things the readers found that you should know first:

* Your "rag db" is already on Supabase. It is its own project, `harness-memory`, fed by your vault
  (agentic-harness `README.md:41-49, 178`). No move is needed. The plan file
  `abundant-gathering-wirth.md` is not on this laptop (`~/.claude/plans/` holds eight other files).
* The Workspace has answered 40 questions and 37 were test scripts (R4, 2026-10-08 16:12 UTC). It
  searches only when the model decides to, and it can see 2 of your 33 note collections (R3).

---

## 1. Attaching files

**Question.** When you attach a file to a question, is picking a file already in your materials
enough, or do you also want to upload new files?

**Why it matters.** Upload is the largest single piece of new machinery: storage, text extraction and
indexing, all of which must stay away from the Blackboard login.

**Default.** Existing files only. "Attach" opens your materials and adds one as a chip.

**If you answer otherwise.** Upload becomes its own follow-up phase (a bucket, an extractor outside
the sync, an attachments table). I would then need one more answer: uploaded files stay private to the
Workspace (my recommendation) or join the course materials everywhere.

## 2. What it remembers about you

**Question.** What may the Workspace remember about you without being asked, and how do you delete it?

**Why it matters.** Anything it learns by itself is text a model wrote, kept where your other agents
can read it.

**Default.** Nothing automatic. You write a short "About me" note that it reads on every question. You
press Keep on an answer worth keeping. Forget removes a kept answer, and it is gone from the store by
the next nightly job. Conversations can be archived, not deleted, as today.

**If you answer otherwise.** "Summarise each conversation by itself" adds a background Haiku turn when
the Workspace is idle, one more migration, two more functions for the runner and a list where you read
and forget each summary. "Learn facts about me" is more of the same, and I would not put it in this
phase. "Let me delete conversations" adds one small migration.

## 3. Where kept answers live

**Question.** Should a kept answer become a note in your notes store (`harness-memory`, through your
vault), so your other Claude sessions can find it too?

**Why it matters.** It decides who can find it later: every agent that reads your notes store, or only
this app.

**Default.** Yes. One vault note per kept answer, in its own collection `bb2dash-workspace`, filed by a
scheduled job. Only if your vault's `projects` remote is private, which I check first: a kept answer
holds text built from your professors' materials.

**If you answer otherwise.** Kept answers stay inside bb2dash's database with their own index. The
vault exporter drops out, a new embed path is built, and your other agents never see them.

## 4. What it may change

**Question.** May the assistant change anything besides its own notes?

**Why it matters.** Your planner, progress and grades are protected from every sync and every
assistant today, with two narrow exceptions you approved.

**Default.** No. It reads. Its only writes are the source list of each answer and the notes you keep.

**If you answer otherwise.** Things like "mark this done" or "add a study block" become a later phase
with a propose-then-approve step. This phase does not change.

## 5. Due dates and progress

**Question.** May the assistant read your due dates and progress, without grades?

**Why it matters.** In a dashboard for your classes "what is due this week" is the obvious question,
and today it cannot see the planner at all (DECISIONS 2026-10-05, O-4).

**Default.** No new reach. The opening screen offers example prompts built from your real upcoming
items, with the title and date in the text, so those questions work because you send that text
yourself. Grades stay on the Grades screen.

**If you answer otherwise.** Yes adds one read-only tool over a view (titles, due dates, status, no
grades), one function, one gate entry and one migration. If you also want grades, I would come back
with the "graded so far" rule in hand before building it.

## 6. Which notes it may search

**Question.** Which of your note collections may it search?

**Why it matters.** This is the "connected to my rag db" part: today two collections pass the gate
(DECISIONS 2026-10-05, O-1).

**Default.** The class-note collections of your current courses (`ist466`, `ist471`, `ist323`,
`ist352`, `ecn304`, `geo103`), your Inbox decisions, and your kept answers. The app's own development
notes (`bb2dash`) only when the assistant asks for them. Everything else stays out: `stack`, `ist335`
and the other projects. Reading a whole note stays off. For scale: `ist466` holds 127 notes and the
other five hold 1 to 8 each (R3).

**If you answer otherwise.** "Everything" means one search per question, not up to eight, and
notes from unrelated projects can show up in study answers. "Fewer" shortens the list. Either is one
constant and its tests.

## 7. Formatted answers

**Question.** Should answers show formatting: headings, lists, tables and code?

**Why it matters.** A study guide or a quiz is hard to read as one block of text, but showing
formatting adds one library to the web app and reverses the "plain text in v1" call (O-5).

**Default.** Yes, rendered safely with raw HTML off.

**If you answer otherwise.** Answers stay plain text. Source chips still work. No new library.

## 8. Choosing the depth

**Question.** Do you want to set the depth yourself: Auto, Quick, Standard or Deep?

**Why it matters.** Today a question sent to the wrong model can only be asked again, but Deep uses
the most of your plan and a menu reverses the "no model picker in v1" call (O-5).

**Default.** Yes, with Auto as the starting choice. Auto is today's router.

**If you answer otherwise.** The router keeps choosing alone. One column and one menu are dropped.

## 9. How much of your plan a question may use

**Question.** Is the current ceiling still right: at most 1.00 per answer, one question at a time?

**Why it matters.** Retrieval makes every question larger, and the Workspace shares your plan with
your own sessions.

**Default.** Unchanged: 1.00 per answer (Claude Code's own list-price estimate, not a charge), one
question at a time, Opus only when routed or chosen, no background model work. A long conversation starts a fresh session once its running estimate passes
0.60. I prove ten turns in one conversation before building on it.

**If you answer otherwise.** A lower ceiling is one setting. A higher one is a code change. A daily
ceiling or an Off switch is new work: a table and a check.

## 10. A file that failed to index

**Question.** If a new file fails to get indexed, is "retried at the next sync" good enough?

**Why it matters.** A file that is not indexed cannot be found by the assistant, and the next sync can
be up to a day away.

**Default.** Yes. Every sync retries what is missing, and the page shows how many are waiting.

**If you answer otherwise.** A database timer retries within minutes. That adds one migration and one
stored key, and it runs whether or not you sync.

---

## Not questions, but they need your word when the time comes

* **Walk windows.** Only one runner may answer from the queue. To test, I stop your live Workspace for
  a short window and start the test one. Questions you ask meanwhile wait and are answered after.
* **Applying migrations 190 to 194 to prod.** All additive. The live Workspace keeps working after
  each.
* **The cut-over after the merge.** Three rebuilds, one at a time, with no sync open: `workspace`,
  `apply`, `sync`.

The page work waits for Phase 22's merge. The database, the runner and the exports can be built beside
it, as you allowed ("or while they are going in parallel").
