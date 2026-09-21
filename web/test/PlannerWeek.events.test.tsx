/**
 * Planner events on the /planner week grid (Phase 11b, K-9), rendered for real
 * against a recording Supabase stub.
 *
 * Nothing reaches the network, so nothing reaches Stack's Google calendar. The
 * clock is pinned to Wednesday 2026-09-16 10:00 local, inside the week of
 * Monday 2026-09-14. Every write the stub sees is recorded by table, which is
 * how "planner_events only, never assignment_progress" is asserted.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeWorkItem } from './factories';
import { makePlannerEvent } from './factories.plannerEvents';
import { allDayInstants } from '@/lib/planner-events';

/* ---------------------------------------------------------------------------
 * Mocks
 * ------------------------------------------------------------------------ */

interface Write {
  table: string;
  op: 'insert' | 'update' | 'delete' | 'upsert';
  payload: unknown;
  id?: unknown;
}

const db = vi.hoisted(() => ({
  rows: {} as Record<string, unknown[]>,
  writes: [] as Write[],
  /** When set, every write is refused with this message. */
  failWith: null as string | null,
  /** When set, writes wait on it before answering. */
  gate: null as Promise<void> | null,
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: (table: string) => chainFor(table) }),
}));

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  usePathname: () => '/planner',
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...(rest as Record<string, string>)}>
      {children}
    </a>
  ),
}));

const { PlannerWeek } = await import('@/components/planner/PlannerWeek');

/**
 * A chainable builder. Reads resolve to the fixture rows; a write is recorded
 * and resolves to the row it would have produced.
 */
function chainFor(table: string) {
  let pending: Write | null = null;
  const settle = () => {
    if (!pending) {
      const rows = db.rows[table] ?? [];
      return { data: table === 'terms' ? (rows[0] ?? null) : rows, error: null };
    }
    db.writes.push(pending);
    if (db.failWith !== null) return { data: null, error: { message: db.failWith } };
    if (pending.op === 'delete') return { data: [{ id: pending.id }], error: null };
    const base = pending.op === 'update'
      ? (db.rows[table] ?? []).find((row) => (row as { id: string }).id === pending!.id)
      : { id: 'new-event-id', created_at: '2026-09-16T14:00:00Z', updated_at: '2026-09-16T14:00:00Z' };
    return { data: { ...(base as object), ...(pending.payload as object) }, error: null };
  };
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: (column: string, value: unknown) => {
      if (pending && column === 'id') pending = { ...pending, id: value };
      return chain;
    },
    gte: self,
    lt: self,
    lte: self,
    order: self,
    limit: self,
    insert: (payload: unknown) => ((pending = { table, op: 'insert', payload }), chain),
    update: (payload: unknown) => ((pending = { table, op: 'update', payload }), chain),
    delete: () => ((pending = { table, op: 'delete', payload: null }), chain),
    upsert: async (payload: unknown) => {
      db.writes.push({ table, op: 'upsert', payload });
      return { error: null };
    },
    single: async () => {
      if (pending && db.gate) await db.gate;
      return settle();
    },
    maybeSingle: async () => settle(),
    then: (onFulfilled: (value: unknown) => unknown) =>
      (pending && db.gate ? db.gate : Promise.resolve()).then(() => onFulfilled(settle())),
  });
  return chain;
}

/* ---------------------------------------------------------------------------
 * Fixtures
 * ------------------------------------------------------------------------ */

const MEETINGS = [
  {
    id: 1,
    course_id: 'IST.323',
    day_of_week: 3,
    start_time: '15:45:00',
    end_time: '17:05:00',
    location: 'Hinds Hall 010',
    starts_on: '2026-08-24',
    ends_on: '2026-12-11',
    courses: { id: 'IST.323', title_short: 'Cybersecurity', subject: 'IST', number: '323' },
  },
];

const TERM = [{ id: 'fall-2026', name: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-11' }];

const COURSES = [
  { id: 'IST.323', subject: 'IST', number: '323', section: 'M001', title_short: 'Cybersecurity' },
];

/** One event of each kind, spread over the week, all New York. */
const SIX_KINDS = [
  makePlannerEvent({ id: 'e-event', kind: 'event', title: 'Advising', starts_at: '2026-09-14T13:00:00Z', ends_at: '2026-09-14T14:00:00Z' }),
  makePlannerEvent({ id: 'e-task', kind: 'task', title: 'Email TA', done: false, starts_at: '2026-09-15T14:00:00Z', ends_at: '2026-09-15T14:30:00Z' }),
  makePlannerEvent({ id: 'e-ooo', kind: 'out_of_office', title: 'Dentist', starts_at: '2026-09-16T13:00:00Z', ends_at: '2026-09-16T15:00:00Z' }),
  makePlannerEvent({ id: 'e-focus', kind: 'focus_time', title: 'Deep work', starts_at: '2026-09-17T13:00:00Z', ends_at: '2026-09-17T15:00:00Z' }),
  makePlannerEvent({ id: 'e-work', kind: 'working_location', title: 'Bird Library', starts_at: '2026-09-18T13:00:00Z', ends_at: '2026-09-18T21:00:00Z' }),
  makePlannerEvent({ id: 'e-appt', kind: 'appointment_slot', title: 'Office hours', starts_at: '2026-09-19T15:00:00Z', ends_at: '2026-09-19T16:00:00Z' }),
];

function seed(events: unknown[] = []) {
  db.rows = {
    meetings: MEETINGS,
    sessions: [],
    v_work_items: [
      makeWorkItem({ item_id: 'IST.323/lab-1', title: 'Lab #1', course_id: 'IST.323', due_on: '2026-09-17', due_at: '2026-09-17T18:00:00Z' }),
    ],
    terms: TERM,
    courses: COURSES,
    planner_events: events,
  };
  db.writes = [];
  db.failWith = null;
  db.gate = null;
}

function renderPlanner() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PlannerWeek />
    </QueryClientProvider>,
  );
}

function dayColumn(iso: string): HTMLElement {
  const column = document.querySelector(`[data-day="${iso}"]`);
  if (!(column instanceof HTMLElement)) throw new Error(`no column for ${iso}`);
  return column;
}

function eventsCell(iso: string): HTMLElement {
  const cell = document.querySelector(`[data-events-day="${iso}"]`);
  if (!(cell instanceof HTMLElement)) throw new Error(`no Events cell for ${iso}`);
  return cell;
}

/*
 * DOM helpers. The grid renders ~230 buttons (196 slots), and Testing Library's
 * role queries compute the accessibility tree of all of them on every call —
 * seconds per test under a full parallel run. These look elements up by the
 * attributes the markup already carries instead; the dialog's own fields are
 * still found by label, inside the dialog.
 */

/** Every planner-event title button (grid block or band chip) reading `title`. */
function titleButtons(title: string, root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-edit-event]')).filter(
    (button) => button.textContent === title,
  );
}

/** Wait for the first title button reading `title`. */
async function findTitle(title: string, root: ParentNode = document): Promise<HTMLElement> {
  return waitFor(() => {
    const [button] = titleButtons(title, root);
    if (!button) throw new Error(`no planner event titled ${title}`);
    return button;
  });
}

/** The positioned block (or band chip) that holds a title. */
function blockOf(title: string, root: ParentNode = document): HTMLElement {
  const block = titleButtons(title, root)[0]?.closest('[data-block]');
  if (!(block instanceof HTMLElement)) throw new Error(`no block for ${title}`);
  return block;
}

/** Wait for any element with this exact aria-label. */
async function findLabelled(label: string): Promise<HTMLElement> {
  return waitFor(() => {
    const element = document.querySelector(`[aria-label="${label}"]`);
    if (!(element instanceof HTMLElement)) throw new Error(`nothing labelled ${label}`);
    return element;
  });
}

function labelled(label: string): HTMLElement {
  const element = document.querySelector(`[aria-label="${label}"]`);
  if (!(element instanceof HTMLElement)) throw new Error(`nothing labelled ${label}`);
  return element;
}

/** The open dialog, or null. */
function openDialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[role="dialog"]');
}

function dialogNamed(name: string): HTMLElement {
  const dialog = openDialog();
  if (!dialog) throw new Error('no dialog is open');
  expect(dialog).toHaveAttribute('aria-label', name);
  return dialog;
}

/** A button inside `root` by its visible text. */
function buttonIn(root: HTMLElement, text: string): HTMLElement {
  const button = Array.from(root.querySelectorAll<HTMLElement>('button')).find(
    (candidate) => candidate.textContent === text,
  );
  if (!button) throw new Error(`no ${text} button`);
  return button;
}

const writesTo = (table: string) => db.writes.filter((write) => write.table === table);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 16, 10, 0, 0));
  nav.params = new URLSearchParams();
  nav.push.mockReset();
  seed();
});

afterEach(() => {
  vi.useRealTimers();
});

/* ---------------------------------------------------------------------------
 * Blocks
 * ------------------------------------------------------------------------ */

describe('planner events on the grid', () => {
  it('puts each of the six kinds in its column with its own style variant', async () => {
    seed(SIX_KINDS);
    renderPlanner();
    await findTitle('Office hours');

    const expected: [string, string, string][] = [
      ['Advising', 'event', '2026-09-14'],
      ['Email TA', 'task', '2026-09-15'],
      ['Dentist', 'out_of_office', '2026-09-16'],
      ['Deep work', 'focus_time', '2026-09-17'],
      ['Bird Library', 'working_location', '2026-09-18'],
      ['Office hours', 'appointment_slot', '2026-09-19'],
    ];
    for (const [title, kind, iso] of expected) {
      const block = blockOf(title);
      expect(block).toHaveAttribute('data-kind', kind);
      expect(dayColumn(iso)).toContainElement(block);
    }
    expect(within(blockOf('Dentist')).getByText('Out of office')).toBeInTheDocument();
    expect(screen.getByText('1 class · 1 due · 6 events')).toBeInTheDocument();
  });

  it('places a 09:00 America/Los_Angeles event at noon New York with a "09:00 PDT" chip', async () => {
    seed([
      makePlannerEvent({ title: 'Call with Sam', time_zone: 'America/Los_Angeles', starts_at: '2026-09-16T16:00:00Z', ends_at: '2026-09-16T17:00:00Z' }),
    ]);
    renderPlanner();

    await findTitle('Call with Sam');
    const block = blockOf('Call with Sam');
    expect(dayColumn('2026-09-16')).toContainElement(block);
    // Slot 8 — (12:00 − 08:00) / 30 min — through the row table, which is flat
    // at the base height on a week with nothing overlapping (P-planner-2).
    expect(block.style.getPropertyValue('--top-px')).toBe('192px');
    expect(block.style.getPropertyValue('--height-px')).toBe('48px');
    expect(within(block).getByText('12:00 – 1:00 PM')).toBeInTheDocument();
    expect(within(block).getByText('09:00 PDT')).toBeInTheDocument();
  });

  it('keeps the zone chip and the link on one line under the title, so neither covers it', async () => {
    seed([
      makePlannerEvent({ title: 'Call with Sam', time_zone: 'America/Los_Angeles', starts_at: '2026-09-16T16:00:00Z', ends_at: '2026-09-16T17:00:00Z', location_kind: 'online', location: 'https://syr.zoom.us/j/1' }),
    ]);
    renderPlanner();

    await findTitle('Call with Sam');
    const block = blockOf('Call with Sam');
    const meta = within(block).getByText('09:00 PDT').parentElement!;
    expect(meta).toHaveAttribute('data-event-meta', 'true');
    expect(within(meta).getByText('Join · syr.zoom.us')).toBeInTheDocument();
    expect(block).not.toHaveAttribute('data-compact');
  });

  it('draws a half-hour event as one compact line that still names its kind and time', async () => {
    seed([
      makePlannerEvent({ title: 'Office hours', kind: 'appointment_slot', course_id: 'IST.323', starts_at: '2026-09-16T18:00:00Z', ends_at: '2026-09-16T18:30:00Z' }),
    ]);
    renderPlanner();

    await findTitle('Office hours');
    const block = blockOf('Office hours');
    expect(block).toHaveAttribute('data-compact', 'true');
    expect(within(block).getByText('IST 323')).toBeInTheDocument();
    // Visually hidden in the compact line, still read out.
    expect(within(block).getByText('Appointment slot')).toBeInTheDocument();
    expect(within(block).getByText('2:00 – 2:30 PM')).toBeInTheDocument();
  });

  it('shows no zone chip for a New York event', async () => {
    seed([makePlannerEvent({ title: 'Advising' })]);
    renderPlanner();
    await findTitle('Advising');
    expect(within(blockOf('Advising')).queryByText(/^\d\d:\d\d [A-Z]{2,4}$/)).toBeNull();
  });

  it('prints the course code without recolouring the block', async () => {
    seed([makePlannerEvent({ title: 'Study group', course_id: 'IST.323', kind: 'focus_time' })]);
    renderPlanner();
    await findTitle('Study group');
    const block = blockOf('Study group');
    expect(within(block).getByText('IST 323')).toBeInTheDocument();
    expect(block).toHaveAttribute('data-kind', 'focus_time');
  });

  it('splits an event across New York midnight and clamps both segments, keeping real times', async () => {
    seed([
      makePlannerEvent({ id: 'late', title: 'Night shift', starts_at: '2026-09-17T03:00:00Z', ends_at: '2026-09-17T05:00:00Z' }),
    ]);
    renderPlanner();
    await findTitle('Night shift');

    const wednesday = blockOf('Night shift', dayColumn('2026-09-16'));
    const thursday = blockOf('Night shift', dayColumn('2026-09-17'));
    for (const segment of [wednesday, thursday]) {
      expect(segment).toHaveAttribute('data-clamped', 'true');
      expect(within(segment).getByText('11:00 PM – 1:00 AM')).toBeInTheDocument();
    }
    // Slots 27 and 0, in pixels off the flat row table: the clamp lives in slot
    // space and the map carries it into pixels unchanged (P-planner-2).
    expect(wednesday.style.getPropertyValue('--top-px')).toBe('648px');
    expect(thursday.style.getPropertyValue('--top-px')).toBe('0px');
  });

  it('puts an all-day event in the Events band on each of its days, not on the grid', async () => {
    seed([
      makePlannerEvent({ title: 'Conference', kind: 'out_of_office', all_day: true, ...allDayInstants('2026-09-17', '2026-09-18', 'America/New_York')! }),
    ]);
    renderPlanner();
    await findTitle('Conference');

    expect(titleButtons('Conference', eventsCell('2026-09-17'))).toHaveLength(1);
    expect(titleButtons('Conference', eventsCell('2026-09-18'))).toHaveLength(1);
    expect(titleButtons('Conference', eventsCell('2026-09-16'))).toHaveLength(0);
    expect(titleButtons('Conference', dayColumn('2026-09-17'))).toHaveLength(0);
    expect(screen.getByText('Events')).toBeInTheDocument();
  });

  it('places a Tokyo all-day event on its Tokyo date', async () => {
    seed([
      makePlannerEvent({ title: 'Tokyo holiday', all_day: true, time_zone: 'Asia/Tokyo', ...allDayInstants('2026-09-17', '2026-09-17', 'Asia/Tokyo')! }),
    ]);
    renderPlanner();
    await findTitle('Tokyo holiday', eventsCell('2026-09-17'));
    expect(titleButtons('Tokyo holiday', eventsCell('2026-09-16'))).toHaveLength(0);
    expect(within(blockOf('Tokyo holiday')).getByText('GMT+9')).toBeInTheDocument();
  });

  it('renders an online location as a safe new-tab link, http(s) only', async () => {
    seed([
      makePlannerEvent({ id: 'zoom', title: 'Zoom call', location_kind: 'online', location: 'https://syr.zoom.us/j/123' }),
      makePlannerEvent({ id: 'bad', title: 'Odd link', starts_at: '2026-09-15T13:00:00Z', ends_at: '2026-09-15T14:00:00Z', location_kind: 'online', location: 'javascript:alert(1)' }),
    ]);
    renderPlanner();

    const link = await screen.findByText('Join · syr.zoom.us');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'https://syr.zoom.us/j/123');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    await findTitle('Odd link');
    expect(blockOf('Odd link').querySelector('a')).toBeNull();

    fireEvent.click(link);
    expect(openDialog()).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * The task checkbox
 * ------------------------------------------------------------------------ */

describe('the task checkbox', () => {
  it('writes planner_events.done alone, and never assignment_progress', async () => {
    seed([SIX_KINDS[1]]);
    renderPlanner();

    const box = await findLabelled('Done: Email TA');
    expect(box).toHaveAttribute('type', 'checkbox');
    fireEvent.click(box);

    await waitFor(() => expect(writesTo('planner_events')).toHaveLength(1));
    expect(db.writes[0]).toMatchObject({ table: 'planner_events', op: 'update', payload: { done: true }, id: 'e-task' });
    expect(writesTo('assignment_progress')).toEqual([]);
    expect(writesTo('assignments')).toEqual([]);
    expect(openDialog()).toBeNull();
  });
});

/* ---------------------------------------------------------------------------
 * Opening the form
 * ------------------------------------------------------------------------ */

describe('opening PlannerEventForm', () => {
  it('opens the create form from an empty half-hour slot, prefilled', async () => {
    renderPlanner();
    fireEvent.click(await findLabelled('New event, Wed Sep 16, 2:30 PM'));

    const dialog = dialogNamed('New planner event');
    expect(within(dialog).getByLabelText('Start date')).toHaveValue('2026-09-16');
    expect(within(dialog).getByLabelText('Start time')).toHaveValue('14:30');
    expect(within(dialog).getByLabelText('End date')).toHaveValue('2026-09-16');
    expect(within(dialog).getByLabelText('End time')).toHaveValue('15:30');
    expect(within(dialog).getByLabelText('Time zone')).toHaveValue('America/New_York');
    expect(within(dialog).getByLabelText('All day')).not.toBeChecked();
  });

  it('opens an all-day create form from an empty Events cell', async () => {
    renderPlanner();
    fireEvent.click(await findLabelled('New all-day event, Fri Sep 18'));

    const dialog = dialogNamed('New planner event');
    expect(within(dialog).getByLabelText('All day')).toBeChecked();
    expect(within(dialog).getByLabelText('First day')).toHaveValue('2026-09-18');
    expect(within(dialog).getByLabelText('Last day')).toHaveValue('2026-09-18');
  });

  it('never opens the create form from a class, a due card or a planner event', async () => {
    seed([makePlannerEvent({ title: 'Advising' })]);
    renderPlanner();
    await findTitle('Advising');

    const classBlock = within(dayColumn('2026-09-16')).getByText('Hinds Hall 010').closest('[data-block]') as HTMLElement;
    fireEvent.click(classBlock);
    expect(openDialog()).toBeNull();

    // T-2: a due card opens the small assignment popover — never the event
    // form, and no longer the `?item=` panel.
    const dueCard = (await within(dayColumn('2026-09-17')).findByText('Lab #1')).closest('[data-block]') as HTMLElement;
    fireEvent.click(dueCard);
    expect(nav.push).not.toHaveBeenCalled();
    expect(document.querySelector('[data-planner-popover="true"]')).not.toBeNull();
    expect(document.querySelector('[role="dialog"][aria-label="New planner event"]')).toBeNull();

    fireEvent.click(blockOf('Advising'));
    const edit = dialogNamed('Edit planner event');
    expect(within(edit).getByLabelText('Title')).toHaveValue('Advising');
    expect(buttonIn(edit, 'Delete')).toBeInTheDocument();
  });

  it('closes on Esc and puts focus back on the slot that opened it', async () => {
    renderPlanner();
    const slot = await findLabelled('New event, Thu Sep 17, 9:00 AM');
    slot.focus();
    fireEvent.click(slot);
    expect(openDialog()).not.toBeNull();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    await waitFor(() => expect(openDialog()).toBeNull());
    expect(document.activeElement).toBe(slot);
  });

  it('moves between slots with the arrow keys, one tab stop for the grid', async () => {
    renderPlanner();
    const first = await findLabelled('New event, Mon Sep 14, 8:00 AM');
    expect(first).toHaveAttribute('tabindex', '0');
    first.focus();

    fireEvent.keyDown(first, { key: 'ArrowDown' });
    const below = labelled('New event, Mon Sep 14, 8:30 AM');
    expect(document.activeElement).toBe(below);
    fireEvent.keyDown(below, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(labelled('New event, Tue Sep 15, 8:30 AM'));
    expect(document.querySelectorAll('[data-slot][tabindex="0"]')).toHaveLength(1);
  });
});

/* ---------------------------------------------------------------------------
 * Saving and deleting through the form
 * ------------------------------------------------------------------------ */

describe('saving through the form', () => {
  it('refuses a blank title with a field error and writes nothing', async () => {
    renderPlanner();
    fireEvent.click(await findLabelled('New event, Wed Sep 16, 2:30 PM'));
    const dialog = dialogNamed('New planner event');
    fireEvent.click(buttonIn(dialog, 'Save'));

    expect(await within(dialog).findByText('Give it a title.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    expect(db.writes).toEqual([]);
  });

  it('creates an event in planner_events at the converted instant, then closes', async () => {
    renderPlanner();
    fireEvent.click(await findLabelled('New event, Wed Sep 16, 2:30 PM'));
    const dialog = dialogNamed('New planner event');
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Advising' } });
    fireEvent.change(within(dialog).getByLabelText('Time zone'), { target: { value: 'America/Los_Angeles' } });
    fireEvent.click(buttonIn(dialog, 'Save'));

    await waitFor(() => expect(openDialog()).toBeNull());
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0]).toMatchObject({
      table: 'planner_events',
      op: 'insert',
      payload: {
        kind: 'event',
        title: 'Advising',
        time_zone: 'America/Los_Angeles',
        starts_at: '2026-09-16T21:30:00.000Z',
        ends_at: '2026-09-16T22:30:00.000Z',
        all_day: false,
        done: null,
      },
    });
  });

  it('explains a fall-back fold under the start time', async () => {
    nav.params = new URLSearchParams('week=2026-10-26');
    renderPlanner();
    fireEvent.click(await findLabelled('New event, Sun Nov 1, 8:00 AM'));
    const dialog = dialogNamed('New planner event');
    fireEvent.change(within(dialog).getByLabelText('Start time'), { target: { value: '01:30' } });
    expect(within(dialog).getByText(/01:30 happens twice on 2026-11-01/)).toBeInTheDocument();
  });

  it('deletes from planner_events after one confirmation', async () => {
    seed([makePlannerEvent({ id: 'e-1', title: 'Advising' })]);
    renderPlanner();
    fireEvent.click(await findTitle('Advising'));

    const dialog = dialogNamed('Edit planner event');
    fireEvent.click(buttonIn(dialog, 'Delete'));
    expect(db.writes).toEqual([]);
    fireEvent.click(buttonIn(dialog, 'Yes, delete'));

    await waitFor(() => expect(openDialog()).toBeNull());
    expect(db.writes).toEqual([{ table: 'planner_events', op: 'delete', payload: null, id: 'e-1' }]);
  });
});

/* ---------------------------------------------------------------------------
 * Round 2 (code review)
 * ------------------------------------------------------------------------ */

/** A gate the test opens by hand. */
function holdWrites(): () => void {
  let open = () => {};
  db.gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  return open;
}

function gridAlert(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="alert"]')).find(
    (element) => !element.closest('[role="dialog"]'),
  ) ?? null;
}

describe('R2-4 — editing keeps a stored instant the owner did not change', () => {
  it('saves the second 01:30 of the 2026-11-01 fold unchanged when only the title is edited', async () => {
    nav.params = new URLSearchParams('week=2026-10-26');
    seed([
      makePlannerEvent({
        id: 'fold',
        title: 'Late call',
        starts_at: '2026-11-01T06:30:00.000Z', // 01:30 EST, the second one
        ends_at: '2026-11-01T07:00:00.000Z',
      }),
    ]);
    renderPlanner();
    fireEvent.click(await findTitle('Late call'));

    const dialog = dialogNamed('Edit planner event');
    expect(within(dialog).getByLabelText('Start time')).toHaveValue('01:30');
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Late call (moved room)' } });
    fireEvent.click(buttonIn(dialog, 'Save'));

    await waitFor(() => expect(openDialog()).toBeNull());
    expect(db.writes).toHaveLength(1);
    expect(db.writes[0]).toMatchObject({
      table: 'planner_events',
      op: 'update',
      id: 'fold',
      payload: {
        title: 'Late call (moved room)',
        starts_at: '2026-11-01T06:30:00.000Z',
        ends_at: '2026-11-01T07:00:00.000Z',
      },
    });
  });
});

describe('R2-6 — a save refused after the dialog closed is not lost', () => {
  it('reports the refusal in the grid alert and rolls the block back', async () => {
    renderPlanner();
    fireEvent.click(await findLabelled('New event, Wed Sep 16, 2:30 PM'));
    const dialog = dialogNamed('New planner event');
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Advising' } });

    const open = holdWrites();
    db.failWith = 'insert refused';
    fireEvent.click(buttonIn(dialog, 'Save'));
    await waitFor(() => expect(buttonIn(dialog, 'Saving…')).toBeDisabled());
    await findTitle('Advising'); // the optimistic block

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await waitFor(() => expect(openDialog()).toBeNull());

    open();
    await waitFor(() => expect(gridAlert()).not.toBeNull());
    expect(gridAlert()).toHaveTextContent('Could not save “Advising”: insert refused');
    await waitFor(() => expect(titleButtons('Advising')).toHaveLength(0));
  });

  it('keeps the dialog open with the refusal when it is still open', async () => {
    db.failWith = 'insert refused';
    renderPlanner();
    fireEvent.click(await findLabelled('New event, Wed Sep 16, 2:30 PM'));
    const dialog = dialogNamed('New planner event');
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Advising' } });
    fireEvent.click(buttonIn(dialog, 'Save'));

    expect(await within(dialog).findByText('Could not save: insert refused')).toBeInTheDocument();
    expect(openDialog()).not.toBeNull();
    expect(gridAlert()).toBeNull();
  });

  it("shows the server's zone refusal under the zone field", async () => {
    db.failWith = "planner_events: time_zone 'Mars/Base' is not an IANA zone name";
    renderPlanner();
    fireEvent.click(await findLabelled('New event, Wed Sep 16, 2:30 PM'));
    const dialog = dialogNamed('New planner event');
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Advising' } });
    fireEvent.click(buttonIn(dialog, 'Save'));

    expect(
      await within(dialog).findByText('The calendar database does not know this zone; choose another.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Time zone')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('R2-10 — the task alert clears', () => {
  it('on dismiss, and on the next successful write', async () => {
    seed([SIX_KINDS[1]]);
    db.failWith = 'permission denied';
    renderPlanner();

    fireEvent.click(await findLabelled('Done: Email TA'));
    await waitFor(() => expect(gridAlert()).toHaveTextContent('Could not update “Email TA”: permission denied'));
    fireEvent.click(buttonIn(gridAlert()!, 'Dismiss'));
    expect(gridAlert()).toBeNull();

    fireEvent.click(await findLabelled('Done: Email TA'));
    await waitFor(() => expect(gridAlert()).not.toBeNull());

    db.failWith = null;
    await waitFor(() => expect(labelled('Done: Email TA')).not.toBeDisabled());
    fireEvent.click(labelled('Done: Email TA'));
    await waitFor(() => expect(gridAlert()).toBeNull());
  });
});

describe('R2-8 — counts what renders', () => {
  it('treats an event ending exactly at Monday 00:00 as nothing this week', async () => {
    db.rows = {
      meetings: [],
      sessions: [],
      v_work_items: [],
      terms: TERM,
      courses: COURSES,
      planner_events: [
        makePlannerEvent({
          id: 'sunday-late',
          title: 'Sunday wind-down',
          starts_at: '2026-09-14T03:00:00.000Z', // Sun Sep 13, 23:00 New York
          ends_at: '2026-09-14T04:00:00.000Z', // Mon Sep 14, 00:00 New York
        }),
      ],
    };
    renderPlanner();

    expect(await screen.findByText('Nothing scheduled this week.')).toBeInTheDocument();
    expect(screen.getByText('0 classes · 0 due')).toBeInTheDocument();
    expect(titleButtons('Sunday wind-down')).toHaveLength(0);
  });
});
