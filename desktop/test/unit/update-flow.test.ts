/**
 * Updates prompt on open (Stack, 2026-09-30).
 *
 * When the builder has produced a newer build than the one running, the next window open
 * asks "Update now" or "Update later"; later lets Stack pick 1 hour, 4 hours or tomorrow,
 * persisted next to config.json so it does not nag before then. Under the test env var
 * nothing is shown at all: the prompt is recorded instead (Phase 12 rule: e2e never opens a
 * dialog).
 */

import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  REMIND_AFTER_FOUR_HOURS_MS,
  REMIND_AFTER_ONE_HOUR_MS,
  REMIND_TOMORROW_HOUR,
  decideUpdate,
  parseLastBuiltSha,
  remindAfter,
} from '../../src/core/update/update-check';
import { REMINDER_FILENAME, createReminderStore } from '../../src/main/update-reminder-store';
import { createUpdateFlow } from '../../src/core/update/update-flow';
import type { PromptAnswer, UpdateFlowDeps } from '../../src/core/update/update-flow';
import type { Logger } from '../../src/core/redact';

const RUNNING = 'b087a07ed75b9560c73cc4ed7dd888a5a8da6800';
const NEWER = '31215cf503f565cd7113d01b14266e4b2ce1000d';
const T0 = new Date(2026, 8, 30, 14, 0, 0); // local time: "tomorrow" is a local-clock idea

function logger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (m) => lines.push(`info ${m}`),
    warn: (m) => lines.push(`warn ${m}`),
    error: (m) => lines.push(`error ${m}`),
  };
}

describe('remindAfter', () => {
  it('names its three choices as constants', () => {
    expect(REMIND_AFTER_ONE_HOUR_MS).toBe(60 * 60 * 1000);
    expect(REMIND_AFTER_FOUR_HOURS_MS).toBe(4 * 60 * 60 * 1000);
    expect(REMIND_TOMORROW_HOUR).toBe(9);
  });

  it('is one hour, four hours, or tomorrow morning', () => {
    expect(remindAfter('one-hour', T0).getTime()).toBe(T0.getTime() + REMIND_AFTER_ONE_HOUR_MS);
    expect(remindAfter('four-hours', T0).getTime()).toBe(T0.getTime() + REMIND_AFTER_FOUR_HOURS_MS);
    expect(remindAfter('tomorrow', T0)).toEqual(new Date(2026, 9, 1, REMIND_TOMORROW_HOUR, 0, 0));
  });

  it('means the next calendar day even just after midnight', () => {
    expect(remindAfter('tomorrow', new Date(2026, 8, 30, 0, 30))).toEqual(new Date(2026, 9, 1, 9, 0, 0));
  });
});

describe('parseLastBuiltSha', () => {
  it('reads the builder’s state.json', () => {
    expect(parseLastBuiltSha(`{"lastBuiltSha":"${NEWER}","lastBuildAt":"x","lastResult":"ok"}`)).toBe(NEWER);
  });

  it('is null for anything malformed', () => {
    expect(parseLastBuiltSha('not json')).toBeNull();
    expect(parseLastBuiltSha('{"lastBuiltSha":"../../evil"}')).toBeNull();
    expect(parseLastBuiltSha('{"lastBuiltSha":""}')).toBeNull();
    expect(parseLastBuiltSha('[]')).toBeNull();
  });
});

describe('decideUpdate', () => {
  const base = {
    runningTree: RUNNING,
    lastBuiltSha: NEWER,
    buildOnDisk: (): boolean => true,
    remindAfter: null,
    now: T0,
  };

  it('prompts when a newer build is on disk', () => {
    expect(decideUpdate(base)).toEqual({ kind: 'prompt', tree: NEWER });
  });

  it('does nothing for a dev run, no build, the same build, or a build that is not on disk', () => {
    expect(decideUpdate({ ...base, runningTree: null }).kind).toBe('none');
    expect(decideUpdate({ ...base, lastBuiltSha: null }).kind).toBe('none');
    expect(decideUpdate({ ...base, lastBuiltSha: RUNNING }).kind).toBe('none');
    expect(decideUpdate({ ...base, buildOnDisk: () => false }).kind).toBe('none');
  });

  it('stays quiet before a chosen reminder time, and prompts after it', () => {
    const later = new Date(T0.getTime() + REMIND_AFTER_ONE_HOUR_MS);
    expect(decideUpdate({ ...base, remindAfter: later })).toEqual({ kind: 'snoozed', until: later });
    expect(decideUpdate({ ...base, remindAfter: later, now: later }).kind).toBe('prompt');
  });
});

describe('the reminder store', () => {
  const dir = (): string => mkdtempSync(join(tmpdir(), 'bb2dash-reminder-'));

  it('persists a later-choice and reads it back', () => {
    const d = dir();
    const store = createReminderStore({ filePath: join(d, REMINDER_FILENAME), log: logger() });
    const at = new Date(T0.getTime() + REMIND_AFTER_FOUR_HOURS_MS);
    store.write(at);
    expect(store.read()).toEqual(at);
    expect(JSON.parse(readFileSync(join(d, REMINDER_FILENAME), 'utf8'))).toEqual({ remindAfter: at.toISOString() });
  });

  it('reads a missing file as no reminder', () => {
    const store = createReminderStore({ filePath: join(dir(), REMINDER_FILENAME), log: logger() });
    expect(store.read()).toBeNull();
  });

  it('reads a corrupt file as no reminder, and says so', () => {
    const d = dir();
    writeFileSync(join(d, REMINDER_FILENAME), '{"remindAfter": "soon"}');
    const log = logger();
    expect(createReminderStore({ filePath: join(d, REMINDER_FILENAME), log }).read()).toBeNull();
    expect(log.lines.some((l) => l.startsWith('warn'))).toBe(true);
  });

  it('is called update-reminder.json, next to config.json', () => {
    expect(REMINDER_FILENAME).toBe('update-reminder.json');
  });
});

function flowHarness(overrides: Partial<UpdateFlowDeps> = {}, answers: PromptAnswer[] = []) {
  let now = T0;
  let stored: Date | null = null;
  const prompts: string[] = [];
  const recorded: { kind: string; payload: unknown }[] = [];
  const started: string[] = [];
  let quits = 0;
  const log = logger();

  const deps: UpdateFlowDeps = {
    runningTree: RUNNING,
    readLastBuiltSha: () => NEWER,
    buildOnDisk: () => true,
    reminders: { read: () => stored, write: (at) => void (stored = at) },
    now: () => now,
    testMode: false,
    showPrompt: async (tree) => {
      prompts.push(tree);
      return answers.shift() ?? 'dismissed';
    },
    startUpdate: async (tree) => void started.push(tree),
    quit: () => void (quits += 1),
    record: (kind, payload) => void recorded.push({ kind, payload }),
    log,
    ...overrides,
  };
  const flow = createUpdateFlow(deps);
  return {
    flow,
    prompts,
    recorded,
    started,
    log,
    quits: () => quits,
    stored: () => stored,
    setNow: (at: Date) => void (now = at),
  };
}

describe('the update flow on window open', () => {
  it('prompts once when a newer build exists', async () => {
    const h = flowHarness();
    expect(await h.flow.onWindowOpened()).toBe('prompted');
    expect(h.prompts).toEqual([NEWER]);
  });

  it('Update later persists the choice and is respected on the next opens', async () => {
    const h = flowHarness({}, ['four-hours']);
    await h.flow.onWindowOpened();
    expect(h.stored()).toEqual(new Date(T0.getTime() + REMIND_AFTER_FOUR_HOURS_MS));

    h.setNow(new Date(T0.getTime() + REMIND_AFTER_ONE_HOUR_MS));
    expect(await h.flow.onWindowOpened()).toBe('snoozed');
    expect(h.prompts).toHaveLength(1);

    h.setNow(new Date(T0.getTime() + REMIND_AFTER_FOUR_HOURS_MS));
    expect(await h.flow.onWindowOpened()).toBe('prompted');
    expect(h.prompts).toHaveLength(2);
  });

  it('Update now starts the helper, then quits', async () => {
    const h = flowHarness({}, ['update-now']);
    await h.flow.onWindowOpened();
    expect(h.started).toEqual([NEWER]);
    expect(h.quits()).toBe(1);
  });

  it('a helper that cannot start leaves the app running and says why', async () => {
    const h = flowHarness(
      {
        startUpdate: async () => {
          throw new Error('powershell.exe is missing');
        },
      },
      ['update-now'],
    );
    await h.flow.onWindowOpened();
    expect(h.quits()).toBe(0);
    expect(h.log.lines.some((l) => l.startsWith('error') && l.includes('powershell.exe'))).toBe(true);
  });

  it('a dismissed prompt stores nothing, so the next open asks again', async () => {
    const h = flowHarness({}, ['dismissed']);
    await h.flow.onWindowOpened();
    expect(h.stored()).toBeNull();
    expect(await h.flow.onWindowOpened()).toBe('prompted');
  });

  it('never stacks a second prompt on one that is still open', async () => {
    let answer: (a: PromptAnswer) => void = () => undefined;
    const h = flowHarness({
      showPrompt: () =>
        new Promise<PromptAnswer>((r) => {
          answer = r;
        }),
    });
    const first = h.flow.onWindowOpened();
    expect(await h.flow.onWindowOpened()).toBe('already-prompting');
    answer('one-hour');
    expect(await first).toBe('prompted');
  });

  it('under the test env var it records the prompt and never shows anything', async () => {
    const h = flowHarness({ testMode: true });
    expect(await h.flow.onWindowOpened()).toBe('recorded');
    expect(h.prompts).toEqual([]);
    expect(h.recorded).toEqual([{ kind: 'update-prompt', payload: { tree: NEWER } }]);
  });

  it('does nothing for a dev run', async () => {
    const h = flowHarness({ runningTree: null });
    expect(await h.flow.onWindowOpened()).toBe('none');
    expect(h.prompts).toEqual([]);
  });

  it('a state file that cannot be read is no update, not a crash', async () => {
    const h = flowHarness({
      readLastBuiltSha: () => {
        throw new Error('EACCES');
      },
    });
    expect(await h.flow.onWindowOpened()).toBe('none');
  });
});

describe('no native dialog on the update path', () => {
  it('no update source imports Electron’s dialog module', () => {
    const roots = [resolve(__dirname, '../../src/core/update'), resolve(__dirname, '../../src/main')];
    const files = roots.flatMap((root) =>
      readdirSync(root)
        .filter((name) => name.startsWith('update') || root.endsWith('update'))
        .map((name) => join(root, name)),
    );
    expect(files.length).toBeGreaterThan(3);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/\bdialog\b\s*[,}]|from 'electron'.*dialog|showMessageBox/);
    }
  });
});
