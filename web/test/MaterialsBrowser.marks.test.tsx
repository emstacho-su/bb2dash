/**
 * Phase 22, round 2 (R2-6): a reading's route link draws its arrow as the mark.
 *
 * The action strings come from `lib/queries.materials.ts` with a typed arrow
 * ('Open ↗', 'In Blackboard ↗') and do not change. The link renders them through
 * `MarkedLabel`: its text content is the label unchanged, and the arrow is a
 * drawn, `aria-hidden` SVG beside the clipped character.
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
    location: null,
    bb_url: 'https://blackboard.syracuse.edu/course/IST323',
    term_id: 'FALL26',
  },
];

const reading = (id: number, over: Record<string, unknown>) => ({
  id,
  course_id: 'IST.323',
  citation: `Reading ${id}`,
  topic: null,
  for_date: '2026-09-24',
  week_no: null,
  required: true,
  on_blackboard: false,
  url: null,
  notes: null,
  confidence: 'confirmed',
  source: 'syllabus',
  ...over,
});

const readings = [
  reading(1, { url: 'https://example.org/paper' }),
  reading(2, { on_blackboard: true }),
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
    useCurrentFiles: () => ({ data: [], isPending: false, error: null }),
    useReadings: () => ({ data: readings, isPending: false, error: null }),
    useCourseSyllabi: () => ({ data: [], isPending: false, error: null }),
  };
});

const { MaterialsBrowser } = await import('@/app/(app)/materials/MaterialsBrowser');

describe('MaterialsBrowser — the reading route links (R2-6)', () => {
  it.each(['Open ↗', 'In Blackboard ↗'])('draws the arrow of "%s" as a mark and keeps the label', (label) => {
    render(<MaterialsBrowser />);
    const link = screen.getByRole('link', { name: label });
    expect(link.textContent).toBe(label);
    expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});
