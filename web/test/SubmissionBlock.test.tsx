/**
 * The popout's submission block: what Blackboard recorded, what actually went
 * in, and what is only staged here.
 *
 * Three things are load-bearing. The pill is Blackboard's status, glossed but
 * never reinterpreted (a SUBMITTED row whose last attempt is NEEDS_GRADING
 * still reads "submitted"). The sha chip has to reach all three of its branches,
 * because the whole point of staging a file is to be able to prove the copy on
 * file is the copy that went in. And no score and no receipt number may appear
 * here at all (Stack's answers 1 and 6).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeAssignmentGrade,
  makeAttempt,
  makeStagedFile,
  makeSubmissionFile,
} from './factories.grades';
import { QUIZ_HISTORY } from './factories.grade-model';

interface Stub<T> {
  data: T;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
}

function stub<T>(data: T, over: Partial<Stub<T>> = {}): Stub<T> {
  return { data, isPending: false, isFetching: false, isError: false, error: null, ...over };
}

const hooks = vi.hoisted(() => ({
  grade: null as unknown,
  attempts: null as unknown,
  files: null as unknown,
  history: null as unknown,
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn(), auth: { getSession: vi.fn() } }),
}));
vi.mock('@/lib/queries.grades', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.grades')>();
  return {
    ...actual,
    useAssignmentGrade: () => hooks.grade,
    useAssignmentAttempts: () => hooks.attempts,
    useSubmissionFiles: () => hooks.files,
    useAssignmentHistory: () => hooks.history,
  };
});
vi.mock('@/lib/queries.submissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.submissions')>();
  return {
    ...actual,
    useStageUpload: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  };
});

const { SubmissionBlock } = await import('@/components/popout/SubmissionBlock');

const BB_URL = 'https://blackboard.syracuse.edu/course/IST323';

function renderBlock() {
  return render(
    <SubmissionBlock assignmentId="IST.323/lab-1" courseId="IST.323" blackboardUrl={BB_URL} />,
  );
}

beforeEach(() => {
  hooks.grade = stub(
    makeAssignmentGrade({
      submission_status: 'SUBMITTED',
      last_attempt_status: 'NEEDS_GRADING',
      last_attempt_submitted: '2026-09-12T03:41:00.000Z',
      effective_score: null,
      multiple_attempts: 3,
    }),
  );
  hooks.attempts = stub([makeAttempt()]);
  hooks.files = stub([makeSubmissionFile()]);
  hooks.history = stub([]);
});

/*
 * G-5 / P-grades-8, P-grades-9: the instructor's words and the score history
 * moved off the gradebook row and into this block.
 */
describe('SubmissionBlock — feedback and history (G-5)', () => {
  it("shows the instructor's feedback in full, as text", () => {
    hooks.grade = stub(
      makeAssignmentGrade({
        feedback: '<b>Nice work</b> & <script>alert(1)</script>\nSee line 4.',
      }),
    );
    const { container } = renderBlock();

    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(
      screen.getByText(/<b>Nice work<\/b> & <script>alert\(1\)<\/script>/),
    ).toBeInTheDocument();
  });

  it('says nothing about feedback when Blackboard recorded none', () => {
    hooks.grade = stub(makeAssignmentGrade({ feedback: null }));
    renderBlock();
    expect(screen.queryByText('Feedback')).toBeNull();
  });

  it('carries the score history for this column', () => {
    hooks.history = stub(QUIZ_HISTORY);
    renderBlock();
    const toggle = screen.getByRole('button', { name: /history/ });

    fireEvent.click(toggle);
    expect(screen.getByText('— → 9 → 9.5 · seen 10 Sep, 14 Sep, 16 Sep')).toBeInTheDocument();
  });

  it('shows no history for a column seen only once', () => {
    hooks.history = stub([QUIZ_HISTORY[0]]);
    renderBlock();
    expect(screen.queryByRole('button', { name: /history/ })).toBeNull();
  });

  it('says so when the history read failed, rather than pretending there is none', () => {
    hooks.history = stub(undefined, { isError: true, error: new Error('permission denied') });
    renderBlock();
    expect(screen.getByRole('alert').textContent).toContain('permission denied');
  });
});

describe('SubmissionBlock — the status line', () => {
  it("shows Blackboard's status, the submitted time and which attempt this is", () => {
    renderBlock();
    expect(screen.getByText('submitted')).toBeInTheDocument();
    expect(screen.getByText('last attempt: NEEDS_GRADING')).toBeInTheDocument();
    expect(screen.getAllByText('submitted Sep 11, 11:41 PM').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Attempt 1 of 3').length).toBeGreaterThan(0);
  });

  /* G-4 / P-grades-6: the popout's status line carries the same rule. */
  it.each(['GRADED', 'SUBMITTED'])(
    'does not repeat a COMPLETED attempt beside a %s status',
    (status) => {
      hooks.grade = stub(
        makeAssignmentGrade({ submission_status: status, last_attempt_status: 'COMPLETED' }),
      );
      renderBlock();
      expect(screen.queryByText(/last attempt/)).toBeNull();
    },
  );

  it('shows no score anywhere — the popout is about the work, not the mark', () => {
    hooks.grade = stub(
      makeAssignmentGrade({
        submission_status: 'GRADED',
        effective_score: 10,
        possible: 10,
        points_possible: 10,
      }),
    );
    const { container } = renderBlock();
    expect(container.textContent).not.toContain('10 / 10');
    expect(screen.getByText('graded')).toBeInTheDocument();
  });

  it('never renders the confirmation number, though the row carries one', () => {
    const { container } = renderBlock();
    expect(container.textContent).not.toContain('CONF-4471829');
  });

  it('says nothing about a submission when no column is linked', () => {
    hooks.grade = stub(null);
    hooks.attempts = stub([]);
    renderBlock();
    expect(screen.getByText(/No gradebook column is linked/)).toBeInTheDocument();
  });

  it('does not claim a status while the query is in flight', () => {
    hooks.grade = stub(undefined, { isPending: true, isFetching: true });
    renderBlock();
    expect(screen.getByText('loading…')).toBeInTheDocument();
    expect(screen.queryByText(/No gradebook column is linked/)).toBeNull();
  });
});

describe('SubmissionBlock — attempts', () => {
  it('lists each attempt with its status and when it was submitted', () => {
    hooks.attempts = stub([
      makeAttempt({ attempt_id: '_9001_1', attempt_no: 1, status: 'COMPLETED' }),
      makeAttempt({
        attempt_id: '_9002_1',
        attempt_no: 2,
        status: 'NEEDS_GRADING',
        submitted_bb: null,
      }),
    ]);
    renderBlock();

    expect(screen.getByText('Attempt 1 of 3')).toBeInTheDocument();
    expect(screen.getAllByText('Attempt 2 of 3').length).toBeGreaterThan(0);
    expect(screen.getByText('COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('not submitted')).toBeInTheDocument();
  });

  it('says "unlimited" rather than inventing a ceiling', () => {
    hooks.attempts = stub([makeAttempt({ attempts_allowed: -1 })]);
    renderBlock();
    expect(screen.getAllByText('Attempt 1 (unlimited)').length).toBeGreaterThan(0);
  });
});

describe('SubmissionBlock — files and the sha chip', () => {
  it('labels the copy pulled back out of Blackboard', () => {
    renderBlock();
    expect(screen.getByText('lab1.pdf')).toBeInTheDocument();
    expect(screen.getByText('submitted copy')).toBeInTheDocument();
    expect(screen.getByText(/sha aaaaaaaa/)).toBeInTheDocument();
  });

  it('says a staged file differs from the copy Blackboard holds', () => {
    hooks.files = stub([makeSubmissionFile(), makeStagedFile()]);
    renderBlock();
    expect(screen.getByText('differs from the submitted copy')).toBeInTheDocument();
  });

  it('keeps a staged file listed with a "matches" chip when the bytes are identical', () => {
    hooks.files = stub([makeSubmissionFile(), makeStagedFile({ sha256: 'a'.repeat(64) })]);
    renderBlock();
    expect(screen.getByText('lab1-final.pdf')).toBeInTheDocument();
    expect(screen.getByText('matches the submitted copy')).toBeInTheDocument();
  });

  it('claims nothing when nothing has been pulled back to compare against', () => {
    hooks.files = stub([makeStagedFile()]);
    renderBlock();
    expect(screen.getByText('no submitted copy yet')).toBeInTheDocument();
    expect(screen.queryByText('differs from the submitted copy')).toBeNull();
  });

  it('points a staged file at Blackboard — the only place it can be attached', () => {
    hooks.files = stub([makeStagedFile()]);
    renderBlock();
    const link = screen.getByRole('link', {
      name: 'Staged in bb2dash — attach in Blackboard ↗',
    });
    expect(link).toHaveAttribute('href', BB_URL);
  });

  it('still says what the file is when the course has no Blackboard link', () => {
    hooks.files = stub([makeStagedFile()]);
    render(
      <SubmissionBlock assignmentId="IST.323/lab-1" courseId="IST.323" blackboardUrl={null} />,
    );
    expect(screen.getByText('Staged in bb2dash — attach in Blackboard ↗')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Staged in bb2dash/ })).toBeNull();
  });

  it('says so rather than showing an empty file list', () => {
    hooks.files = stub([]);
    renderBlock();
    expect(screen.getByText(/No submission files have been recorded/)).toBeInTheDocument();
  });
});

describe('SubmissionBlock — no control says "Submit"', () => {
  it('offers staging, never submitting', () => {
    hooks.files = stub([makeSubmissionFile(), makeStagedFile()]);
    const { container } = renderBlock();
    for (const control of container.querySelectorAll('button, a, label')) {
      expect(control.textContent ?? '').not.toMatch(/\bSubmit\b/);
    }
    expect(screen.getByLabelText('Stage a file')).toBeInTheDocument();
  });
});
