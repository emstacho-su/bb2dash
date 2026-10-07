/**
 * The Workspace screen: nothing it positions absolutely is left outside the
 * box that scrolls it (the PM's walk of 2026-10-07, W-1).
 *
 * A screen-reader label is `.sr-only`: `position: absolute` with no offsets
 * (`src/app/globals.css`). What contains such a box is its nearest positioned
 * ancestor, and a box that scrolls clips and moves only what it contains. The
 * message column scrolled without being positioned, so the labels of its turns
 * were the page's: each stayed where the unscrolled column would have put it,
 * as far down as the column's whole content, and the document grew to hold
 * them (a body of 901 px in a document of 4662 px, on the walk).
 *
 * jsdom lays nothing out and does not apply the CSS Modules, so the
 * stylesheets are read here, the way `GradesTables.layout.test.tsx` reads its
 * own: which classes scroll, which are positioned, which are absolute. The
 * rule is then checked twice, on the stylesheets and on the mounted screen.
 * `e2e/workspace-layout.spec.ts` measures the same column in a browser.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import screenStyles from '@/app/(app)/workspace/Workspace.module.css';
import composerStyles from '@/components/workspace/Composer.module.css';
import listStyles from '@/components/workspace/ConversationList.module.css';
import messageStyles from '@/components/workspace/MessageList.module.css';
import statusStyles from '@/components/workspace/ServiceStatus.module.css';
import badgeStyles from '@/components/workspace/TierBadge.module.css';
import { newQueryClient } from './hydration-harness';
import { fake, resetFake, type Row } from './workspace-harness';

vi.mock('@/lib/supabase/client', async () =>
  (await import('./workspace-harness')).supabaseClientMock(),
);
vi.mock('next/navigation', async () => (await import('./workspace-harness')).navigationMock());

const labels = await import('@/lib/workspace-labels');
const { Workspace } = await import('@/app/(app)/workspace/Workspace');

/* ---------------------------------------------------------------------------
 * What the stylesheets say of a rendered class
 * ------------------------------------------------------------------------ */

// `process.cwd()`, not `import.meta.url`: under jsdom the module URL is an http
// one (see audits.test.ts). Vitest runs from `web/`.
const SRC = join(process.cwd(), 'src');
const COMPONENTS = 'components/workspace';

interface Sheet {
  readonly file: string;
  /** Source class name → the class name the module renders; null for a sheet that renames nothing. */
  readonly names: Readonly<Record<string, string>> | null;
}

/** Where `.sr-only` is written. Its classes render as they are written. */
const GLOBAL_SHEET: Sheet = { file: 'app/globals.css', names: null };

/** Every stylesheet the screen lays itself out with (the first case below holds the list to the folder). */
const SCREEN_SHEETS: readonly Sheet[] = [
  { file: 'app/(app)/workspace/Workspace.module.css', names: screenStyles },
  { file: `${COMPONENTS}/Composer.module.css`, names: composerStyles },
  { file: `${COMPONENTS}/ConversationList.module.css`, names: listStyles },
  { file: `${COMPONENTS}/MessageList.module.css`, names: messageStyles },
  { file: `${COMPONENTS}/ServiceStatus.module.css`, names: statusStyles },
  { file: `${COMPONENTS}/TierBadge.module.css`, names: badgeStyles },
];

interface Facts {
  /** Where the class is written, as `file: .class`. */
  readonly source: string;
  /** It scrolls what overflows it. */
  readonly scrolls: boolean;
  /** It contains the absolutely positioned boxes inside it. */
  readonly positioned: boolean;
  /** It is taken out of the flow, and placed by whatever contains it. */
  readonly absolute: boolean;
}

const SCROLLS = /(?:^|[;\s])overflow(?:-[xy])?\s*:\s*(?:auto|scroll)\b/;
const POSITIONED = /(?:^|[;\s])position\s*:\s*(?:relative|absolute|fixed|sticky)\b/;
const ABSOLUTE = /(?:^|[;\s])position\s*:\s*absolute\b/;

/** The class a sheet renders `name` as. A composed class renders several: its own comes first. */
function renderedName(sheet: Sheet, name: string): string | undefined {
  return sheet.names === null ? name : sheet.names[name]?.split(/\s+/)[0];
}

/** One sheet's facts, by rendered class. A rule is about the last compound of its selector. */
function factsOf(sheet: Sheet): ReadonlyMap<string, Facts> {
  const css = readFileSync(join(SRC, sheet.file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const facts = new Map<string, Facts>();
  // Innermost blocks only, so a rule inside @media is read like any other.
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of selectors.split(',')) {
      const subject = selector.trim().split(/\s*[>+~]\s*|\s+/).at(-1) ?? '';
      for (const [, name] of subject.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
        const rendered = renderedName(sheet, name);
        if (rendered === undefined) continue;
        const known = facts.get(rendered);
        facts.set(rendered, {
          source: `${sheet.file}: .${name}`,
          scrolls: (known?.scrolls ?? false) || SCROLLS.test(body),
          positioned: (known?.positioned ?? false) || POSITIONED.test(body),
          absolute: (known?.absolute ?? false) || ABSOLUTE.test(body),
        });
      }
    }
  }
  return facts;
}

/** Every class the screen can render, with what its sheet says of it. */
const FACTS: ReadonlyMap<string, Facts> = new Map(
  [GLOBAL_SHEET, ...SCREEN_SHEETS].flatMap((sheet) => [...factsOf(sheet)]),
);

function factsOfElement(element: Element): readonly Facts[] {
  return [...element.classList].flatMap((name) => {
    const facts = FACTS.get(name);
    return facts === undefined ? [] : [facts];
  });
}

function describeBox(element: Element): string {
  const written = factsOfElement(element).map((facts) => facts.source);
  return written.length > 0 ? written.join(' + ') : element.tagName.toLowerCase();
}

/**
 * Every absolutely positioned box under `root` that a scrolling ancestor does
 * not contain: going up from it, a box that scrolls comes before any that is
 * positioned.
 */
function leftOutside(root: Element): string[] {
  const out: string[] = [];
  for (const element of root.querySelectorAll('*')) {
    if (!factsOfElement(element).some((facts) => facts.absolute)) continue;
    for (let box = element.parentElement; box !== null; box = box.parentElement) {
      const facts = factsOfElement(box);
      if (facts.some((one) => one.positioned)) break;
      if (facts.some((one) => one.scrolls)) {
        out.push(`"${element.textContent}" is not contained by ${describeBox(box)}`);
        break;
      }
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * A conversation with each of the three labels in it
 * ------------------------------------------------------------------------ */

const A = '6f1c2a54-9b1e-4c0d-8a55-0d2f3b7c9e11';

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function question(n: number, content: string): Row {
  return { id: uuid(n), conversation_id: A, role: 'user', content, finished: true };
}

/** An answered question, then one that was stopped before the runner began: a status, not an answer. */
const CONVERSATION: Record<string, Row[]> = {
  workspace_conversations: [{ id: A, title: 'spike', archived: false, updated_at: '2026-10-06T15:00:00+00:00' }],
  workspace_messages: [
    question(1, 'What is due?'),
    {
      id: uuid(2),
      conversation_id: A,
      role: 'assistant',
      request_id: 41,
      tier: 'low',
      content: 'Quiz 2.',
      tool_calls: [{ tool: 'search_materials', scope: 'IST.323', ok: true }],
      finished: true,
      error_code: null,
    },
    question(3, 'And the reading?'),
  ],
  workspace_requests: [
    { id: 41, conversation_id: A, user_message_id: uuid(1), state: 'done', error_code: null },
    { id: 42, conversation_id: A, user_message_id: uuid(3), state: 'cancelled', error_code: 'cancelled' },
  ],
};

beforeEach(() => {
  resetFake();
});

describe('what the stylesheets say', () => {
  it('reads every stylesheet of the screen: the list here is the folder', () => {
    const inFolder = readdirSync(join(SRC, COMPONENTS))
      .filter((name) => name.endsWith('.module.css'))
      .map((name) => `${COMPONENTS}/${name}`);

    expect(SCREEN_SHEETS.map((sheet) => sheet.file).filter((file) => file.startsWith(COMPONENTS)).sort()).toEqual(
      inFolder.sort(),
    );
  });

  it('writes a screen-reader label as an absolute box, and the message column as one that scrolls', () => {
    expect(FACTS.get('sr-only')?.absolute).toBe(true);
    expect(FACTS.get(messageStyles.column)?.scrolls).toBe(true);
  });

  it('positions every box that scrolls on the Workspace screen, so it contains what it scrolls', () => {
    const scrollers = [...FACTS.values()].filter((facts) => facts.scrolls);

    expect(scrollers.map((facts) => facts.source)).toContain(`${COMPONENTS}/MessageList.module.css: .column`);
    expect(scrollers.filter((facts) => !facts.positioned).map((facts) => facts.source)).toEqual([]);
  });
});

describe('the mounted screen', () => {
  it('leaves no screen-reader label of a conversation outside the column that scrolls it', async () => {
    fake.state.rows = CONVERSATION;
    fake.state.search = `c=${A}`;
    const { container } = render(
      <QueryClientProvider client={newQueryClient()}>
        <Workspace />
      </QueryClientProvider>,
    );
    await screen.findByText('You stopped this answer.');
    await screen.findByRole('link', { name: /spike/ });

    // The three labels, each inside the column: the check below has something to check.
    const column = container.querySelector(`.${messageStyles.column}`);
    const inColumn = [...(column?.querySelectorAll('.sr-only') ?? [])].map((label) => label.textContent);
    expect(inColumn).toEqual([
      labels.QUESTION_ROLE_LABEL,
      labels.ANSWER_ROLE_LABEL,
      labels.QUESTION_ROLE_LABEL,
      labels.STATUS_ROLE_LABEL,
    ]);

    expect(leftOutside(container)).toEqual([]);
  });
});
