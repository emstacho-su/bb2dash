/**
 * The card-note input is the only place in the app where the owner types into
 * a synced row, and every bug it had was about *when* the field adopts the
 * server's copy:
 *
 *   - it re-seeded the draft from the still-old `stored` prop the instant the
 *     save started, so the text reverted under the cursor;
 *   - a failed save threw the typed text away with it;
 *   - a blur with no edit behind it still wrote, which — with the old 200-char
 *     slice — rewrote a legal 250-character note down to 200.
 *
 * The mutation is a spy here; nothing reaches Supabase.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The save hook, driven by hand so a test can hold it in flight or fail it. */
const save = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null as Error | null,
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

vi.mock('@/lib/queries.course', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.course')>();
  return { ...actual, useUpdateCardNote: () => save };
});

const { CardNoteField } = await import('@/app/(app)/course/[id]/info/CourseInfo');

function field(): HTMLInputElement {
  return screen.getByLabelText(/Shown on this course/i) as HTMLInputElement;
}

beforeEach(() => {
  save.mutate.mockReset();
  save.isPending = false;
  save.isError = false;
  save.error = null;
});

describe('CardNoteField — what a blur actually writes', () => {
  it('writes the edited note once', () => {
    render(<CardNoteField courseId="IST.323" stored={null} disabled={false} />);
    fireEvent.change(field(), { target: { value: 'Ethics case group 3' } });
    fireEvent.blur(field());

    expect(save.mutate).toHaveBeenCalledTimes(1);
    expect(save.mutate.mock.calls[0][0]).toEqual({
      courseId: 'IST.323',
      note: 'Ethics case group 3',
    });
  });

  it('writes nothing at all when the blur follows no edit', () => {
    // A 250-character note is legal (the column allows 280). Focusing the field
    // and leaving must not turn it into a write — the old 200-char slice did.
    const stored = 'n'.repeat(250);
    render(<CardNoteField courseId="IST.323" stored={stored} disabled={false} />);
    fireEvent.focus(field());
    fireEvent.blur(field());

    expect(save.mutate).not.toHaveBeenCalled();
    expect(field().value).toBe(stored);
  });

  it('writes nothing when the only change is whitespace it would strip anyway', () => {
    render(<CardNoteField courseId="IST.323" stored="Ethics case" disabled={false} />);
    fireEvent.change(field(), { target: { value: '  Ethics   case  ' } });
    fireEvent.blur(field());
    expect(save.mutate).not.toHaveBeenCalled();
  });
});

describe('CardNoteField — the draft while a save is in flight', () => {
  it('keeps the typed text when `stored` is still the old value', () => {
    const { rerender } = render(
      <CardNoteField courseId="IST.323" stored="old note" disabled={false} />,
    );
    fireEvent.change(field(), { target: { value: 'new note' } });
    fireEvent.blur(field());
    expect(save.mutate).toHaveBeenCalledTimes(1);

    // The write is away; the query cache has not caught up yet.
    save.isPending = true;
    rerender(<CardNoteField courseId="IST.323" stored="old note" disabled={false} />);
    expect(field().value).toBe('new note');
  });

  it('adopts the value the save actually stored', async () => {
    save.mutate.mockImplementation((_vars, options) => options?.onSuccess?.('new note'));
    const { rerender } = render(
      <CardNoteField courseId="IST.323" stored="old note" disabled={false} />,
    );
    fireEvent.change(field(), { target: { value: 'new note' } });
    fireEvent.blur(field());

    rerender(<CardNoteField courseId="IST.323" stored="new note" disabled={false} />);
    await waitFor(() => expect(field().value).toBe('new note'));
  });

  it('keeps the draft and shows the error when the save fails', () => {
    save.mutate.mockImplementation(() => {
      save.isError = true;
      save.error = new Error('permission denied');
    });
    const { rerender } = render(
      <CardNoteField courseId="IST.323" stored="old note" disabled={false} />,
    );
    fireEvent.change(field(), { target: { value: 'note that will not save' } });
    fireEvent.blur(field());

    // The cache rolled back, so `stored` is the old value again.
    rerender(<CardNoteField courseId="IST.323" stored="old note" disabled={false} />);
    expect(field().value).toBe('note that will not save');
    expect(screen.getByRole('alert')).toHaveTextContent('permission denied');
    expect(field()).toBeEnabled();
  });
});

describe('CardNoteField — adopting a note from elsewhere', () => {
  it('takes up a note that arrives after the first render', () => {
    const { rerender } = render(
      <CardNoteField courseId="IST.323" stored={null} disabled={true} />,
    );
    expect(field().value).toBe('');
    rerender(<CardNoteField courseId="IST.323" stored="loaded note" disabled={false} />);
    expect(field().value).toBe('loaded note');
  });

  it('does not clobber text the owner is part-way through typing', () => {
    const { rerender } = render(
      <CardNoteField courseId="IST.323" stored="old note" disabled={false} />,
    );
    fireEvent.change(field(), { target: { value: 'half-typ' } });
    rerender(<CardNoteField courseId="IST.323" stored="something else" disabled={false} />);
    expect(field().value).toBe('half-typ');
  });
});

describe('CardNoteField — the cap', () => {
  it('offers the column cap to the browser, so 280 is the real limit', () => {
    render(<CardNoteField courseId="IST.323" stored={null} disabled={false} />);
    expect(field()).toHaveAttribute('maxLength', '280');
  });

  it('refuses an over-long note with a visible message and no write', () => {
    render(<CardNoteField courseId="IST.323" stored={null} disabled={false} />);
    fireEvent.change(field(), { target: { value: 'q'.repeat(281) } });
    fireEvent.blur(field());

    expect(save.mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('limited to 280 characters');
    expect(field().value).toBe('q'.repeat(281));
  });
});
