/**
 * bb2dash — announcements query layer (R-20, Phase 11).
 *
 * Two readers share it: the top-bar bell (badge + dropdown) and the
 * `/announcements` screen. Conventions follow `queries.ts` — a key in
 * `announcementKeys`, an `xOptions()` returning queryOptions, a `useX()` hook,
 * throw on error, no fabricated fallbacks.
 *
 * "Seen" is `announcements.read_at`, added by migration 033 for exactly this
 * and never written by a sync. `announcements.is_read` is Blackboard's own
 * mark: something Stack already opened over there is not new to him, and
 * `v_announcements_unread` excludes it.
 *
 * `v_announcements_unread` and `mark_announcements_seen()` come from migration 063
 * and are in the generated `database.types.ts`.
 */

import { useEffect, useRef, useState } from 'react';
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { getSupabaseBrowserClient } from './supabase/client';
import type { Tables } from './queries';
import { MONTH_LABELS } from '@/components/tracker/anchor';
import { newYorkWallClock } from './planner-week';

/* ---------------------------------------------------------------------------
 * Row types
 * ------------------------------------------------------------------------ */

/** One row of `v_announcements_unread` (migration 063). */
export interface UnreadAnnouncement {
  id: number;
  course_id: string;
  /** `courses.title_short`, aliased `course` by the view. */
  course: string | null;
  title: string | null;
  author: string | null;
  posted_at: string | null;
  modified_at: string | null;
  read_at: string | null;
}

/** The course identity an announcement row prints. */
export type AnnouncementCourse = Pick<Tables<'courses'>, 'id' | 'title_short'>;

/** One `announcements` row with its course embedded. */
export type AnnouncementRow = Pick<
  Tables<'announcements'>,
  'id' | 'course_id' | 'title' | 'author' | 'body' | 'posted_at' | 'modified_at' | 'read_at' | 'is_read'
> & { courses: AnnouncementCourse | null };

const UNREAD_COLUMNS = 'id, course_id, course, title, author, posted_at, modified_at, read_at';

const ANNOUNCEMENT_COLUMNS =
  'id, course_id, title, author, body, posted_at, modified_at, read_at, is_read, ' +
  'courses(id, title_short)';

/* ---------------------------------------------------------------------------
 * Cache keys
 * ------------------------------------------------------------------------ */

export const announcementKeys = {
  /** Everything announcement-shaped, so marking seen invalidates in one call. */
  all: () => ['announcements'] as const,
  unread: () => ['announcements', 'unread'] as const,
  list: () => ['announcements', 'list'] as const,
} as const;

/* ---------------------------------------------------------------------------
 * Queries
 * ------------------------------------------------------------------------ */

/** What the bell's badge counts: announcements Stack has not seen. */
export function unreadOptions() {
  return queryOptions({
    queryKey: announcementKeys.unread(),
    queryFn: async (): Promise<UnreadAnnouncement[]> => {
      const { data, error } = await getSupabaseBrowserClient()
        .from('v_announcements_unread')
        .select(UNREAD_COLUMNS)
        .order('posted_at', { ascending: false, nullsFirst: false });
      if (error) throw new Error(error.message);
      // The generator types every view column as nullable; `id` and `course_id`
      // are the announcement's primary key and a NOT NULL column, so the narrow
      // interface is the truthful one (same reading as `CourseDisplay` in queries.today.ts).
      return (data ?? []) as UnreadAnnouncement[];
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}

/** Every course's announcements, newest first — the dropdown and the screen. */
export function allAnnouncementsOptions() {
  return queryOptions({
    queryKey: announcementKeys.list(),
    queryFn: async (): Promise<AnnouncementRow[]> => {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('announcements')
        .select(ANNOUNCEMENT_COLUMNS)
        .order('posted_at', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false });
      if (error) throw error;
      // One documented cast: the embedded `courses(...)` resource is narrowed
      // to the two columns selected. No field is reshaped.
      return (data ?? []) as unknown as AnnouncementRow[];
    },
    staleTime: 60 * 1000,
  });
}

/* ---------------------------------------------------------------------------
 * Hooks
 * ------------------------------------------------------------------------ */

export function useUnreadAnnouncements() {
  return useQuery(unreadOptions());
}

export function useAllAnnouncements() {
  return useQuery(allAnnouncementsOptions());
}

/**
 * Stamp `read_at` on everything still unseen (migration 063's
 * `mark_announcements_seen()`, security invoker — the owner_all policy scopes
 * it). Fired when the bell's dropdown opens and when `/announcements` is
 * visited; both then invalidate, so the badge drops to zero and stays there
 * across a reload.
 */
export function useMarkAnnouncementsSeen() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await getSupabaseBrowserClient().rpc('mark_announcements_seen');
      if (error) throw new Error(error.message);
      return data ?? 0;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: announcementKeys.all() });
    },
  });
}

/** The snapshot while nothing is being read. One shared instance, so the
 *  "nothing yet" state never re-renders a consumer by identity alone. */
const NO_UNREAD: ReadonlySet<number> = new Set<number>();

/**
 * The seen-once mechanism both readers need, in one place.
 *
 * Opening the bell, or arriving on `/announcements`, does two things at the
 * same moment: it remembers which rows were unread, and it stamps `read_at` on
 * all of them. Doing only the second would clear the badge and erase the one
 * thing the reader opened it for, so the unread marks on screen come from the
 * snapshot, never from the rows' live `read_at`.
 *
 * `ids` is `undefined` until the caller's own fetch has **succeeded** — that is
 * the gate. A failed fetch passes `undefined` and nothing is marked: posts must
 * never be stamped as read without having been shown.
 *
 * `active` is the bell's open state; a screen that is simply visited passes
 * `true`. Going inactive forgets the snapshot, so the next activation reads the
 * real state again.
 */
export function useUnreadSnapshot(
  active: boolean,
  ids: readonly number[] | undefined,
): ReadonlySet<number> {
  const { mutate: markSeen } = useMarkAnnouncementsSeen();
  const [snapshot, setSnapshot] = useState<ReadonlySet<number>>(NO_UNREAD);
  const handled = useRef(false);

  useEffect(() => {
    if (!active) {
      handled.current = false;
      setSnapshot(NO_UNREAD);
      return;
    }
    if (handled.current || ids === undefined) return;
    handled.current = true;
    setSnapshot(new Set(ids));
    markSeen();
  }, [active, ids, markSeen]);

  return snapshot;
}

/* ---------------------------------------------------------------------------
 * Display helpers (pure — every value traceable to a row)
 * ------------------------------------------------------------------------ */

/** What an announcement with no author says. Stack's answer to Q7: not a guess. */
export const AUTHOR_NOT_RECORDED = 'not recorded';
/** What an announcement with no title says. */
export const TITLE_NOT_RECORDED = 'untitled announcement';
/** What an announcement with no posted date says. */
export const DATE_NOT_RECORDED = 'date not recorded';

/**
 * Is this row still unseen?
 *
 * The same predicate `v_announcements_unread` (063) uses, so the bell's badge,
 * the dropdown and the `/announcements` page never disagree about what is new:
 * `read_at` is bb2dash's own seen mark, and `is_read` is Blackboard's — an
 * announcement Stack already opened over there is not new to him here.
 */
export function isUnreadRow(row: Pick<AnnouncementRow, 'read_at' | 'is_read'>): boolean {
  return row.read_at === null && row.is_read !== true;
}

/** 'IST 323' — the joined `title_short`, or the course id when the join is empty. */
export function announcementCourseLabel(
  row: Pick<AnnouncementRow, 'course_id' | 'courses'>,
): string {
  return row.courses?.title_short?.trim() || row.course_id;
}

/**
 * 'Sep 12', read in `COURSE_TIME_ZONE` so the day never shifts under a reader.
 * The zone constant is `course-dimension.ts`'s, the one the Stream groups by —
 * there is one course timezone in this app, not three copies of a string.
 */
export function formatAnnouncementDate(postedAt: string | null | undefined): string {
  const clock = newYorkWallClock(postedAt);
  if (!clock) return DATE_NOT_RECORDED;
  const [, month, day] = clock.iso.split('-');
  return `${MONTH_LABELS[Number(month) - 1]} ${Number(day)}`;
}

/** The `course · author · date` line both the dropdown and the screen print. */
export function announcementMeta(course: string, author: string | null, postedAt: string | null): string {
  return [course, author?.trim() || AUTHOR_NOT_RECORDED, formatAnnouncementDate(postedAt)].join(' · ');
}

/** One row of the bell's dropdown / the announcements list. */
export interface AnnouncementCard {
  id: number;
  courseId: string;
  course: string;
  title: string;
  meta: string;
  body: string | null;
  unread: boolean;
}

/** A row as both readers render it, with the unread mark the caller decides. */
export function toAnnouncementCard(row: AnnouncementRow, unread: boolean): AnnouncementCard {
  const course = announcementCourseLabel(row);
  return {
    id: row.id,
    courseId: row.course_id,
    course,
    title: row.title?.trim() || TITLE_NOT_RECORDED,
    meta: announcementMeta(course, row.author, row.posted_at),
    body: row.body,
    unread,
  };
}

/**
 * The bell's dropdown: unread first, then the newest already-seen, capped.
 *
 * `unreadIds` is the set the bell snapshotted when it opened, not the rows'
 * current `read_at` — opening the dropdown stamps them all as seen, and a list
 * that reshuffled itself the instant Stack looked at it would lose exactly the
 * information he opened it for.
 */
export function bellRows(
  rows: readonly AnnouncementRow[],
  unreadIds: ReadonlySet<number>,
  limit = 8,
): AnnouncementCard[] {
  const cards = rows.map((row) => toAnnouncementCard(row, unreadIds.has(row.id)));
  const unread = cards.filter((card) => card.unread);
  const seen = cards.filter((card) => !card.unread);
  return [...unread, ...seen].slice(0, Math.max(0, limit));
}
