/**
 * The card note is the only user-written value in the course dimension, so what
 * this suite pins is the *request*: which table, which column, which row, and
 * what exactly is sent. The Supabase client is a spy — nothing here reaches the
 * network.
 *
 * The note also has to survive a paste: it is one line of plain text on a card,
 * capped, and an empty note is NULL rather than ''.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const spies = vi.hoisted(() => {
  const eq = vi.fn(async () => ({ error: null as { message: string } | null }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { eq, update, from };
});

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: spies.from }),
}));

const { updateCardNote, normalizeCardNote, validateCardNote, CARD_NOTE_MAX_LENGTH } = await import(
  '@/lib/queries.course'
);

beforeEach(() => {
  spies.eq.mockClear();
  spies.update.mockClear();
  spies.from.mockClear();
  spies.eq.mockImplementation(async () => ({ error: null }));
});

describe('updateCardNote — the request it sends', () => {
  it('updates courses.card_note on exactly the shell it was given', async () => {
    await updateCardNote('IST.323', 'Ethics case group 3');

    expect(spies.from).toHaveBeenCalledWith('courses');
    expect(spies.update).toHaveBeenCalledWith({ card_note: 'Ethics case group 3' });
    expect(spies.eq).toHaveBeenCalledWith('id', 'IST.323');
  });

  it('sends the normalized text, not the raw input', async () => {
    await updateCardNote('IST.323', '  two   lines\nbecome one  ');
    expect(spies.update).toHaveBeenCalledWith({ card_note: 'two lines become one' });
  });

  it('sends NULL for an emptied note rather than an empty string', async () => {
    await updateCardNote('IST.323', '   ');
    expect(spies.update).toHaveBeenCalledWith({ card_note: null });
  });

  it('refuses a note past the column cap instead of silently shortening it', async () => {
    await expect(updateCardNote('IST.323', 'x'.repeat(400))).rejects.toThrow(
      /limited to 280 characters/,
    );
    expect(spies.update).not.toHaveBeenCalled();
  });

  it('sends a note that is exactly as long as the column allows', async () => {
    const note = 'x'.repeat(CARD_NOTE_MAX_LENGTH);
    await expect(updateCardNote('IST.323', note)).resolves.toBe(note);
    expect(spies.update).toHaveBeenCalledWith({ card_note: note });
  });

  it('returns the value actually stored', async () => {
    await expect(updateCardNote('IST.323', ' kept ')).resolves.toBe('kept');
    await expect(updateCardNote('IST.323', null)).resolves.toBeNull();
  });

  it('refuses a write with no course id, and sends nothing', async () => {
    await expect(updateCardNote('', 'anything')).rejects.toThrow(/courseId is required/);
    expect(spies.from).not.toHaveBeenCalled();
  });

  it('throws the database error instead of reporting a silent success', async () => {
    spies.eq.mockImplementationOnce(async () => ({ error: { message: 'permission denied' } }));
    await expect(updateCardNote('IST.323', 'nope')).rejects.toMatchObject({
      message: 'permission denied',
    });
  });
});

describe('normalizeCardNote — one line of plain text', () => {
  it('flattens newlines, tabs and runs of spaces', () => {
    expect(normalizeCardNote('a\nb\tc   d')).toBe('a b c d');
  });

  it('trims, and treats whitespace-only as no note at all', () => {
    expect(normalizeCardNote('  padded  ')).toBe('padded');
    expect(normalizeCardNote('')).toBeNull();
    expect(normalizeCardNote('\n\t ')).toBeNull();
    expect(normalizeCardNote(null)).toBeNull();
    expect(normalizeCardNote(undefined)).toBeNull();
  });

  it('never shortens what it was handed', () => {
    // The cap belongs to validateCardNote. Slicing here used to rewrite a legal
    // 250-character stored note down to 200 on an edit-free blur.
    expect(normalizeCardNote('y'.repeat(500))).toHaveLength(500);
    expect(normalizeCardNote('y'.repeat(250))).toHaveLength(250);
  });
});

describe('validateCardNote — the column cap, mirrored honestly', () => {
  it('uses the same 280 the migration-028 check constraint enforces', () => {
    expect(CARD_NOTE_MAX_LENGTH).toBe(280);
  });

  it('passes anything up to the cap through unchanged', () => {
    const note = 'z'.repeat(CARD_NOTE_MAX_LENGTH);
    expect(validateCardNote(note)).toBe(note);
    expect(validateCardNote('  Ethics case group 3  ')).toBe('Ethics case group 3');
    expect(validateCardNote(null)).toBeNull();
  });

  it('refuses a longer one, and says how long it is', () => {
    expect(() => validateCardNote('z'.repeat(281))).toThrow(
      'The note is limited to 280 characters — this one is 281.',
    );
  });

  it('counts the note after normalizing, not before', () => {
    // 284 raw, 280 once the run of spaces collapses to one — legal.
    const padded = `${'z'.repeat(278)}     z`;
    expect(padded).toHaveLength(284);
    expect(validateCardNote(padded)).toHaveLength(280);
  });
});
