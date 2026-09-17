/**
 * C-10's notification e2e, driven through `globalThis.__bb2dashTest` from the main process.
 *
 * Three claims, in Stack's words:
 *  1. a tick from a fixture fires exactly the expected toasts, once;
 *  2. relaunching the app does not re-fire them (the watermark is on disk);
 *  3. clicking a toast lands on the right screen.
 *
 * Nothing here touches `*.supabase.co`: the rows are fixtures handed straight to the reducer,
 * and the app origin is a loopback server started by the spec.
 */

import { expect, test, type ElectronApplication } from '@playwright/test';

import {
  SKIP_REASON,
  type TickFixture,
  clickToast,
  launchShell,
  makeUserDataDir,
  recordedNavigations,
  recordedToasts,
  removeDir,
  shellIsBuilt,
  startAppServer,
  tick,
} from './harness';

const COURSES = [
  { id: 'IST.323', title_short: 'IST 323' },
  { id: 'GEO.103.lecture', title_short: 'GEO 103' },
];

/** Shaped like migrations 035, 058 and 016 — see `test/fixtures/rows.ts`. */
const FIXTURE: TickFixture = {
  sync: {
    id: 41,
    run_id: '6b122650-49f3-4a70-a801-c177fbf27f1a',
    status: 'ok',
    started_at: '2099-01-01T17:58:00.000Z',
    finished_at: '2099-01-01T18:00:00.000Z',
    trigger: 'app_request',
    summary: {
      changes: ['3 new item(s) in the course content tree', '2 new announcement(s)'],
      attention_raised: 0,
      errors: [],
    },
  },
  grades: [
    {
      shell_course_id: 'IST.323',
      column_id: 'col-9001',
      name: 'Lab 3',
      run_id: 'run-a',
      seen_at: '2099-01-01T17:59:00.000Z',
      score: 18,
      possible: 20,
      previous_score: null,
    },
  ],
  due: [
    {
      item_kind: 'assignment',
      item_id: 'a-1',
      course_id: 'GEO.103.lecture',
      title: 'Map exercise 4',
      due_at: '2099-01-02T23:59:00.000Z',
      due_on: '2099-01-02',
      status: 'not_started',
    },
  ],
  courses: COURSES,
};

const DOT = ' · ';

test.skip(!shellIsBuilt(), SKIP_REASON);

test.describe('notifications', () => {
  let server: Awaited<ReturnType<typeof startAppServer>>;
  let userDataDir: string;
  let app: ElectronApplication | null = null;

  test.beforeAll(async () => {
    server = await startAppServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test.beforeEach(async () => {
    userDataDir = await makeUserDataDir();
  });

  test.afterEach(async () => {
    if (app) await app.close();
    app = null;
    await removeDir(userDataDir);
  });

  test('a fixture tick fires exactly the expected toasts, and a second identical tick fires none', async () => {
    app = await launchShell({ userDataDir, appUrl: server.origin });
    await app.firstWindow();

    const first = await tick(app, FIXTURE);
    expect(first.outcome).toBe('fired');

    const toasts = await recordedToasts(app);
    expect(toasts.map((t) => t.key)).toEqual([
      'sync:41',
      'grade:IST.323:col-9001:run-a',
      expect.stringMatching(/^due:\d{4}-\d{2}-\d{2}$/),
    ]);
    expect(toasts[0]?.title).toBe(`Sync landed${DOT}2 change(s)`);
    expect(toasts[0]?.route).toBe('/');
    expect(toasts[1]?.title).toBe(`IST 323${DOT}Lab 3`);
    expect(toasts[1]?.body).toBe('18 / 20');
    expect(toasts[1]?.route).toBe('/course/IST.323/grades');
    expect(toasts[2]?.title).toBe(`Due tomorrow${DOT}1 item(s)`);
    expect(toasts[2]?.body).toBe(`GEO 103${DOT}Map exercise 4`);

    const second = await tick(app, FIXTURE);
    expect(second.outcome).toBe('quiet');
    expect(second.toastCount).toBe(0);
    expect(await recordedToasts(app)).toHaveLength(3);
  });

  test('a relaunch against the same watermark fires none', async () => {
    app = await launchShell({ userDataDir, appUrl: server.origin });
    await app.firstWindow();
    expect((await tick(app, FIXTURE)).toastCount).toBe(3);
    await app.close();

    // Same profile directory: the watermark file is the one the first process wrote.
    app = await launchShell({ userDataDir, appUrl: server.origin });
    await app.firstWindow();
    expect(await recordedToasts(app)).toEqual([]);

    const again = await tick(app, FIXTURE);
    expect(again.outcome).toBe('quiet');
    expect(await recordedToasts(app)).toEqual([]);
  });

  test('clicking a recorded toast navigates to its route', async () => {
    app = await launchShell({ userDataDir, appUrl: server.origin });
    const window = await app.firstWindow();
    await tick(app, FIXTURE);

    expect(await clickToast(app, 'grade:IST.323:col-9001:run-a')).toBe(true);
    await window.waitForURL(`${server.origin}/course/IST.323/grades`);

    const navigations = await recordedNavigations(app);
    expect(navigations.at(-1)).toMatchObject({ route: '/course/IST.323/grades', accepted: true });
  });

  test('a toast key that was never shown does not navigate', async () => {
    app = await launchShell({ userDataDir, appUrl: server.origin });
    await app.firstWindow();
    expect(await clickToast(app, 'grade:NOPE:nope:nope')).toBe(false);
    expect(await recordedNavigations(app)).toEqual([]);
  });
});
