// bb2dash :: edge function `calendar-push` — store.ts
// The calendar_events writer: the one place every mirror column is set.
//
// WHY THIS IS ITS OWN FILE (round 2, R2-2). saveFailure and markDeleting used to discard
// PostgREST's { error }, so a mirror write that failed looked like one that worked: a row could
// stay 'live' while its event was being deleted, or lose the error that says why an item keeps
// failing. Every method now checks the error and throws, like saveSuccess and remove always did,
// which aborts the run and records it as failed (index.ts). The writer lived in index.ts, which
// ends in Deno.serve and imports from esm.sh, so no test could reach it; here it takes a minimal
// structural client instead of the Supabase SDK, and the node tests drive it with a fake.
//
// No Deno globals, no remote imports: the same source runs under `node --test`.

import type { PushSource } from "./google.ts";
import type { MirrorRow, MirrorStore } from "./push.ts";

/** calendar_events.last_error — one item's failure, not a stack trace. */
export const ITEM_ERROR_LIMIT = 500;

export interface PostgrestResultLike {
  error: { message: string } | null;
}

/** A filter builder: chainable `.eq()`, and awaitable for its result. */
export interface FilterChain extends PromiseLike<PostgrestResultLike> {
  eq(column: string, value: unknown): FilterChain;
}

/** The slice of supabase-js the writer uses, so a test can supply a fake. */
export interface MirrorTableClient {
  from(table: "calendar_events"): {
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string },
    ): PromiseLike<PostgrestResultLike>;
    update(values: Record<string, unknown>): FilterChain;
    delete(): FilterChain;
  };
}

function check(result: PostgrestResultLike, what: string): void {
  if (result.error) throw new Error(`calendar_events ${what}: ${result.error.message}`);
}

/**
 * Every statement is scoped by the mirror's full primary key (source, ref_id), migration 068.
 * `now` is injected so a test can pin the timestamps.
 */
export function createMirrorStore(
  client: MirrorTableClient,
  now: () => string = () => new Date().toISOString(),
): MirrorStore {
  const table = () => client.from("calendar_events");
  return {
    async saveSuccess(row: MirrorRow) {
      const at = now();
      check(
        await table().upsert(
          { ...row, last_error: null, last_pushed_at: at, updated_at: at },
          { onConflict: "source,ref_id" },
        ),
        "upsert",
      );
    },
    async saveFailure(source: PushSource, refId: string, message: string) {
      // update, never upsert: a failed insert means Google holds nothing, and a mirror row
      // claiming otherwise would stop the next run from retrying it.
      check(
        await table()
          .update({ last_error: message.slice(0, ITEM_ERROR_LIMIT), updated_at: now() })
          .eq("source", source).eq("ref_id", refId),
        "update last_error",
      );
    },
    async markDeleting(source: PushSource, refId: string) {
      check(
        await table()
          .update({ state: "deleting", updated_at: now() })
          .eq("source", source).eq("ref_id", refId),
        "update state",
      );
    },
    async remove(source: PushSource, refId: string) {
      check(
        await table().delete().eq("source", source).eq("ref_id", refId),
        "delete",
      );
    },
  };
}
