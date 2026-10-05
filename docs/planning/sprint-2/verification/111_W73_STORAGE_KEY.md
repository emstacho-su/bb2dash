# 111 · W-73 verification — Storage keys keep only the characters Storage accepts

Worker W-73. Branch `fix/storage-key-safe-chars`, worktree `C:/Users/stack/projects/bb2dash-wt-storage-key`,
cut from `origin/main` 3d7683a. Unit tests only: no live pull or sync, no call to Supabase prod or
Storage, no `docker compose up` / `just up`. ~~No SQL or migration change.~~ Round 2 adds migration
`095_bb_file_storage_key.sql`, which is **not applied**: it gives `sync_file_stored`'s key gate the same
rule (see "Round 2" below). Round 2's only contact with prod was `scripts/db-test.mjs` as
`db_test_runner`, inside transactions that roll back.

## The refusal

File 2489, a GEO.103 reading named `Musk’s AI Fuels Pollution in Black Memphis Neighborhood - Capital B News.pdf`
(a curly apostrophe, U+2019), was refused on every sync on 2026-10-05. Request 1856's report lists it
in `not_pulled` with the reason `storage 400: {"statusCode":"400","error":"InvalidKey",…}`, and the
Inbox raised it as data-gap item 3441. (Both as recorded by the PM on 2026-10-05; this worker did not
query prod.)

The cause: `storageKeyFor(row)` in `ingest/pull_files.mjs` only replaced `#`, so the curly apostrophe
went into the object key as it was. Both runners build their keys there: the Windows skill path
(`pull_files.mjs` itself) and the container runner (`sync/src/files.ts` imports it).

## The allowed set, and where it was read

storage-api, `src/storage/limits.ts`, at supabase/storage commit 69bb550 (2026-09-21, the file's latest
commit when read on 2026-10-05; the set was last changed by 40cbd5f, "fix: use charset for bucket/key
validation (#1321)"):

```
// Hyphen is last so it stays a literal, not a range.
const VALID_OBJECT_KEY = /^[A-Za-z0-9_/!.*'() &$=@;:+,?-]*$/
export function isValidKey(key: string): boolean {
  // only allow s3 safe characters and characters which require special handling for now
  return key.length > 0 && VALID_OBJECT_KEY.test(key)
}
```

`mustBeValidKey` throws `ERRORS.InvalidKey` when it fails, which is the 400 the sync saw. Supabase's
docs (`guides/storage/debugging/error-codes`) list `InvalidKey | 400` but only say the key must
"follow the naming conventions"; the source is the only place the set is spelled out.

So a key may hold ASCII letters and digits, `_`, `/`, `!`, `.`, `*`, `'`, `(`, `)`, space, `&`, `$`,
`=`, `@`, `;`, `:`, `+`, `,`, `?` and `-`. Everything else is refused, including `#`, `%`, `~`, `[`,
`]`, `"`, `\`, tabs, curly quotes, dashes other than `-`, and every non-ASCII character. That matches
the brief's list.

## The change

- `ingest/pull_files.mjs`: `STORAGE_KEY_VALID` is storage-api's regex, copied exactly, and
  `STORAGE_KEY_REPLACEMENT = '_'`. `safeStorageSegment` replaces each refused character with `_`. It
  works on whole code points, so an emoji becomes one `_`. A decomposed `é` keeps its `e` and loses
  the combining accent. `sanitizeStorageKey` applies that to every `/`-separated segment and leaves
  the separators alone. `storageKeyFor` returns the sanitised override or relpath, and the old `#`
  rule is now one case of this. `encodeKey` is unchanged and still runs on the sanitised key.
  `local_path` (`course context/<relpath>`) and `file_name` keep the real characters.
- **The explicit `row.key` is sanitised too (decided here).** On any key Storage accepts, the
  sanitiser changes nothing, so a deliberate override such as file 145's re-upload key is still used
  byte for byte. A key Storage would refuse could never be stored as given. Its sanitised form is the
  only one that can work, and `storage_path` records the key that was actually used. So one rule
  covers every key in both runners, and nothing has to be refused at runtime.
- **An occupied sanitised key is refused, not resumed (the PM chose option A).**
  Two names that differ only in a refused character, such as `a’b.pdf` and `a“b.pdf` in one folder,
  now share the key `a_b.pdf`. Before this change, both runners accepted an occupied course key as
  "this same file", so the second row would have been recorded against the first file's bytes with
  no warning. That made the brief's assumption that "the existing 409 path covers it" true only for
  submissions. `duplicateIsAcceptable` now takes a `sanitised` flag, and the new
  `occupiedKeyRefusal(row)` returns the reason both runners report:
  `storage 409: key already occupied and this key was sanitised (<original> -> <key>); the object there may be another file; a human decides`.
  A course key that sanitising left alone resumes exactly as before. A submission keeps its own
  reason. A restale key still resumes, because its owner SQL checks the object's md5 eTag and size.
  `pull_files.mjs` now reports `storage <status>: <reason>` here, the same shape as the runner.
- `sync/src/files.ts`: calls `occupiedKeyRefusal(row)` where it used to call
  `duplicateIsAcceptable(isSubmissionRow(row))`, and its header names the rule.
- `skills/bb-sync/SKILL.md`: the step-4b 409 rule now says a sanitised course key fails the same way
  as a submission. The installed copy in `~/.claude/skills/bb-sync/` only picks this up at the next
  skill install.

### The trade-off, and the refinement for later

- **Cost of option A:** take a file with a refused character in its name (`#`, `’`, `é`…) whose
  earlier pass uploaded it and then failed later, for example on a text POST error. It no longer
  resumes. It becomes a loud `not_pulled` / Inbox item that a human clears.
- **Known limit (pinned in a test, to flip later):** a name that already holds `_` where another name
  has a refused character is not sanitised. If that one arrives *second*, its occupied key still
  resumes and it would be recorded on the other file's bytes.
- **Refinement for later, on Phase 14's deferred list, not this PR:** accept an occupied key only when
  Storage's object metadata (size and md5 eTag) matches the bytes just fetched. The restale owner SQL
  already does this for its own path. That check closes both the cost and the known limit.

## Tests

`ingest/pull_files.test.mjs` adds 16 W-73 tests:
- the `#` case is unchanged
- 2489's real name becomes `…/Musk_s AI Fuels Pollution in Black Memphis Neighborhood - Capital B News.pdf` (one `_`)
- `é`, `“ ”`, `%`, `[`, `]`, `~`, en and em dashes, tab, `"` and `\` each become one `_`
- emoji and decomposed accents
- every allowed character is kept: `'`, `(`, `)`, `&`, `+`, `,`, `=`, `@`, `:`, `;`, `?`, `$`, `*`, `!`, space, `-`, `.`, `_`
- sanitiser and `STORAGE_KEY_VALID` agree on every code point from U+0000 to U+02FF and on the usual typographic marks
- the separators are left alone, and sanitising twice changes nothing
- explicit keys
- a submission keeps its layout and `attempt-` segment
- a restale key is sanitised and still resumes
- `encodeKey` runs on the sanitised key
- `keyWasSanitised`, and the reason for each kind of occupied key
- the two-name collision, plus the known limit above

`sync/test/files.test.ts` adds 4:
- 2489's key reaches Storage sanitised, while the relpath and the mirror file keep `’`
- an unsanitised course key resumes past a 409
- a sanitised course key refuses a 409, with the exact reason
- the two-name collision: the second arrival is refused, not stored

No existing test pinned an unsanitised key, so none was changed.

RED, before the fix:

```
node --test ingest/pull_files.test.mjs   -> ℹ tests 53 · ℹ pass 37 · ℹ fail 16   (all 16 new W-73 tests)
npx vitest run test/files.test.ts        -> Tests  2 failed | 31 passed (33)
   (the sanitised-409 refusal; the collision recorded both rows ['61','62'] instead of ['61'])
```

## Gates (last lines)

```
node --test ingest/pull_files.test.mjs ingest/fetch_signed.test.mjs ingest/extract_text.test.mjs
  ℹ tests 83 · ℹ pass 83 · ℹ fail 0

cd sync && npm run typecheck   -> tsc -p tsconfig.json --noEmit   (no output, exit 0)
cd sync && npm run build       -> ⚡ Done
cd sync && npx vitest run --coverage
  Test Files  7 passed (7)
       Tests  136 passed (136)
  Lines        : 91.32% ( 705/772 )   (threshold 80)
```

## What happens next

(Round 2 supersedes the first bullet: the order matters now. See "Round 2" below.)

- **Apply 095 first, then rebuild the container.** The container only gets the JS fix when its image is
  rebuilt (`just up` from `bb2dash-stack`, never while a sync is open). If the new image ran before
  095 was applied, it would upload 2489 under its sanitised key, and 091's gate would then refuse to
  record it. Every later sync would find that key occupied and sanitised and refuse it. The Windows
  `/bb-sync` fallback does not call `sync_file_stored` (it writes the owner SQL), so it needs only a
  `main` that includes this branch.
- After both, the next sync should pull file 2489 under
  `GEO.103/…/Musk_s AI Fuels Pollution in Black Memphis Neighborhood - Capital B News.pdf` and close
  item 3441 by itself. 2489 was never uploaded (every attempt drew a 400), so nothing occupies its
  new key, and the occupied-key refusal does not apply to it.
- **Not touched:** the web drop zone's staged-file key (`submissionRelPath` in
  `web/src/lib/queries.submissions.ts`) is still the raw file name. A staged file with `’` or `é` in
  its name would draw the same 400. Changing it would break that helper's contract to match
  `bb_file_relpath` exactly, so it needs its own decision.

## Round 2 — `/code-review fix/storage-key-safe-chars high`

**R2-1 (blocking): `sync_file_stored` would refuse the sanitised key.** 091's gate compares the key
with `replace(relpath, '#', '_')`. If the container ran with the round-1 code, it would upload 2489,
post its text, and then fail here with 22023. After that the key would be occupied and sanitised, so
every later sync would refuse it.

Migration `db/migrations/095_bb_file_storage_key.sql` (095 is the next free number in Phase 14's
range; there is no 092; 093 and 094 are live). md5 `eef743772a22c30c20598dbec1291eea`, from
`git show HEAD:db/migrations/095_bb_file_storage_key.sql | md5sum`. It is **not applied**. The PM
applies it with `mcp__Supabase__apply_migration` under the same name, after a dry run.

- `public.bb_file_storage_key(p_relpath text)`:
  - `language sql immutable parallel safe set search_path = public, pg_temp`
  - the body is `regexp_replace(p_relpath, '[^A-Za-z0-9_/!.*''() &$=@;:+,?-]', '_', 'g')`, the same
    rule as `storageKeyFor`
  - not SECURITY DEFINER; it keeps the default PUBLIC execute, as `bb_file_relpath` does
- `public.sync_file_stored` is re-created from its live body.
  - Before writing it, I read the live function through db-test: md5(prosrc)
    `67376c6b7dc845e399affd648f4a6516`, the same as 091's text. It is SECURITY DEFINER with
    `search_path=public, pg_temp`, owned by postgres, ACL `{postgres=X/postgres,sync_runner=X/postgres}`.
  - Against 091's body, the diff is exactly two lines: the gate, now
    `public.bb_file_storage_key(v_relpath)`, and the comment above it. Both are marked `095`.
  - Its comment changes, and its revoke and grant are re-asserted as 091 has them.
- A guard block checks four things:
  - sync_runner's SECURITY DEFINER set is still 093's thirteen
  - sync_file_stored kept SECURITY DEFINER and its search_path, and its gate is the new rule
  - only sync_runner can execute sync_file_stored
  - bb_file_storage_key is immutable, runs with the caller's rights, has its path pinned, and gives
    the right key on three literals
- 095 names no `db_test_runner`, so it replays in name order (after 094, before 100).

**R2-5 (Unicode folding): not done, on purpose.** db-test read prod's `pg_extension` on 2026-10-05:
pg_cron, pg_net, pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp, vector. `unaccent`
is not installed. So, following your rule, there is no fold on either side, and `é` becomes `_` in
both JS and SQL. NFC `Café` gives `Caf_`, and NFD `Café` gives `Cafe_` (the base letter stays and the
combining mark becomes `_`). Both forms are pinned in the contract.

Follow-up: Postgres 17's built-in `normalize(text, NFKD)`, plus one explicit list of combining-mark
ranges used by both sides, could fold without `unaccent`. It has to land on both sides at once.

**R2-3: one rule, one contract.** `db/fixtures/phase14/storage_keys.json` holds 12 cases:

| Case | What it covers |
|---|---|
| file 2489's name | becomes `Musk_s …` |
| `#` | becomes `_` |
| every allowed character | kept as is |
| NFC `é` | becomes `_` |
| NFD `é` | the `e` stays; the mark becomes `_` |
| `“ ”` | each becomes `_` |
| `%`, `[`, `]`, `~` | each becomes `_` |
| en and em dashes | each becomes `_` |
| an emoji | one `_` |
| a submission with `attempt-` | the attempt segment is kept |
| `"`, no-break space, `\` | each becomes `_` |
| a plain name | unchanged |

Non-ASCII characters are written as `\u` escapes so NFC and NFD cannot merge.
- `ingest/pull_files.test.mjs` checks `storageKeyFor` against the file.
- Postgres cannot read the repo, so `db/tests/phase14_095_storage_key.sql` carries the same `cases`
  array **inline**, between `storage_keys` dollar-quote tags. pull_files.test.mjs parses that copy
  and fails if it differs from the JSON in any way.
- The SQL unit tests three things:
  - (1) `bb_file_storage_key` on all 12 cases, plus Storage's own key check and idempotence
  - (2) `sync_file_stored`, run as `sync_runner`. It accepts the fixture row's sanitised key. It
    refuses with 22023, and writes nothing, for three keys: 091's `#`-only key, the raw relpath and
    an arbitrary key. It records `local_path` and `file_name` with their real characters.
  - (3) the attributes and privileges of both functions, and the thirteen
- The unit needs no loader, so it is **not added to the loader map**. It needs one fixture `bb_files`
  row and no crawl. The map is pinned by `scripts/db-test.test.mjs` and, per `db/tests/README.md`, is
  only for units that need a loader.
- The web drop zone's raw-name key (`submissionRelPath`) remains the follow-up. With
  `bb_file_storage_key` in the database, it becomes a one-line change on the staged-key path.

**R2-2: the runner's `fileStored` fake now applies the gate.**
- With 091's rule in the fake (`key === relpath.replace(/#/g, '_')`), two tests went RED: 2489 and
  the collision case. The reason was
  `sync_file_stored refused: sync_file_stored: key is not the relpath's storage key`, which is R2-1
  reproduced.
- With the shared rule (`storageKeyFor({ relpath })`, the same rule as 095), all 33 tests are GREEN.

**R2-4: the refusal reason fits the clip.** Your format names two full basenames, which measures 271
characters for 2489. The report clips at 200 (`sync/src/report.ts` REASON_MAX).
- So the reason puts the verdict first and only the sanitised name last:
  `storage 409: key already occupied; this key was sanitised, so the object there may be another file; a human decides (<sanitised basename>)`.
  For 2489 that is 194 characters.
- A test pins that, and also that a longer name can only lose its own tail, never the verdict.
- The original name is not lost: the report line already names the file by id
  (`Not pulled: file 2489 (…)`).

**R2-6.** `occupiedKeyRefusal` now computes the raw and sanitised key once.

### Round 2 evidence (db-test as `db_test_runner`; every unit rolls back)

```
node scripts/db-test.mjs --ping
  db-test: connected as db_test_runner
node scripts/db-test.mjs --only phase14_095_storage_key.sql          (095 not applied: expected RED)
  FAIL  phase14_095_storage_key.sql  FAIL phase14_095: migration 095 is not applied (bb_file_storage_key is missing)
  db-test: passed 0, failed 1, units 1
dry run (scratch): 095's two functions created in pg_temp + the unit's sections 1-2 pointed at them
  PASS  w73_095_dryrun.sql
  db-test: passed 1, failed 0, units 1
the same dry run with 091's replace(relpath, '#', '_') as the rule (mutation check)
  FAIL  w73_095_mutant.sql  FAIL 1: file 2489's name: a curly apostrophe: got GEO.103/readings/Musk’s AI …
node scripts/db-test.mjs --only phase14_091_files.sql
  PASS  phase14_091_files.sql
  db-test: passed 1, failed 0, units 1
```

The gate `phase14_095_storage_key.sql -> passed 1, failed 0` cannot be met before 095 is applied.
`db_test_runner` cannot create a function in `public`, or replace one that postgres owns, so the unit
cannot load the migration itself. The dry run is the strongest check available before the apply. It
covers:
- on prod's Postgres 17.6, the SQL rule meets all 12 contract cases, so JS and SQL agree
- 095's `sync_file_stored` body accepts the sanitised key and refuses the other three with 22023

It does not cover privileges and attributes, which the dry run cannot see on temp copies; section 3
does.

**For the PM, after applying 095:**
- `node scripts/db-test.mjs --only phase14_095_storage_key.sql` should read `passed 1, failed 0`.
- `phase14_091_files.sql` should still pass. Its fixture name `w55 #fixture.pdf` has only `#` to
  replace, so 091's key and 095's key are the same.

### Round 2 gates (last lines)

```
node --test ingest/pull_files.test.mjs ingest/fetch_signed.test.mjs ingest/extract_text.test.mjs
  ℹ tests 86 · ℹ pass 86 · ℹ fail 0
cd sync && npm run typecheck && npm run build && npx vitest run --coverage
  ⚡ Done · Test Files 7 passed (7) · Tests 136 passed (136) · Lines 91.32% (705/772)
node --test scripts/db-test.test.mjs
  ℹ tests 59 · ℹ pass 59 · ℹ fail 0
```
