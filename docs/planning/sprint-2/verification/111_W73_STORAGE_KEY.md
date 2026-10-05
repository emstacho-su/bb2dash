# 111 · W-73 verification — Storage keys keep only the characters Storage accepts

Worker W-73. Branch `fix/storage-key-safe-chars`, worktree `C:/Users/stack/projects/bb2dash-wt-storage-key`,
cut from `origin/main` 3d7683a. Unit tests only: no live pull or sync, no call to Supabase prod or
Storage, no `docker compose up` / `just up`, no SQL or migration change.

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

- **The container only gets the fix when its image is rebuilt:** `just up` from `bb2dash-stack`, and
  never while a sync is open. The Windows `/bb-sync` fallback gets it once the main checkout is on a
  `main` that includes this.
- After that, the next sync should pull file 2489 under
  `GEO.103/…/Musk_s AI Fuels Pollution in Black Memphis Neighborhood - Capital B News.pdf` and close
  item 3441 by itself. 2489 was never uploaded (every attempt drew a 400), so nothing occupies its
  new key, and the occupied-key refusal does not apply to it.
- **Not touched:** the web drop zone's staged-file key (`submissionRelPath` in
  `web/src/lib/queries.submissions.ts`) is still the raw file name. A staged file with `’` or `é` in
  its name would draw the same 400. Changing it would break that helper's contract to match
  `bb_file_relpath` exactly, so it needs its own decision.
