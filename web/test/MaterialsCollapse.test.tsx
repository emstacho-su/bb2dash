/**
 * M-1 on the screen — folding a Materials section away, and the reading blocks.
 *
 * The grouping and the storage rules have their own unit suite
 * (test/materials.grouping.test.ts). What is under test here is that the screen
 * wires them up: the bucket head is a real control with `aria-expanded`, its
 * rows go away, the choice survives a remount, and every section starts open.
 *
 * The three queries are stubbed; nothing here touches the network.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MATERIALS_COLLAPSE_KEY } from '@/lib/materials-collapse';

const courses = [
  {
    id: 'IST.466',
    subject: 'IST',
    number: '466',
    section: 'M003',
    title_short: 'Capstone',
    title_bb: 'Capstone',
    kind: 'lecture',
    location: null,
    bb_url: 'https://blackboard.syracuse.edu/course/IST466',
    term_id: 'FALL26',
  },
];

const files = [
  {
    id: 1,
    course_id: 'IST.466',
    file_name: 'Syllabus.docx',
    bucket: 'syllabus_policy',
    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: 2048,
    storage_path: 'IST.466/Syllabus.docx',
    source_url: null,
    local_path: null,
    reading_id: null,
    session_id: null,
    week_no: null,
    notes: null,
    path: 'IST.466/Syllabus.docx',
  },
];

/** Stack's case (dated by the 073 fix) plus two of the other groups' cases. */
const readings = [
  {
    id: 89,
    course_id: 'IST.466',
    citation: 'HBR: Apple vs. The FBI',
    topic: null,
    for_date: '2026-09-24',
    week_no: null,
    required: true,
    on_blackboard: true,
    url: null,
    notes: null,
    confidence: 'confirmed',
    source: 'syllabus',
  },
  {
    id: 87,
    course_id: 'IST.466',
    citation: 'HBR: An Intro to Money Laundering',
    topic: null,
    for_date: null,
    week_no: null,
    required: false,
    on_blackboard: true,
    url: null,
    notes: null,
    confidence: 'confirmed',
    source: 'syllabus',
  },
  {
    id: 200,
    course_id: 'IST.466',
    citation: 'Trevino & Nelson, Managing Business Ethics, 8e, ch. 3, pp. 55-70',
    topic: null,
    for_date: '2026-10-01',
    week_no: null,
    required: true,
    on_blackboard: false,
    url: null,
    notes: null,
    confidence: 'confirmed',
    source: 'syllabus',
  },
  {
    id: 88,
    course_id: 'IST.466',
    citation: 'HBR: Ethics Across Cultures',
    topic: null,
    for_date: null,
    week_no: null,
    required: false,
    on_blackboard: true,
    url: null,
    notes: null,
    confidence: 'confirmed',
    source: 'syllabus',
  },
];

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));
vi.mock('@/lib/queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return { ...actual, useCourses: () => ({ data: courses, isPending: false, error: null }) };
});
const syllabi = [
  { id: 'IST.466', kind: 'lecture', syllabus_path: 'IST.466/syllabus_policy/Syllabus.docx' },
];

vi.mock('@/lib/queries.materials', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.materials')>();
  return {
    ...actual,
    useCurrentFiles: () => ({ data: files, isPending: false, error: null }),
    useReadings: () => ({ data: readings, isPending: false, error: null }),
    useCourseSyllabi: () => ({ data: syllabi, isPending: false, error: null }),
  };
});

const { MaterialsBrowser } = await import('@/app/(app)/materials/MaterialsBrowser');

const readingsSection = () => screen.getByRole('button', { name: /Readings/ });
const syllabusSection = () => screen.getByRole('button', { name: /Syllabus & policy/ });

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('Materials — a section folds away (P-materials-1)', () => {
  it('opens with every section expanded', () => {
    render(<MaterialsBrowser />);
    expect(readingsSection()).toHaveAttribute('aria-expanded', 'true');
    expect(syllabusSection()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('HBR: Apple vs. The FBI')).toBeInTheDocument();
  });

  it('hides that section’s rows when it is folded', () => {
    render(<MaterialsBrowser />);
    fireEvent.click(readingsSection());

    expect(readingsSection()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('HBR: Apple vs. The FBI')).toBeNull();
    // …and leaves the head, with its count, so it can be opened again.
    expect(within(readingsSection()).getByText(String(readings.length))).toBeInTheDocument();
  });

  it('folds one section without touching the others', () => {
    render(<MaterialsBrowser />);
    fireEvent.click(readingsSection());
    expect(syllabusSection()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Syllabus.docx')).toBeInTheDocument();
  });

  it('unfolds again', () => {
    render(<MaterialsBrowser />);
    fireEvent.click(readingsSection());
    fireEvent.click(readingsSection());
    expect(readingsSection()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('HBR: Apple vs. The FBI')).toBeInTheDocument();
  });

  it('remembers the fold across a remount', () => {
    const first = render(<MaterialsBrowser />);
    fireEvent.click(readingsSection());
    expect(window.localStorage.getItem(MATERIALS_COLLAPSE_KEY)).toBe('["IST.466::readings"]');
    first.unmount();

    render(<MaterialsBrowser />);
    expect(readingsSection()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('HBR: Apple vs. The FBI')).toBeNull();
  });

  it('still renders when localStorage refuses to answer', () => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('The operation is insecure.');
    };
    expect(() => render(<MaterialsBrowser />)).not.toThrow();
    expect(readingsSection()).toHaveAttribute('aria-expanded', 'true');
    Storage.prototype.getItem = getItem;
  });
});

describe('Materials — readings blocked by date (P-materials-3)', () => {
  it('heads each block with the date it is assigned for', () => {
    render(<MaterialsBrowser />);
    expect(screen.getByText('Thu, Sep 24')).toBeInTheDocument();
  });

  it('gathers the undated cases under one Case pool header, last', () => {
    const { container } = render(<MaterialsBrowser />);
    expect(screen.getByText('Case pool')).toBeInTheDocument();

    const headings = Array.from(container.querySelectorAll('h4')).map(
      (h) => h.textContent ?? '',
    );
    expect(headings[0]).toContain('Thu, Sep 24');
    expect(headings.at(-1)).toContain('Case pool');
  });

  it('keeps every case on the screen — the pool is a grouping, not a filter', () => {
    render(<MaterialsBrowser />);
    for (const citation of readings.map((r) => r.citation)) {
      expect(screen.getByText(citation)).toBeInTheDocument();
    }
  });
});

/* ---------------------------------------------------------------------------
 * M-3 / P-materials-4 — "How to access" opens the course syllabus
 *
 * Rendered through the whole browser, because the syllabus is resolved once for
 * the screen (a recitation shell's answer is its lecture's) rather than per row.
 * The resolver itself is covered in test/materials.syllabus.test.ts.
 * ------------------------------------------------------------------------ */

describe('Materials — an off-platform reading points at the syllabus', () => {
  it('offers a live "How to access" control instead of a disabled one', () => {
    render(<MaterialsBrowser />);
    const control = screen.getByRole('button', { name: 'How to access' });
    expect(control).toBeEnabled();
  });

  it('names the syllabus it will open', () => {
    render(<MaterialsBrowser />);
    expect(screen.getByRole('button', { name: 'How to access' })).toHaveAttribute(
      'title',
      'Opens Syllabus.docx — the course syllabus says how to get this reading.',
    );
  });

  it('says the syllabus is where to look, rather than naming a library', () => {
    render(<MaterialsBrowser />);
    expect(screen.getAllByText(/The syllabus says how to get it\./).length).toBeGreaterThan(0);
  });

  it('still tags it Off-platform — the reading itself has not moved', () => {
    render(<MaterialsBrowser />);
    expect(screen.getByText('Off-platform')).toBeInTheDocument();
  });

  it('tags a Blackboard reading we have not pulled as exactly that', () => {
    render(<MaterialsBrowser />);
    expect(screen.getAllByText('On Blackboard — not pulled yet').length).toBeGreaterThan(0);
    // …and that row is not swept in with the textbook chapters.
    expect(screen.getAllByText('Off-platform')).toHaveLength(1);
  });
});
