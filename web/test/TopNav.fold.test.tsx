/**
 * The nav fold at the 720 px step (Phase 22, task 12; R-46, P-79; brief 103, "The fold").
 *
 * At `max-width: 720px` the six links give way to a text button "Menu" with a panel of the same
 * six links, and the Sync label gets a span of its own: icon only at 480 px and below, capped
 * (with an ellipsis) at 1023.98 px and below so the unfolded bar is never wider than the desktop
 * window's 900 px minimum. jsdom loads no stylesheet, so the behaviour is read from the markup
 * and the layout rules from the stylesheets, block by block.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const route = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('@/components/shell/ActivityMenu', () => ({
  ActivityMenu: () => <button type="button">Activity</button>,
}));
vi.mock('@/components/shell/Bell', () => ({
  Bell: () => <button type="button">Announcements</button>,
}));
vi.mock('@/components/shell/NavSearch', () => ({
  NavSearch: () => <button type="button">Search</button>,
}));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn(), signOut: vi.fn() }, from: vi.fn() }),
}));
// The real Sync button, with its queries stubbed (the way SyncButton.test.tsx does it).
vi.mock('@/lib/queries.sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.sync')>();
  return {
    ...actual,
    useCreateAgentRequest: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false, error: null }),
    useAgentRequest: () => ({ data: null, error: null }),
    useOpenSyncRequest: () => ({ data: null, error: null }),
  };
});
vi.mock('@/lib/queries.sync-run', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.sync-run')>();
  return { ...actual, useSyncRun: () => ({ data: null, error: null }) };
});

const { SidebarProvider } = await import('@/components/shell/SidebarProvider');
const { TopNav } = await import('@/components/shell/TopNav');

const SECTIONS = ['Home', 'Planner', 'Inbox', 'Grades', 'Materials', 'Workspace'];
const PANEL_ID = 'primary-nav-menu';

function renderNav(pathname = '/') {
  route.pathname = pathname;
  const view = render(
    <SidebarProvider>
      <TopNav userEmail="stack@syr.edu" />
    </SidebarProvider>,
  );
  return {
    ...view,
    goTo(next: string) {
      route.pathname = next;
      view.rerender(
        <SidebarProvider>
          <TopNav userEmail="stack@syr.edu" />
        </SidebarProvider>,
      );
    },
  };
}

const menuButton = () => screen.getByRole('button', { name: 'Menu' });
const panel = () => document.getElementById(PANEL_ID);

beforeEach(() => {
  route.pathname = '/';
  document.documentElement.removeAttribute('data-sidebar');
  window.localStorage.clear();
});

describe('Menu button and panel', () => {
  it('is closed to start with: aria-expanded false, aria-controls the panel, no panel in the DOM', () => {
    renderNav();

    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton()).toHaveAttribute('aria-controls', PANEL_ID);
    expect(panel()).toBeNull();
  });

  it('opens on a press: aria-expanded true', () => {
    renderNav();

    fireEvent.click(menuButton());

    expect(menuButton()).toHaveAttribute('aria-expanded', 'true');
    expect(panel()).not.toBeNull();
  });

  it('lists the six pages in order, links and nothing else, the current one marked', () => {
    renderNav('/planner');
    fireEvent.click(menuButton());

    const open = panel();
    expect(open).not.toBeNull();
    const links = within(open as HTMLElement).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(SECTIONS);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/planner',
      '/inbox',
      '/grades',
      '/materials',
      '/workspace',
    ]);
    // Nothing else: every child is one of the links, and no other text is in the panel.
    expect((open as HTMLElement).children).toHaveLength(SECTIONS.length);
    expect((open as HTMLElement).textContent).toBe(SECTIONS.join(''));
    expect(links.filter((link) => link.getAttribute('aria-current') === 'page').map((link) => link.textContent)).toEqual([
      'Planner',
    ]);
  });

  it('has no panel and no second "Materials" link while it is closed', () => {
    renderNav();

    expect(panel()).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Materials' })).toHaveLength(1);
  });

  it('closes on Escape and gives focus back to Menu', () => {
    renderNav();
    fireEvent.click(menuButton());
    expect(panel()).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(panel()).toBeNull();
    expect(menuButton()).toHaveAttribute('aria-expanded', 'false');
    expect(menuButton()).toHaveFocus();
  });

  it('closes on a press outside it', () => {
    renderNav();
    fireEvent.click(menuButton());

    fireEvent.mouseDown(document.body);

    expect(panel()).toBeNull();
  });

  it('closes when the pathname changes', () => {
    const nav = renderNav('/');
    fireEvent.click(menuButton());
    expect(panel()).not.toBeNull();

    act(() => nav.goTo('/inbox'));

    expect(panel()).toBeNull();
  });

  it('closes when one of its links is pressed', () => {
    renderNav();
    fireEvent.click(menuButton());

    fireEvent.click(within(panel() as HTMLElement).getByRole('link', { name: 'Grades' }));

    expect(panel()).toBeNull();
  });
});

describe('Menu and the other controls of the bar', () => {
  it('closes the account menu when it opens, and is closed by the account menu in turn', () => {
    renderNav();

    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(menuButton());
    expect(screen.queryByRole('menu')).toBeNull();
    expect(panel()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(panel()).toBeNull();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('is closed by the ☰ button, which keeps aria-controls="course-sidebar"', () => {
    renderNav();
    const sidebar = screen.getByRole('button', { name: 'Courses sidebar' });
    expect(sidebar).toHaveAttribute('aria-controls', 'course-sidebar');
    fireEvent.click(menuButton());
    expect(panel()).not.toBeNull();

    fireEvent.click(sidebar);

    expect(panel()).toBeNull();
    expect(sidebar).toHaveAttribute('aria-controls', 'course-sidebar');
  });

  it('never writes html[data-sidebar] or the stored sidebar preference', () => {
    renderNav();
    const before = document.documentElement.getAttribute('data-sidebar');

    fireEvent.click(menuButton());
    fireEvent.click(menuButton());

    expect(document.documentElement.getAttribute('data-sidebar')).toBe(before);
    expect(window.localStorage.getItem('bb2dash.sidebar')).toBeNull();
  });

  it('sits before the right-hand group, and the group does not hold it', () => {
    renderNav();
    const sync = screen.getByTestId('sync-button');

    expect(menuButton().compareDocumentPosition(sync) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Courses sidebar' }).parentElement).not.toContainElement(menuButton());
  });

  it('keeps the brand link named "bb2dash", exactly one', () => {
    renderNav();

    expect(screen.getAllByRole('link', { name: 'bb2dash' })).toHaveLength(1);
  });
});

describe('The Sync label has a span of its own', () => {
  it('holds the label as text, and its title equals that text', () => {
    renderNav();
    const button = screen.getByTestId('sync-button');
    const label = within(button).getByText('Sync');

    expect(label.tagName).toBe('SPAN');
    expect(label).toHaveAttribute('title', label.textContent ?? '');
    expect(screen.getByRole('button', { name: 'Sync' })).toBe(button);
  });

  it('leaves the button its own title, the sentence that says what the sync is doing', () => {
    renderNav();

    expect(screen.getByTestId('sync-button').getAttribute('title')).toMatch(/\S/);
    expect(screen.getByTestId('sync-button').getAttribute('title')).not.toBe('Sync');
  });
});

/* ---------------------------------------------------------------------------
 * The stylesheets, block by block
 * ------------------------------------------------------------------------ */

function readStyles(file: string): string {
  return readFileSync(join(process.cwd(), 'src/components/shell', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** The body of every `@media (<condition>) { … }` whose condition is exactly `condition`, braces balanced. */
function mediaBlocks(source: string, condition: string): string[] {
  const head = `@media (${condition})`;
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf(head, from);
    if (at === -1) return blocks;
    const open = source.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      if (source[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    blocks.push(source.slice(open + 1, end));
    from = end;
  }
}

/** The source with every `@media` block removed: the rules that apply at every width. */
function outsideMedia(source: string): string {
  let rest = source;
  for (const match of source.matchAll(/@media\s*\([^)]*\)/g)) {
    const [block] = mediaBlocks(source, match[0].slice('@media ('.length, -1));
    if (block !== undefined) rest = rest.replace(block, '');
  }
  return rest;
}

/** The declarations of the first rule for `.name` in a piece of CSS, or null when there is none. */
function ruleBody(css: string, name: string): string | null {
  const match = new RegExp(`(?:^|[\\s}])\\.${name}\\s*\\{([^}]*)\\}`).exec(css);
  return match === null ? null : (match[1] ?? '');
}

const TOP_NAV = readStyles('TopNav.module.css');
const SYNC = readStyles('SyncButton.module.css');

describe('TopNav.module.css — the 720 px step', () => {
  const [phone] = mediaBlocks(TOP_NAV, 'max-width: 720px');

  it('has a (max-width: 720px) block', () => {
    expect(phone).toBeDefined();
  });

  it('hides .links and shows Menu', () => {
    expect(ruleBody(phone ?? '', 'links') ?? '').toMatch(/display\s*:\s*none/);
    expect(ruleBody(phone ?? '', 'menu') ?? '').toMatch(/display\s*:\s*(?!none)[a-z-]+/);
  });

  it('has Menu as display: none outside the block', () => {
    expect(ruleBody(outsideMedia(TOP_NAV), 'menu') ?? '').toMatch(/display\s*:\s*none/);
  });

  it('holds no overflow-x, min-width or scrollbar-width in the block: the strip is gone', () => {
    expect(phone ?? '').not.toMatch(/overflow-x|min-width|scrollbar-width/);
  });

  it('does not draw the icon labels at 720px and under (an unseen label would widen the bar)', () => {
    expect(phone ?? '').toMatch(/.bar .ic[data-tip]::afters*{[^}]*displays*:s*none/);
  });

  it('keeps the brand word clipped only in the (max-width: 480px) block', () => {
    const [small] = mediaBlocks(TOP_NAV, 'max-width: 480px');
    expect(ruleBody(small ?? '', 'brandName') ?? '').toMatch(/clip-path\s*:\s*inset\(50%\)/);
    expect(phone ?? '').not.toMatch(/clip-path/);
    expect(outsideMedia(TOP_NAV)).not.toMatch(/clip-path/);
  });

  it('has no .brandWord anywhere in the bar', () => {
    const tsx = readFileSync(join(process.cwd(), 'src/components/shell/TopNav.tsx'), 'utf8');
    expect(TOP_NAV).not.toMatch(/\.brandWord/);
    expect(tsx).not.toMatch(/brandWord/);
  });
});

describe('SyncButton.module.css — the label span', () => {
  it('shows the icon only at 480 px and below: the label takes .sr-only’s declarations', () => {
    const [small] = mediaBlocks(SYNC, 'max-width: 480px');
    const body = ruleBody(small ?? '', 'label') ?? '';

    expect(body).toMatch(/clip-path\s*:\s*inset\(50%\)/);
    expect(body).toMatch(/position\s*:\s*absolute/);
    expect(body).toMatch(/overflow\s*:\s*hidden/);
  });

  it('caps the label at 1023.98 px and below, with an ellipsis', () => {
    const [capped] = mediaBlocks(SYNC, 'max-width: 1023.98px');
    const body = ruleBody(capped ?? '', 'label') ?? '';

    expect(body).toMatch(/max-width\s*:/);
    expect(body).toMatch(/overflow\s*:\s*hidden/);
    expect(body).toMatch(/text-overflow\s*:\s*ellipsis/);
  });

  it('does not clip the label outside the 480 px block', () => {
    expect(outsideMedia(SYNC)).not.toMatch(/clip-path\s*:\s*inset\(50%\)/);
  });
});
