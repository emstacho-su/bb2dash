'use client';

/**
 * /planner — the week grid (R-19, Phase 11).
 *
 * Monday → Sunday columns, 08:00–22:00 in half-hour rows, an Assignments band
 * above them (the all-day band, so named because that is what Stack puts in it). Class meetings come from `meetings` (expanded by wall clock, with the
 * room and, when a `sessions` row covers that course and day, its topic); due
 * items come from the same `v_work_items` window Today reads, so a status
 * changed here and a status changed there are the same fact in the same caches.
 *
 * Read-only by design (Stack, 2026-09-14): no drag, no day view, no work-window
 * lane. The one write is the status quick-edit, which is `StatusSelect` plus
 * `useSetItemStatus` — the Today mutation, unchanged, so it can only ever reach
 * `assignment_progress` / `reading_progress`.
 *
 * `?week=YYYY-MM-DD` is the Monday anchor, so a week is linkable and ◂ ▸ are
 * plain links rather than state. The parameter is untrusted: `weekAnchor`
 * validates it and falls back to the current week rather than throwing.
 *
 * This file is the markup. The queries and the placement are in
 * `usePlannerWeekData`; the arithmetic is in `@/lib/planner-week`, which has no
 * React in it; one block's content is in `PlannerItem`. Nothing here invents a
 * position: a date-only item sits in the band because that is what is recorded,
 * and so does a timed one whose clock falls outside the drawn hours.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import tokens from '@/styles/tokens.module.css';
import { todayIso } from '@/components/tracker/anchor';
import { itemHref } from '@/lib/queries.popout';
import { useSetItemStatus, useTerm, type WorkItem } from '@/lib/queries.today';
import type { ProgressStatus } from '@/lib/queries';
import {
  PLANNER_SLOT_COUNT,
  buildPlannerWeek,
  isWithinGridHours,
  localWallClock,
  plannerHours,
  slotOffset,
  termWeekNumber,
  weekAnchor,
  type LaneSpan,
  type PlannerDay,
  type PlannerWeekModel,
} from '@/lib/planner-week';
import {
  ItemChip,
  ItemContent,
  MeetingChip,
  MeetingContent,
  itemCardProps,
  type ItemActions,
} from './PlannerItem';
import {
  usePlannerWeekData,
  type BandDay,
  type GridBlock,
  type PlannerWeekData,
} from './usePlannerWeekData';
import styles from './PlannerWeek.module.css';

/** What the band says when the whole week holds nothing. */
const EMPTY_WEEK = 'Nothing scheduled this week.';

/* ---------------------------------------------------------------------------
 * The screen
 * ------------------------------------------------------------------------ */

export function PlannerWeek() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // `?week=` is untrusted input; `weekAnchor` validates it and falls back to
  // the current week rather than throwing.
  const today = todayIso();
  const view = useMemo(
    () => buildPlannerWeek({ weekStart: weekAnchor(searchParams.get('week'), today), today }),
    [searchParams, today],
  );

  const data = usePlannerWeekData(view);
  const setStatus = useSetItemStatus();

  const actions = itemActions(pathname, view, setStatus, router);

  const itemCount = data.placedItems.timed.length + data.placedItems.allDay.length;
  const isEmpty =
    !data.loading && data.error === null && data.placedMeetings.length === 0 && itemCount === 0;

  return (
    <section className={styles.section} aria-label="Week grid">
      <WeekHeader
        view={view}
        pathname={pathname}
        loading={data.loading}
        error={data.error}
        meetingCount={data.placedMeetings.length}
        itemCount={itemCount}
      />

      {data.error !== null && (
        <p className={styles.state} role="alert">
          Could not load this week: {data.error.message}
        </p>
      )}

      <WeekBoard view={view} data={data} actions={actions} isEmpty={isEmpty} now={nowSlot(view)} />

      <div className={styles.legend}>
        <span>Times are as recorded · a date-only item sits in the Assignments band</span>
      </div>
    </section>
  );
}

/**
 * The three things a due item on the grid can do.
 *
 * Opening the popout must not silently page the grid back to this week, so a
 * paged week rides along on the href. `itemHref` still builds the `?item=`
 * part; `ItemPopout` drops only that parameter when it closes.
 */
function itemActions(
  pathname: string,
  view: PlannerWeekModel,
  setStatus: ReturnType<typeof useSetItemStatus>,
  router: ReturnType<typeof useRouter>,
): ItemActions {
  const weekSuffix = view.isCurrentWeek ? '' : `&week=${view.weekStart}`;
  const href = (id: string) => `${itemHref(pathname, { kind: 'assignment', id })}${weekSuffix}`;
  return {
    href,
    open: (id) => router.push(href(id), { scroll: false }),
    onStatusChange: (item: WorkItem, status: ProgressStatus) =>
      setStatus.mutate({ item: { item_kind: item.item_kind, item_id: item.item_id }, status }),
    pendingItemId: setStatus.isPending ? (setStatus.variables?.item.item_id ?? null) : null,
  };
}

/**
 * Where the now-line goes, or null when it means nothing here. This is the
 * reader's own clock and their own calendar day, not the term's zone.
 */
function nowSlot(view: PlannerWeekModel): number | null {
  const now = localWallClock(new Date());
  if (view.todayIndex < 0 || !isWithinGridHours(now.minute)) return null;
  return slotOffset(now.minute);
}

/* ---------------------------------------------------------------------------
 * Parts
 * ------------------------------------------------------------------------ */

/** The grid itself: day heads, the all-day band, the gutter, seven columns. */
function WeekBoard({
  view,
  data,
  actions,
  isEmpty,
  now,
}: {
  view: PlannerWeekModel;
  data: PlannerWeekData;
  actions: ItemActions;
  isEmpty: boolean;
  /** Slot offset of the now-line, or null when it does not belong on screen. */
  now: number | null;
}) {
  return (
    <div
      className={styles.board}
      style={{ ['--planner-slots' as string]: String(PLANNER_SLOT_COUNT) }}
    >
      <div className={styles.corner} />
      {view.days.map((day) => (
        <DayHead key={`head-${day.iso}`} day={day} />
      ))}

      <AllDayBand view={view} band={data.bandByDay} isEmpty={isEmpty} actions={actions} />

      <HourGutter />
      {view.days.map((day, index) => (
        <DayColumn
          key={`col-${day.iso}`}
          day={day}
          blocks={data.blocksByDay[index]}
          actions={actions}
          nowSlot={day.isToday ? now : null}
        />
      ))}
    </div>
  );
}

function WeekHeader({
  view,
  pathname,
  loading,
  error,
  meetingCount,
  itemCount,
}: {
  view: PlannerWeekModel;
  pathname: string;
  loading: boolean;
  error: Error | null;
  meetingCount: number;
  itemCount: number;
}) {
  const term = useTerm();
  const termWeek = termWeekNumber(term.data ?? null, view.weekStart);

  return (
    <div className={styles.head}>
      <h2 className={styles.h2}>{view.rangeLabel}</h2>
      {termWeek !== null && (
        <span className={tokens.kicker}>
          {term.data ? `Week ${termWeek} · ${term.data.name}` : `Week ${termWeek}`}
        </span>
      )}
      <span className={styles.sub}>
        {loading
          ? 'loading…'
          : error !== null
            ? 'could not load'
            : `${meetingCount} class${meetingCount === 1 ? '' : 'es'} · ${itemCount} due`}
      </span>

      <WeekPager view={view} pathname={pathname} />
    </div>
  );
}

/** ◂ ▸ write `?week=`; Today drops it. Plain links, so a week is linkable. */
function WeekPager({ view, pathname }: { view: PlannerWeekModel; pathname: string }) {
  return (
    <span className={styles.pager}>
      <Link
        className={styles.pageLink}
        href={`?week=${view.previousWeek}`}
        title="Previous week"
        aria-label="Previous week"
        scroll={false}
      >
        ◂
      </Link>
      <Link
        className={styles.pageLink}
        href={`?week=${view.nextWeek}`}
        title="Next week"
        aria-label="Next week"
        scroll={false}
      >
        ▸
      </Link>
      <Link className={styles.todayLink} href={pathname} scroll={false}>
        Today
      </Link>
    </span>
  );
}

function DayHead({ day }: { day: PlannerDay }) {
  return (
    <div className={styles.dayHead} data-today={String(day.isToday)}>
      <span className={styles.dayName}>{day.isToday ? 'Today' : day.dowLabel}</span>
      <span className={styles.dayDate}>{day.dayOfMonth}</span>
    </div>
  );
}

function AllDayBand({
  view,
  band,
  isEmpty,
  actions,
}: {
  view: PlannerWeekModel;
  band: BandDay[];
  isEmpty: boolean;
  actions: ItemActions;
}) {
  return (
    <>
      <div className={styles.bandLabel}>Assignments</div>
      {isEmpty ? (
        <div className={styles.bandEmpty}>{EMPTY_WEEK}</div>
      ) : (
        view.days.map((day, index) => (
          <div
            key={`band-${day.iso}`}
            className={styles.bandCell}
            data-today={String(day.isToday)}
            aria-label={`Assignments · ${day.dowLabel}`}
          >
            {band[index].meetings.map((meeting) => (
              <MeetingChip key={meeting.key} meeting={meeting} />
            ))}
            {band[index].items.map((placed) => (
              <ItemChip key={placed.key} placed={placed} actions={actions} />
            ))}
          </div>
        ))
      )}
    </>
  );
}

function HourGutter() {
  return (
    <div className={styles.gutter}>
      {plannerHours().map((hour) => (
        <span
          key={hour.minute}
          className={styles.hourLabel}
          style={{ ['--slot' as string]: String(hour.slot) }}
        >
          {hour.label}
        </span>
      ))}
    </div>
  );
}

function DayColumn({
  day,
  blocks,
  actions,
  nowSlot,
}: {
  day: PlannerDay;
  blocks: (GridBlock & LaneSpan)[];
  actions: ItemActions;
  nowSlot: number | null;
}) {
  return (
    <div className={styles.dayColumn} data-today={String(day.isToday)} data-day={day.iso}>
      {nowSlot !== null && (
        <span
          className={styles.nowLine}
          data-testid="now-line"
          style={{ ['--slot' as string]: String(nowSlot) }}
        />
      )}
      {blocks.map((block) => (
        <div
          key={block.key}
          className={block.kind === 'meeting' ? styles.meetingBlock : styles.itemBlock}
          data-block={block.kind}
          data-category={block.kind === 'item' ? block.item.item.category : undefined}
          {...(block.kind === 'item' ? itemCardProps(block.item, actions) : {})}
          style={{
            ['--top' as string]: String(block.top),
            ['--height' as string]: String(block.height),
            ['--lane-left' as string]: `${(block.lane / block.lanes) * 100}%`,
            ['--lane-width' as string]: `${100 / block.lanes}%`,
          }}
        >
          {block.kind === 'meeting' ? (
            <MeetingContent meeting={block.meeting} nested={block.nested} actions={actions} />
          ) : (
            <ItemContent placed={block.item} actions={actions} />
          )}
        </div>
      ))}
    </div>
  );
}
