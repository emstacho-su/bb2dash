# db/fixtures/phase14 — the recorded crawl (Phase 14, task 8, P-35)

`crawl_v4_scrubbed.json` is the nine `bb_raw` rows of one real crawler v4 run, with every value in
`SCRUB_FIELDS` set to null before the file was written. The default source is run
`3b5174b8-1347-448f-96db-50a0b635dc58` (request 39, `sync_runs` 62, 2026-09-23), the parity baseline of
brief 100 task 2: 1 `memberships`, 7 `course` and 1 `calendar` row, in crawl order.

`scrub_crawl.mjs` is the only writer:

```
node db/fixtures/phase14/scrub_crawl.mjs --from-db [--run <uuid>]   # read prod, scrub, write both files
node db/fixtures/phase14/scrub_crawl.mjs                            # rebuild the loader from the JSON
node db/fixtures/phase14/scrub_crawl.mjs --check                    # exit 1 if the loader drifted
```

`--from-db` reads through the SQL test credential in `.env.local` (`scripts/db-test.mjs`'s
`openClient`). The rows are scrubbed in memory; the unscrubbed payloads are never written, and the
write is refused if any scrub field still holds a value or the run's kinds are not 1/7/1.

## What is removed, and why

The repo is public. `SCRUB_FIELDS` (exported by `scrub_crawl.mjs`, recorded in the JSON's `_source`):

| keys | why |
|---|---|
| `studentSubmission`, `studentComments` | text Stack wrote (P-35) |
| `feedback`, `instructorFeedback` | text written to Stack about his work |
| `score`, `manualScore`, `effectiveScore`, `displayScore`, `displayGrade` | his grades |
| `receipt`, `receiptId` | his submission receipts |
| `email` | a contact field |
| `body`, `description` | professors' prose: announcement and content bodies carry their email addresses and phone numbers, and their materials stay out of the repo (`course context/` is gitignored for the same reason) |

What stays is the crawl's shape: ids, titles, names, paths, durable `bbcswebdav` URLs, dates and
statuses. Stack's Blackboard user id `_21025199_1` stays; `skills/bb-sync/SKILL.md` already names it.

## Who reads it

* `db/tests/phase14_load_crawl_v4.sql` is generated from the JSON (never hand-edited). It opens the
  transaction, keeps the rows in the temp table `_fx14_raw` and lands them in `bb_raw` under the
  fixture run id `00000000-1491-4000-8000-000000000001`. `scripts/db-test.mjs` runs it in front of
  `db/tests/phase14_091_sync_runner.sql`, which loads them a second time and expects 0 rows.
* `sync/test/fixture-scrub.test.ts` asserts the 9 rows and their kinds, that no scrub key holds a
  value, and that the committed loader is byte-for-byte what the JSON generates.
* `sync/test/integration.test.ts` replays the rows through a fake page and a fake RPC client.
