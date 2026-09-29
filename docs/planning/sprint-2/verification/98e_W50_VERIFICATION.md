# 98e — W-50 verification note (Phase 18, crawler stream)

Worker W-50 · branch `feat/ingest-corpus-18-crawler` · worktree `bb2dash-wt-18-crawler`
Brief: `docs/planning/sprint-2/briefs/98_PHASE18_ingest_corpus.md` (frozen 2026-09-29).
Tasks owned: 5, 18 (fixture half, under B-36's default), 19 (later; waits for 98a §4 and the gate crawl).

No Blackboard session was used. Every check below runs on fixtures and stubbed `fetch`.

Setup note: `npm ci` in `web/` refuses on this branch's base (`main` de7c644) because
`package-lock.json` lacks `@emnapi/runtime@1.11.3` and `@emnapi/core@1.11.3`. Dependencies were
installed with `npm install`, and `package.json` / `package-lock.json` were restored with
`git checkout` straight after, so the branch carries no lockfile change. The PM may want the
lockfile fixed on `main` separately.

---

## Task 5 — crawler v5 probe

Check: `cd web && npx vitest run test/crawler.announcements.test.ts test/crawler.attempts.test.ts test/fixtures.phase12b.test.ts`
→ 0 failures; `grep -c "const CRAWLER_VERSION = 5;" ingest/bb_crawler.js` → 1.

Baseline before any edit: `Test Files  3 passed (3)` · `Tests  89 passed (89)`.

### RED (tests written, crawler unchanged)

```
 Test Files  2 failed | 1 passed (3)
      Tests  23 failed | 90 passed (113)
```

Failing cases included: `keeps a bare `_123_1` creator as authorUserId with author null`,
`reads feedbackToUser: {rawText} into text.instructorFeedback`,
`counts an unknown author shape as one AUTHOR_KEYS miss per announcement`,
`v5: counts an unknown feedback shape in the caller's misses, once per attempt`,
`is 5 — the v4 chain plus the Phase 18 probe`.

```
$ grep -c "const CRAWLER_VERSION = 5;" ingest/bb_crawler.js
0
```

### GREEN

```
 Test Files  3 passed (3)
      Tests  113 passed (113)
```

```
$ grep -c "const CRAWLER_VERSION = 5;" ingest/bb_crawler.js
1
```

`npx eslint test/crawler.announcements.test.ts test/crawler.attempts.test.ts --max-warnings 0` → exit 0.

What changed in `ingest/bb_crawler.js`:

* `CRAWLER_VERSION = 5`. Every course payload has `crawler.probe = { announcementKeys: { <C>: sorted raw keys },
  idShaped: [{ key, value }], misses: { <list>: n } }`.
* `AUTHOR_KEYS` starts with `creatorUserId`. `announcementAuthor` / `mapAnnouncement` return `authorUserId`
  (a bare `_N_N` string, or the `id` / `userId` of a user object), and never show it as `author`.
* `misses` counts: `AUTHOR_KEYS` for each announcement with neither a name nor an id;
  `ATTEMPT_FIELD_KEYS.<field>` for each attempt detail, and `ATTEMPT_FILE_KEYS.<field>` for each file, where the list found nothing.
  A failed detail request adds no misses, because `steps` already records it.
* `ATTEMPT_FIELD_KEYS.feedback` = `feedbackToUser.rawText`, `feedbackToUser.displayText`, then v4's two
  `instructorFeedback` paths. The prose still lives only under `results[].text`.
* `idShaped` skips the announcement's own `id`, records only `_N_N` strings (never prose), is deduped
  per (key, value) and capped at 50 per course.
* The header's "STILL UNVERIFIED" / "ALSO NOT" lines are left for task 19.
