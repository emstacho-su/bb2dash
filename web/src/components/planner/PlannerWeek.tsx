'use client';

/**
 * /planner — the week grid (R-19, Phase 11).
 *
 * Monday → Sunday columns, 08:00–22:00 in half-hour rows, an all-day band above
 * them. Class meetings come from `meetings` (expanded by wall clock, with the
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
 * All the arithmetic lives in `@/lib/planner-week`, which has no React in it.
 * Nothing here invents a position: a date-only item sits in the band because
 * that is what is recorded, and so does a timed one whose clock falls outside
 * the drawn hours.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import tokens from '@/styles/tokens.module.css';
import { isQueryLoading } from '@/components/shared/QueryState';
import { StatusSelect } from '@/components/tracker/StatusSelect';
import { todayIso } from '@/components/tracker/anchor';
import { itemHref } from '@/lib/queries.popout';
import {
  courseCodeFromId,
  useSetItemStatus,
  useTerm,
  useWorkItemsWindow,
  type WorkCategory,
  type WorkItem,
} from '@/lib/queries.today';
import type { ProgressStatus } from '@/lib/queries';
import {
  PLANNER_SLOT_COUNT,
  assignLanes,
  buildPlannerWeek,
  expandMeetings,
  isWithinGridHours,
  localWallClock,
  placeWorkItems,
  plannerHours,
  slotBox,
  slotOffset,
  termWeekNumber,
  weekAnchor,
  type PlacedItem,
  type PlacedMeeting,
} from '@/lib/planner-week';
import { toMeetingPatterns, useMeetings, useSessionsForWeek } from '@/lib/queries.planner';
import styles from './PlannerWeek.module.css';

/* ---------------------------------------------------------------------------
 * Presentation constants — the same glyph ramp Today uses.
 * ------------------------------------------------------------------------ */

const GLYPH_CLASS: Record<WorkCategory, string> = {
  reading: tokens.glyphReading,
  assignment: tokens.glyphAssignment,
  quiz: tokens.glyphQuiz,
  project: tokens.glyphProject,
  exam: tokens.glyphExam,
};

/** The band's own label, and what it says when the whole week is empty. */
const EMPTY_WEEK = 'Nothing scheduled this week.';

/** One positioned block inside a day column: a meeting or a timed due item. */
interface GridBlock {
  key: string;
  top: number;
  height: number;
  meeting: PlacedMeeting | null;
  item: PlacedItem<WorkItem> | null;
}

/* ---------------------------------------------------------------------------
 * The screen
 * ------------------------------------------------------------------------ */

export function PlannerWeek() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  const today = todayIso();
  const view = useMemo(
    () => buildPlannerWeek({ weekStart: weekAnchor(searchParams.get('week'), today), today }),
    [searchParams, today],
  );

  const meetingsQuery = useMeetings();
  const sessionsQuery = useSessionsForWeek(view.weekStart, view.weekEnd);
  const itemsQuery = useWorkItemsWindow(view.weekStart, view.weekEnd);
  const termQuery = useTerm();
  const setStatus = useSetItemStatus();

  const placedMeetings = useMemo(
    () =>
      expandMeetings(
        toMeetingPatterns(meetingsQuery.data ?? []),
        view,
        sessionsQuery.data ?? [],
      ),
    [meetingsQuery.data, sessionsQuery.data, view],
  );

  const placedItems = useMemo(
    () => placeWorkItems(itemsQuery.data ?? [], view),
    [itemsQuery.data, view],
  );

  /** Meetings and timed items share each column, so they share its lanes. */
  const blocksByDay = useMemo(() => {
    const byDay: GridBlock[][] = view.days.map(() => []);
    for (const meeting of placedMeetings) {
      if (meeting.startMinute === null) continue;
      const box = slotBox(meeting.startMinute, meeting.endMinute);
      byDay[meeting.dayIndex].push({ key: meeting.key, ...box, meeting, item: null });
    }
    for (const placed of placedItems.timed) {
      if (placed.minute === null) continue;
      const box = slotBox(placed.minute, null);
      byDay[placed.dayIndex].push({ key: placed.key, ...box, meeting: null, item: placed });
    }
    return byDay.map((blocks) => assignLanes(blocks));
  }, [placedMeetings, placedItems, view.days]);

  /** Date-only items, out-of-hours deadlines and meetings with no time. */
  const bandByDay = useMemo(() => {
    const byDay: { meetings: PlacedMeeting[]; items: PlacedItem<WorkItem>[] }[] = view.days.map(
      () => ({ meetings: [], items: [] }),
    );
    for (const meeting of placedMeetings) {
      if (meeting.startMinute === null) byDay[meeting.dayIndex].meetings.push(meeting);
    }
    for (const placed of placedItems.allDay) byDay[placed.dayIndex].items.push(placed);
    return byDay;
  }, [placedMeetings, placedItems, view.days]);

  const loading =
    isQueryLoading(meetingsQuery) || isQueryLoading(sessionsQuery) || isQueryLoading(itemsQuery);
  const error = meetingsQuery.error ?? sessionsQuery.error ?? itemsQuery.error ?? null;

  const meetingCount = placedMeetings.length;
  const itemCount = placedItems.timed.length + placedItems.allDay.length;
  const isEmpty = !loading && error === null && meetingCount === 0 && itemCount === 0;

  const termWeek = termWeekNumber(termQuery.data ?? null, view.weekStart);

  /** The reader's own clock — the now-line only means anything on their today. */
  const now = localWallClock(new Date());
  const showNowLine = view.todayIndex >= 0 && isWithinGridHours(now.minute);

  /**
   * Opening the popout must not silently page the grid back to this week, so a
   * paged week rides along on the href. `itemHref` still builds the `?item=`
   * part; `ItemPopout` drops only that parameter when it closes.
   */
  const weekSuffix = view.isCurrentWeek ? '' : `&week=${view.weekStart}`;
  const hrefForItem = (id: string) =>
    `${itemHref(pathname, { kind: 'assignment', id })}${weekSuffix}`;

  const onStatusChange = (item: WorkItem, status: ProgressStatus) => {
    setStatus.mutate({ item: { item_kind: item.item_kind, item_id: item.item_id }, status });
  };
  const pendingItemId = setStatus.isPending ? (setStatus.variables?.item.item_id ?? null) : null;

  const hours = plannerHours();

  return (
    <section className={styles.section} aria-label="Week grid">
      <div className={styles.head}>
        <h2 className={styles.h2}>{view.rangeLabel}</h2>
        {termWeek !== null && (
          <span className={tokens.kicker}>
            {termQuery.data ? `Week ${termWeek} · ${termQuery.data.name}` : `Week ${termWeek}`}
          </span>
        )}
        <span className={styles.sub}>
          {loading
            ? 'loading…'
            : error !== null
              ? 'could not load'
              : `${meetingCount} class${meetingCount === 1 ? '' : 'es'} · ${itemCount} due`}
        </span>

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
      </div>

      {error !== null && (
        <p className={styles.state} role="alert">
          Could not load this week: {error.message}
        </p>
      )}

      <div
        className={styles.board}
        style={{ ['--planner-slots' as string]: String(PLANNER_SLOT_COUNT) }}
      >
        <div className={styles.corner} />
        {view.days.map((day) => (
          <div key={`head-${day.iso}`} className={styles.dayHead} data-today={String(day.isToday)}>
            <span className={styles.dayName}>{day.isToday ? 'Today' : day.dowLabel}</span>
            <span className={styles.dayDate}>{day.dayOfMonth}</span>
          </div>
        ))}

        <div className={styles.bandLabel}>All day</div>
        {isEmpty ? (
          <div className={styles.bandEmpty}>{EMPTY_WEEK}</div>
        ) : (
          view.days.map((day, index) => (
            <div
              key={`band-${day.iso}`}
              className={styles.bandCell}
              data-today={String(day.isToday)}
            >
              {bandByDay[index].meetings.map((meeting) => (
                <span key={meeting.key} className={styles.chipMeeting}>
                  <span className={styles.blockCode}>{meeting.courseCode}</span>
                  <span className={styles.blockTitle}>{meeting.timeText}</span>
                </span>
              ))}
              {bandByDay[index].items.map((placed) => (
                <ItemChip
                  key={placed.key}
                  placed={placed}
                  href={hrefForItem(placed.item.item_id)}
                  onStatusChange={onStatusChange}
                  pendingItemId={pendingItemId}
                />
              ))}
            </div>
          ))
        )}

        <div className={styles.gutter}>
          {hours.map((hour) => (
            <span
              key={hour.minute}
              className={styles.hourLabel}
              style={{ ['--slot' as string]: String(hour.slot) }}
            >
              {hour.label}
            </span>
          ))}
        </div>

        {view.days.map((day, index) => (
          <div
            key={`col-${day.iso}`}
            className={styles.dayColumn}
            data-today={String(day.isToday)}
            data-day={day.iso}
          >
            {day.isToday && showNowLine && (
              <span
                className={styles.nowLine}
                data-testid="now-line"
                style={{ ['--slot' as string]: String(slotOffset(now.minute)) }}
              />
            )}
            {blocksByDay[index].map((block) => (
              <div
                key={block.key}
                className={block.meeting ? styles.meetingBlock : styles.itemBlock}
                data-category={block.item ? block.item.item.category : undefined}
                style={{
                  ['--top' as string]: String(block.top),
                  ['--height' as string]: String(block.height),
                  ['--lane-left' as string]: `${(block.lane / block.lanes) * 100}%`,
                  ['--lane-width' as string]: `${100 / block.lanes}%`,
                }}
              >
                {block.meeting ? (
                  <MeetingBody meeting={block.meeting} />
                ) : block.item ? (
                  <ItemBody
                    placed={block.item}
                    href={hrefForItem(block.item.item.item_id)}
                    onStatusChange={onStatusChange}
                    pendingItemId={pendingItemId}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className={styles.legend}>
        <span>Times are as recorded · a date-only item sits in the all-day band</span>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Blocks
 * ------------------------------------------------------------------------ */

function MeetingBody({ meeting }: { meeting: PlacedMeeting }) {
  return (
    <>
      <span className={styles.blockHead}>
        <span className={styles.blockCode}>{meeting.courseCode}</span>
        <span className={styles.blockTime}>{meeting.timeText}</span>
      </span>
      <span className={styles.blockRoom}>{meeting.room}</span>
      {meeting.topic !== null && <span className={styles.blockTopic}>{meeting.topic}</span>}
    </>
  );
}

function ItemTitle({ item, href }: { item: WorkItem; href: string }) {
  // Only assignments have a popout; a reading row is text, as it is on Today.
  if (item.item_kind !== 'assignment') return <span className={styles.blockTitle}>{item.title}</span>;
  return (
    <Link className={`${styles.blockTitle} ${styles.blockLink}`} href={href} scroll={false}>
      {item.title}
    </Link>
  );
}

function ItemBody({
  placed,
  href,
  onStatusChange,
  pendingItemId,
}: {
  placed: PlacedItem<WorkItem>;
  href: string;
  onStatusChange: (item: WorkItem, status: ProgressStatus) => void;
  pendingItemId: string | null;
}) {
  const item = placed.item;
  return (
    <>
      <span className={styles.blockHead}>
        <span className={GLYPH_CLASS[item.category]} aria-hidden="true">
          {item.glyph}
        </span>
        <span className={styles.blockCode}>{courseCodeFromId(item.course_id)}</span>
        {placed.timeText !== '' && <span className={styles.blockTime}>{placed.timeText}</span>}
      </span>
      <ItemTitle item={item} href={href} />
      <span className={styles.blockStatus}>
        <StatusSelect
          item={item}
          onChange={onStatusChange}
          pending={pendingItemId === item.item_id}
        />
      </span>
    </>
  );
}

function ItemChip({
  placed,
  href,
  onStatusChange,
  pendingItemId,
}: {
  placed: PlacedItem<WorkItem>;
  href: string;
  onStatusChange: (item: WorkItem, status: ProgressStatus) => void;
  pendingItemId: string | null;
}) {
  const item = placed.item;
  return (
    <span className={styles.chip} data-category={item.category}>
      <span className={GLYPH_CLASS[item.category]} aria-hidden="true">
        {item.glyph}
      </span>
      <span className={styles.chipBody}>
        <span className={styles.blockHead}>
          <span className={styles.blockCode}>{courseCodeFromId(item.course_id)}</span>
          {placed.timeText !== '' && <span className={styles.blockTime}>{placed.timeText}</span>}
        </span>
        <ItemTitle item={item} href={href} />
      </span>
      <StatusSelect
        item={item}
        onChange={onStatusChange}
        pending={pendingItemId === item.item_id}
      />
    </span>
  );
}
