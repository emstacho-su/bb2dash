/**
 * The drop zone: what it hands the query layer, and what it does when something
 * goes wrong.
 *
 * The row the mutation actually writes is asserted in `queries.grades.test.ts`
 * against a recording client; here the mutation is a spy, so these tests are
 * about the control — that it sends exactly what it was given, that a failure
 * is announced rather than swallowed, and that nothing on it invites Stack to
 * believe bb2dash submitted anything.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mutate = vi.fn();
const state = vi.hoisted(() => ({ isPending: false }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ from: vi.fn(), auth: { getSession: vi.fn() } }),
}));
vi.mock('@/lib/queries.submissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queries.submissions')>();
  return {
    ...actual,
    useStageUpload: () => ({ mutate, isPending: state.isPending, isError: false, error: null }),
  };
});

const { UploadDropZone } = await import('@/components/grades/UploadDropZone');

function file(name = 'lab1.pdf', type = 'application/pdf'): File {
  return new File(['x'], name, { type });
}

function renderZone(over: { compact?: boolean; assignmentId?: string | null } = {}) {
  return render(
    <UploadDropZone
      courseId="IST.323"
      assignmentId={over.assignmentId === undefined ? 'IST.323/lab-1' : over.assignmentId}
      compact={over.compact}
    />,
  );
}

function input(): HTMLInputElement {
  return screen.getByLabelText('Stage a file') as HTMLInputElement;
}

beforeEach(() => {
  mutate.mockReset();
  mutate.mockImplementation((_vars, options) => options?.onSuccess?.({ fileName: 'lab1.pdf' }));
  state.isPending = false;
});

describe('UploadDropZone — what it sends', () => {
  it('hands the course, the assignment and the chosen file to the query layer', () => {
    renderZone();
    const chosen = file();
    fireEvent.change(input(), { target: { files: [chosen] } });

    expect(mutate.mock.calls[0][0]).toEqual({
      courseId: 'IST.323',
      assignmentId: 'IST.323/lab-1',
      files: [chosen],
    });
  });

  it('sends a dropped file the same way it sends a chosen one', () => {
    const { container } = renderZone();
    const zone = container.firstElementChild as HTMLElement;
    const dropped = file('essay.docx');

    fireEvent.drop(zone, { dataTransfer: { files: [dropped] } });
    expect(mutate.mock.calls[0][0].files).toEqual([dropped]);
  });

  it('confirms what was staged and where to find it', () => {
    renderZone();
    fireEvent.change(input(), { target: { files: [file()] } });
    expect(screen.getByRole('status').textContent).toContain('lab1.pdf');
    expect(screen.getByRole('status').textContent).toContain('Materials');
  });

  it('files against the course alone when the node has no assignment', () => {
    renderZone({ assignmentId: null });
    fireEvent.change(input(), { target: { files: [file()] } });
    expect(mutate.mock.calls[0][0].assignmentId).toBeNull();
  });
});

describe('UploadDropZone — failures are announced, never swallowed', () => {
  it('shows the validation message the query layer threw', () => {
    mutate.mockImplementation((_vars, options) =>
      options?.onError?.(new Error('One file at a time, please — nothing was staged.')),
    );
    renderZone();
    fireEvent.change(input(), { target: { files: [file(), file('b.pdf')] } });

    expect(screen.getByRole('alert').textContent).toContain('One file at a time');
  });

  it('shows what Storage or Postgres said, verbatim', () => {
    mutate.mockImplementation((_vars, options) =>
      options?.onError?.({ message: 'new row violates row-level security policy' }),
    );
    renderZone();
    fireEvent.change(input(), { target: { files: [file()] } });

    expect(screen.getByRole('alert').textContent).toContain('row-level security');
  });

  it('never renders "undefined" for a failure with no message', () => {
    mutate.mockImplementation((_vars, options) => options?.onError?.({}));
    renderZone();
    fireEvent.change(input(), { target: { files: [file()] } });
    expect(screen.getByRole('alert').textContent).toBe('The file was not staged.');
  });

  it('says nothing when the last staging worked', () => {
    renderZone();
    fireEvent.change(input(), { target: { files: [file()] } });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('UploadDropZone — what it says', () => {
  it('names the limit and where the file goes, without promising a submission', () => {
    renderZone();
    expect(screen.getByText(/Drop one file here \(up to 50 MB\)/)).toBeInTheDocument();
    expect(screen.getByText(/you still attach it in Blackboard/)).toBeInTheDocument();
  });

  it('no control reads "Submit"', () => {
    const { container } = renderZone();
    for (const control of container.querySelectorAll('button, a, label')) {
      expect(control.textContent ?? '').not.toMatch(/\bSubmit\b/);
    }
  });

  it('is disabled and says so while a file is going up', () => {
    state.isPending = true;
    renderZone();
    expect(screen.getByText('Staging…')).toBeInTheDocument();
    expect(screen.getByLabelText('Staging…')).toBeDisabled();
  });

  it('drops the prose in the compact form, but keeps the control', () => {
    renderZone({ compact: true });
    expect(screen.queryByText(/Drop one file here/)).toBeNull();
    expect(input()).toBeInTheDocument();
  });
});

describe('UploadDropZone — two zones for the same assignment', () => {
  /**
   * The Classwork row and the popout can both be on screen for one assignment.
   * The input id used to be derived from the assignment id, so the two shared
   * it and the second label opened the first zone's file picker.
   */
  function renderPair() {
    return render(
      <>
        <UploadDropZone courseId="IST.323" assignmentId="IST.323/lab-1" compact />
        <UploadDropZone courseId="IST.323" assignmentId="IST.323/lab-1" />
      </>,
    );
  }

  it('gives each input its own id', () => {
    renderPair();
    const inputs = screen.getAllByLabelText('Stage a file') as HTMLInputElement[];
    expect(inputs).toHaveLength(2);
    expect(inputs[0].id).not.toBe(inputs[1].id);
    expect(inputs[0].id).toBeTruthy();
  });

  it('points each label at its own input', () => {
    const { container } = renderPair();
    const labels = [...container.querySelectorAll('label')];
    const inputs = [...container.querySelectorAll('input')];
    expect(labels.map((l) => l.getAttribute('for'))).toEqual(inputs.map((i) => i.id));
  });

  it('sends only the zone that was used', () => {
    renderPair();
    const inputs = screen.getAllByLabelText('Stage a file') as HTMLInputElement[];
    fireEvent.change(inputs[1], { target: { files: [file()] } });
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
