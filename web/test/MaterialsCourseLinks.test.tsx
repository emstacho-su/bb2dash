/**
 * The Materials per-course header (R-06): the link across to the course's own
 * Classwork tab, where the same files sit in Blackboard's folder tree.
 *
 * The whole browser is rendered with its three queries stubbed, because the
 * header is built inside `MaterialsBrowser` rather than exported on its own.
 * Nothing here touches the network.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const courses = [
  {
    id: 'IST.323',
    subject: 'IST',
    number: '323',
    section: 'M002',
    title_short: 'Intro to Cybersecurity',
    title_bb: 'Intro to Cybersecurity',
    kind: 'lecture',
    location: 'Hinds Hall 010',
    bb_url: 'https://blackboard.syracuse.edu/course/IST323',
    term_id: 'FALL26',
  },
  {
    id: 'GEO.103',
    subject: 'GEO',
    number: '103',
    section: 'M001',
    title_short: 'Environment & Society',
    title_bb: 'Environment & Society',
    kind: 'lecture',
    location: null,
    // No Blackboard URL on file — the Classwork link must still be there.
    bb_url: null,
    term_id: 'FALL26',
  },
];

const files = [
  {
    id: 1,
    course_id: 'IST.323',
    file_name: 'Lecture3.pptx',
    bucket: 'lecture_slides',
    mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    bytes: 1024,
    storage_path: 'IST.323/Lecture3.pptx',
    source_url: null,
    local_path: null,
    reading_id: null,
    session_id: null,
    week_no: 3,
    notes: null,
    path: 'IST.323/Lecture3.pptx',
  },
  {
    id: 2,
    course_id: 'GEO.103',
    file_name: 'Syllabus.pdf',
    bucket: 'syllabus_policy',
    mime_type: 'application/pdf',
    bytes: 2048,
    storage_path: 'GEO.103/Syllabus.pdf',
    source_url: null,
    local_path: null,
    reading_id: null,
    session_id: null,
    week_no: null,
    notes: null,
    path: 'GEO.103/Syllabus.pdf',
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
vi.mock('@/lib/queries.materials', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.materials')>();
  return {
    ...actual,
    useCurrentFiles: () => ({ data: files, isPending: false, error: null }),
    useReadings: () => ({ data: [], isPending: false, error: null }),
  };
});

const { MaterialsBrowser } = await import('@/app/(app)/materials/MaterialsBrowser');

describe('MaterialsBrowser — per-course Classwork link', () => {
  it('gives every course a link to its own Classwork tab', () => {
    render(<MaterialsBrowser />);
    const links = screen.getAllByRole('link', { name: 'Open in Classwork →' });
    expect(links).toHaveLength(2);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/course/IST.323/classwork',
      '/course/GEO.103/classwork',
    ]);
  });

  it('shows the Classwork link even where no Blackboard URL is recorded', () => {
    render(<MaterialsBrowser />);
    expect(screen.getAllByRole('link', { name: 'Blackboard ↗' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Open in Classwork →' })).toHaveLength(2);
  });
});
