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

Commit: `efd424c feat(18-5): crawler v5 probe, bare creator id kept, feedbackToUser first`.

---

## Task 18 — author resolution, fixture half (B-36 default)

Built under B-36's default (Blackboard is expected to send a resolvable `creatorUserId`). The live
half (the post-fold SQL on `<run2>`) is the PM's, after L7's second sync. The B-36 fallback was
not built.

Check: `cd web && npx vitest run test/crawler.announcements.test.ts` → 0 failures on
`db/fixtures/phase18/announcements_v5.json` (a teacher id resolves with 0 fetches; two posts by one
unknown id → exactly 1 fetch; a 403 → `author: null` plus a miss).

### RED (tests and fixture written, crawler at task 5)

```
 Test Files  1 failed (1)
      Tests  15 failed | 27 passed (42)
```

Failing cases included: `resolves a teacher id with no lookup at all`,
`looks an unknown id up exactly once, however many posts carry it`,
`turns a throwing lookup into author null plus a miss, and never throws`,
`fetches only the distinct ids no teacher row answers, once each`,
`records the 403 as a miss in the probe`.

### GREEN

```
$ npx vitest run test/crawler.announcements.test.ts test/crawler.attempts.test.ts test/fixtures.phase12b.test.ts
 Test Files  3 passed (3)
      Tests  128 passed (128)
```

Full suite before stopping:

```
$ cd web && npx vitest run
 Test Files  107 passed (107)
      Tests  1898 passed (1898)
```

`npx eslint test/crawler.announcements.test.ts --max-warnings 0` → exit 0.

What the fixture holds (all ids and names invented; IST.323's real shell id): one teacher
(`_30000001_1`) and six announcements: a teacher post (resolves from `teachers`, 0 fetches), two
posts by one unknown id (`_30000002_1`, one `/users/` fetch → 200 → `users`), one by an id whose
lookup answers 403 (`_30000003_1` → `author: null`), one that already carries a name (no fetch),
and one with no creator at all. Expected: fetches `["_30000002_1", "_30000003_1"]`, and
`misses = { AUTHOR_KEYS: 1, userLookup: 1, authorUnresolved: 1 }`.

Behaviour in `ingest/bb_crawler.js`:

* `resolveAuthors(announcements, teachers, lookupUser, cache)`: teacher rows first, then at most one
  lookup per distinct id per run. `runAll` owns one `Map` and passes it to every `crawl`, and it
  caches failures too, so a 403 is not retried in the run.
* Only `_N_N` ids reach `GET /learn/api/v1/users/{id}` (and they are URL-encoded). A non-2xx answer,
  a throw or a nameless body is a `userLookup` miss. Each post left without a name adds `authorUnresolved`.
  Nothing throws.
* `authorSource` reads `teachers` or `users` for a resolved name. `personName` also reads the public
  `name: { given, family }` shape.
* Returns new objects, and the input is never mutated.

Assumptions the probe sitting (98a §1) must confirm:

1. The key is `creatorUserId` and holds a bare `_N_N` id (a user object carrying `id` / `userId` also works).
2. A student session may read `GET /learn/api/v1/users/{id}` for a course's staff. If it answers 403,
   authors outside `teachers` stay null, and the probe's `userLookup` count shows it.
3. `/users/{id}` returns `givenName` / `familyName` (internal) or `name.given` / `name.family` (public).
