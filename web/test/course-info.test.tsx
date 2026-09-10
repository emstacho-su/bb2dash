/**
 * The Info tab's honesty rule: a field with nothing in it reads "not recorded",
 * never an empty cell. An empty cell is indistinguishable from a broken render,
 * and a staff block with a blank office hour is exactly the case Stack has.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeStaff } from './factories.course';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getSession: vi.fn() } }),
}));

const { StaffRow } = await import('@/app/(app)/course/[id]/info/CourseInfo');
const { orNotRecorded, NOT_RECORDED } = await import('@/lib/course-dimension');

describe('StaffRow — recorded fields', () => {
  it('shows every field the row actually carries', () => {
    render(<StaffRow person={makeStaff()} />);
    expect(screen.getByText('Prof. Example')).toBeInTheDocument();
    expect(screen.getByText('instructor')).toBeInTheDocument();
    expect(screen.getByText('example@syr.edu')).toBeInTheDocument();
    expect(screen.getByText('Hinds Hall 310')).toBeInTheDocument();
    expect(screen.getByText('Tue 2–4pm')).toBeInTheDocument();
    expect(screen.queryByText(NOT_RECORDED)).toBeNull();
  });
});

describe('StaffRow — missing fields', () => {
  it('says "not recorded" for a null office and null office hours', () => {
    render(<StaffRow person={makeStaff({ office: null, office_hours: null })} />);
    expect(screen.getAllByText(NOT_RECORDED)).toHaveLength(2);
    expect(screen.getByText('example@syr.edu')).toBeInTheDocument();
  });

  it('treats a blank string the same as a null — never an empty cell', () => {
    render(<StaffRow person={makeStaff({ email: '   ', office: '', office_hours: null })} />);
    expect(screen.getAllByText(NOT_RECORDED)).toHaveLength(3);
  });

  it('labels every field even when the whole row is empty', () => {
    render(
      <StaffRow
        person={makeStaff({ name: null as unknown as string, email: null, office: null, office_hours: null })}
      />,
    );
    for (const label of ['Role', 'Email', 'Office', 'Office hours']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getAllByText(NOT_RECORDED)).toHaveLength(4);
  });
});

describe('orNotRecorded', () => {
  it('passes real values through untouched and never returns a blank', () => {
    expect(orNotRecorded('Hinds Hall 310')).toBe('Hinds Hall 310');
    expect(orNotRecorded('')).toBe(NOT_RECORDED);
    expect(orNotRecorded('  ')).toBe(NOT_RECORDED);
    expect(orNotRecorded(null)).toBe(NOT_RECORDED);
    expect(orNotRecorded(undefined)).toBe(NOT_RECORDED);
  });
});
