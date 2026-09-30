# 98f — W-51 verification note (Phase 18, the web stream)

Worker W-51 · branch `feat/ingest-corpus-18-web` · worktree `bb2dash-wt-18-web`
Owns the "W-51" row of brief 98 §Workers. Tasks: **23, 24, 25** (W-51's parts). The B-36 fallback
(task 18's) is not this worker's to run and was not touched.

**Install note.** `npm ci` in `web/` exits 1 on this branch (and on `main` de7c644, which it
equals): `Missing: @emnapi/runtime@1.11.3 from lock file`, `Missing: @emnapi/core@1.11.3 from lock
file`. `npm install` was run instead and `package-lock.json` restored with `git checkout` straight
after, so no lock change is committed. For the PM: the lock file needs a refresh on `main`.

All checks run from `C:/Users/stack/projects/bb2dash-wt-18-web/web` unless stated.

---

## Task 23 — `web/src/lib/blackboard-link.ts` (R-69)

`blackboardLink(assignment, course)` → `{ href, scope: 'item' | 'course' }` or `null`:
the item's `bb_url` when it is https and its origin equals the course `bb_url`'s origin; else the
course `bb_url` when it is https; else nothing. `javascript:`, `http:`, blank and malformed values
never reach an `href`. With no usable course URL there is no origin to check an item URL against,
so the function answers `null`. Used by `AssignmentDetailBody.tsx` (the footer, and
`SubmissionBlock`'s `blackboardUrl`) and `PlannerItemPopover.tsx`. The footer keeps its
"(course)" suffix only on the course fallback; both hover titles come from
`BLACKBOARD_LINK_TITLE`. Tests run on fixtures (migration 126's shape, IST.323 Lab 1); prod
`assignments.bb_url` is W-48's migration 126.

Tests: `web/test/blackboard-link.test.ts` (new, 8 cases), 5 new cases in
`web/test/AssignmentPopout.test.tsx` (footer item/course/refused, the staged link keeps the name
"Staged in bb2dash — attach in Blackboard ↗" and takes the item URL, old copy gone), 3 in
`web/test/PlannerItemPopover.test.tsx`.

**RED** (tests written, no implementation):

```
$ npx vitest run test/blackboard-link.test.ts test/AssignmentPopout.test.tsx test/PlannerItemPopover.test.tsx
 FAIL  test/blackboard-link.test.ts [ test/blackboard-link.test.ts ]
Error: Failed to resolve import "@/lib/blackboard-link" from "test/blackboard-link.test.ts". Does the file exist?
     × opens the assignment's own page, with no "(course)" suffix, when it has one
     × points a staged file at the assignment's own page too
     × no longer says Blackboard has no per-item url
     × opens the assignment's own page when it has one
     × no longer says Blackboard has no per-item url
 Test Files  3 failed (3)
      Tests  5 failed | 44 passed (49)
```

**GREEN:**

```
$ npx vitest run test/blackboard-link.test.ts test/AssignmentPopout.test.tsx test/PlannerItemPopover.test.tsx
 Test Files  3 passed (3)
      Tests  57 passed (57)
$ npx vitest run ... test/SubmissionBlock.test.tsx test/audits.test.ts   # neighbours: no "Submit" control
 Test Files  5 passed (5)
      Tests  88 passed (88)
$ git grep -c "no stable per-item URL" -- web/src ; echo "exit $?"
exit 1
```

---

## Task 24 — `CourseScreen.tsx`: no "no files" on a course with 0 session-linked files (R-67 interim)

Named hunks only (the seam with Phase 17's W-45): the `SessionRow` call site passes
`fileCount = null` when `filesBySession` is empty (0 linked files, or the files query not landed),
and `SessionRow`'s sub-line renders only when `fileCount !== null`. `SessionPanel` and the rest of
`SessionRow` are untouched. With ≥ 1 linked file the per-session counts are as before, "no files"
included.

Test: `web/test/course-timeline-files.test.tsx` (new, 3 cases, IST.352 fixture sessions 129–131).

**RED:**

```
$ npx vitest run test/course-timeline-files.test.tsx
     × prints no "no files" line on any session when the course has 0 session-linked files
     × prints nothing while the files query has not landed
TestingLibraryElementError: Found multiple elements with the text: no files
 Test Files  1 failed (1)
      Tests  2 failed | 1 passed (3)
```

(The third case, per-session counts with ≥ 1 linked file, passes before and after: it is today's
behaviour, kept.)

**GREEN:**

```
$ npx vitest run test/course-timeline-files.test.tsx
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

`npx eslint CourseScreen.tsx --max-warnings 0` reports 2 pre-existing `react-hooks/exhaustive-deps`
warnings at :88 and :89 (`sessions`, `workItems`); they are on `main` too and are W-45's to fix
(brief 98 §Seams), so this hunk leaves them alone. 0 errors.

---

## Task 25 (W-51's parts) — search docs state each mode's shape (R-74)

Comments only. `web/src/lib/queries.search.ts`: the header now states per mode what a row holds
(fts: `rank` + a plain whole-unit headline, no `score` / `similarity` / `part_no` /
`snippet_source`; vector: `part_no` of the nearest part, `similarity`, `text`, no `snippet` /
`score` / `snippet_source`; hybrid: `score`, `similarity`, `snippet`, `snippet_source`, `part_no`
the snippet was cut from), and the `SnippetSource`, `SearchResult`, `score`, `snippet`, `part_no`,
`snippet_source` and `matchedPart` comments were made mode-aware ("absent on a pre-021 backend"
is gone). `supabase/functions/search/index.ts`: header comment only — every mode named with its
row shape, the 025 tie-break (highest `ts_rank`, then vector-best, then lower `part_no`) in place
of "lowest-numbered", and the version tags dropped. **No code line changed and nothing was
deployed**; the deployed source differs from the repo's header until the next deploy (§DoD's merge
bullet). Shapes read from `db/migrations/021_matched_snippets.sql` (`match_file_text`),
`024_snippet_fixes.sql` (`search_file_text`) and `025_snippet_part_rank.sql`
(`hybrid_search_file_text`) and the function body. `DATA_SYNTAX.md` (W-48) and
`EVAL_EMBEDDING_POC.md` (W-49) are not this worker's.

**RED** (before the edits):

```
$ grep -cF "to each result row" web/src/lib/queries.search.ts
1
$ grep -cF "lowest-numbered" supabase/functions/search/index.ts
1
$ grep -cF "(v4)" supabase/functions/search/index.ts
1
```

**GREEN:**

```
$ grep -cF "to each result row" web/src/lib/queries.search.ts
0
$ grep -cF "lowest-numbered" supabase/functions/search/index.ts
0
$ grep -cF "(v4)" supabase/functions/search/index.ts
0
$ git diff <both files> | grep '^[+-]' | grep -v '^[+-]\s*(\*|/\*\*|//)'   # non-comment lines
(none)
```

---

## Task 24, after the Phase 17 merge — the test follows the timeline to `CourseTimeline`

Phase 17 (PR #43) deleted `classwork/CourseScreen.tsx`; the timeline is now
`web/src/components/course/CourseTimeline.tsx` + `TimelineRows.tsx` (the Stream tab), and the PM
ported task 24's rule there (72baa93). `origin/feat/ingest-corpus-18` was merged into this branch
(no rebase), and `web/test/course-timeline-files.test.tsx` was rewritten to render `CourseTimeline`
through the Supabase-chain mock `CourseTimeline.test.tsx` uses (IST.352, week 6, clock Tue Sep 29).
Same three cases; the "files not landed" case now checks the pane's "Loading the timeline…" state,
because `CourseTimeline` draws no rows until every source has answered.

**RED** (after the merge, before the rewrite):

```
$ npx vitest run test/course-timeline-files.test.tsx
 FAIL  test/course-timeline-files.test.tsx
Error: Failed to resolve import "@/app/(app)/course/[id]/classwork/CourseScreen" from "test/course-timeline-files.test.tsx". Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

**GREEN:**

```
$ npx vitest run test/course-timeline-files.test.tsx
 Test Files  1 passed (1)
      Tests  3 passed (3)
$ npx vitest run
 Test Files  123 passed (123)
      Tests  2128 passed (2128)
$ npx eslint . --max-warnings 0     # exit 0
$ npm run typecheck                 # exit 0 (after `npm ci`, which now succeeds on the merged lock)
```
