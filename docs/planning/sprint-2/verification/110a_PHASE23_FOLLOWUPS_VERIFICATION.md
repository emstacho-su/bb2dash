# 110a: Phase 23 follow-ups, the verification record

The record for brief `docs/planning/sprint-2/briefs/110_PHASE23_followups.md`. The PM writes it; each
worker hands in its own section. Newest section last.

## The freeze

Brief 110 was frozen on 2026-10-08 as commit 5d78ddc on `fix/phase23-followups`, pushed before any
worker worktree was cut. The Seams were read again, each row by its words, against
`feat/workspace-24` at e365153 and `feat/styling-22` at 8b92ac6 (the brief's table under "Seams"
gives the lines). The worktree `bb2dash-wt-23f` was clean at `origin/fix/phase23-followups`
(ba818bc) when the session started. The untagged-session check was not due.

## Reads at the cut

Task 1. Made 2026-10-08, about 23:40Z, read-only: one SELECT on prod through the Supabase MCP
(counts and ids, no text), four greps and file reads in this worktree, and one `--dry-run` of the
exporter. At the read: no `agent_requests` row was queued or claimed, `v_inbox_queue` held 0 rows,
and the last sync (request 2519, 22:58Z) had closed done.

1. **`supersede/` items on prod: 0**, in any state. So the supersede half of Item 2 has nothing to
   act on live, as STATUS said, and step 9's supersede count will be zero ("not exercised"; row
   `9-supersede` is waived for that reason).
2. **Session answers the backfill would stamp: 14**, not two: items 905 to 914, 1915, 3436, 3437 and
   3453. All 15 session answers on prod are `archived`, none carries `applied_at`, and 14 of them
   name a pick that their file carries today. The fifteenth is 3435 ("none"), which gets no stamp.
   188's backfill prints its count; expect 14 unless a fold links or unlinks a file first.
3. **The last five container syncs took 125, 43, 105, 118 and 99 seconds** from claim to close
   (requests 2519, 2516, 2514, 2381, 2208; 68 to 149 s from the press). Step 3's nine-minute watch
   has more than three times the longest of them.
4. **The Inbox card for a `stack_must_confirm` on `agent_request` has no Dismiss and no Confirm
   button** (`web/src/components/inbox/InboxCard.tsx:154-160`, `:267-296`, `:377-406`). It shows an
   Answer box ("your answer"), a "why (optional)" field, and Save, which is enabled only once an
   answer is typed. Dismiss is offered for the kinds `deadline` and `data_gap` alone (`:159`,
   `:391-405`). A saved answer writes `state = 'resolved'` and
   `resolution = {value, value_type}` (`web/src/lib/queries.sync.ts:405-410`); with no "why" the
   worker records it as `recorded_elsewhere` because the entity is `agent_request`
   (`apply/src/batch.ts:162`, `:170`), and with a "why" it goes to Claude. **So the pack's "dismiss"
   steps (1 and 7a) cannot be done on a `stack_must_confirm` card.** This is the PM's ruling R1
   (brief 110, "Round 1"): the labels `dismiss` and `offline` are raised as kind `data_gap`, whose
   card offers Dismiss. Nothing closes such a row by itself: `close_cleared_gaps` acts on a
   `data_gap` only for the entities `reading` and `bb_file` (`db/migrations/161_outside_links.sql:87-96`).
5. **No standing unit pins the source of either transform function.** Of the five `phase18_*`
   units, one reads a function's source at all: `db/tests/phase18_124_stage_files_replay.sql:66-67`
   holds the md5 of `stage_content`'s body. No unit under `db/tests` names
   `supersede_replaced_files` or `link_file_sessions` beside `prosrc` or `pg_get_functiondef`. 188
   re-creates neither `stage_content` nor anything that unit pins.
6. **The exporter's dry run: exit code 0, and it would file 17 rows.** Run as
   `SECRETS_DIR=C:/Users/stack/.bb2dash-secrets HARNESS_DIR=C:/Users/stack/agentic-harness node scripts/inbox-decisions-export.mjs --dry-run`
   from this worktree. The vault resolved to the `projects` realm, the service key was read from its
   file and not printed, and `inbox_decisions_unfiled` answered. It listed 3782, 3426, 3425, 3427,
   3441, 3434, 3433, 3453, 3667, 3666, 3669, 3668, 3563, 3562, 3437, 3436 and 3435, each dated
   2026-10-07, and ended "filed 0, not filed 0". `git status --porcelain` printed nothing afterwards.
   Item 3's build goes ahead.

Also read, for the pack's worker: 6 rows on prod have entity `agent_request`, all
`stack_must_confirm` and archived (the notices), and no row's ref starts `accept/`.
