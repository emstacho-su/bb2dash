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
