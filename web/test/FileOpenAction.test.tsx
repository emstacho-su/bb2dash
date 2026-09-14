/**
 * The one Open ladder, and the honesty label above it.
 *
 * Four screens used to hand-copy this ladder, and the copies had drifted: the
 * same unreachable file read "No route", "no route" and "on disk only"
 * depending on where you were looking, and a source link was a primary button
 * on two screens and a secondary one on the third.
 *
 * The label matters more than the button. The Classwork tree reads
 * `v_content_tree`, which projects `storage_path` and nothing else, so it used
 * to hand `fileHonesty` a fabricated `local_path: null, source_url: null` and
 * get back "No route" — an assertion that no source link exists, made by a
 * caller that cannot see the column. `UNKNOWN_ROUTE` says the true, smaller
 * thing: not stored.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
// Statically imported: `UNKNOWN_ROUTE` is a `unique symbol`, and destructuring
// it out of a dynamic import widens it to plain `symbol`. `vi.mock` is hoisted
// above every import anyway, so the client below is still the fake.
import { UNKNOWN_ROUTE } from '@/lib/queries.materials';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const { FileOpenAction } = await import('@/components/materials/FileOpenAction');
const { fileHonesty, fileLocation } = await import('@/lib/queries.materials');

describe('fileHonesty — a route column the caller cannot see', () => {
  it('says "not stored" rather than "no route" when the other columns are unknown', () => {
    const honesty = fileHonesty({
      storage_path: null,
      local_path: UNKNOWN_ROUTE,
      source_url: UNKNOWN_ROUTE,
    });
    expect(honesty.location).toBe('unknown');
    expect(honesty.label).toBe('Not stored');
    expect(honesty.openable).toBe(false);
  });

  it('still says "no route" when every column was actually looked at', () => {
    const honesty = fileHonesty({ storage_path: null, local_path: null, source_url: null });
    expect(honesty.location).toBe('none');
    expect(honesty.label).toBe('No route');
  });

  it('a stored file is in the library whatever else is unknown', () => {
    expect(
      fileHonesty({
        storage_path: 'IST.323/Lecture3.pptx',
        local_path: UNKNOWN_ROUTE,
        source_url: UNKNOWN_ROUTE,
      }),
    ).toEqual({ location: 'library', label: 'In library', openable: true });
  });

  it('keeps the three fully-known answers it always gave', () => {
    expect(fileLocation({ storage_path: 'a', local_path: 'b', source_url: 'c' })).toBe('library');
    expect(fileLocation({ storage_path: null, local_path: 'b', source_url: 'c' })).toBe('disk');
    expect(fileLocation({ storage_path: null, local_path: null, source_url: 'c' })).toBe('source');
    expect(fileHonesty({ storage_path: null, local_path: 'b', source_url: null }).label).toBe(
      'Recorded on disk',
    );
  });

  it('treats an empty string as no path, not as a path', () => {
    expect(fileLocation({ storage_path: '', local_path: '', source_url: '' })).toBe('none');
  });
});

describe('FileOpenAction — the rungs, in order', () => {
  it('opens stored bytes through the signed-URL button', () => {
    render(
      <FileOpenAction
        routes={{ storage_path: 'IST.323/Lecture3.pptx', local_path: null, source_url: 'https://x' }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Open' })).toBeEnabled();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('falls to the source URL when nothing is stored', () => {
    render(
      <FileOpenAction
        routes={{ storage_path: null, local_path: null, source_url: 'https://example.edu/a.pdf' }}
      />,
    );
    const link = screen.getByRole('link', { name: 'Open ↗' });
    expect(link).toHaveAttribute('href', 'https://example.edu/a.pdf');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('falls to the Blackboard page the caller offers', () => {
    render(
      <FileOpenAction
        routes={{ storage_path: null, local_path: UNKNOWN_ROUTE, source_url: UNKNOWN_ROUTE }}
        blackboardUrl="https://blackboard.syracuse.edu/item/42"
      />,
    );
    expect(screen.getByRole('link', { name: 'In Blackboard ↗' })).toHaveAttribute(
      'href',
      'https://blackboard.syracuse.edu/item/42',
    );
  });

  it('ends at a disabled control that names the kind of nothing it found', () => {
    const { unmount } = render(
      <FileOpenAction routes={{ storage_path: null, local_path: null, source_url: null }} />,
    );
    expect(screen.getByRole('button', { name: 'No route' })).toBeDisabled();
    unmount();

    const disk = render(
      <FileOpenAction routes={{ storage_path: null, local_path: '/mirror/a.pdf', source_url: null }} />,
    );
    expect(screen.getByRole('button', { name: 'On disk only' })).toBeDisabled();
    disk.unmount();

    render(
      <FileOpenAction
        routes={{ storage_path: null, local_path: UNKNOWN_ROUTE, source_url: UNKNOWN_ROUTE }}
      />,
    );
    const deadEnd = screen.getByRole('button', { name: 'Not stored' });
    expect(deadEnd).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'No route' })).toBeNull();
  });

  it('shows the honesty tag only where the caller asks for it', () => {
    const { unmount } = render(
      <FileOpenAction routes={{ storage_path: 'a/b.pdf', local_path: null, source_url: null }} />,
    );
    expect(screen.queryByText('In library')).toBeNull();
    unmount();

    render(
      <FileOpenAction
        routes={{ storage_path: 'a/b.pdf', local_path: null, source_url: null }}
        showLabel
      />,
    );
    expect(screen.getByText('In library')).toBeInTheDocument();
  });
});
