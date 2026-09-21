/**
 * The "This event / This and following events / All events" question (T-1).
 *
 * The answer decides how many rows a write touches, and every one of them
 * reaches Stack's real Google calendar, so the dialog has to be unambiguous
 * and hard to answer by accident: it opens on the narrowest choice, it never
 * reports a choice the reader did not confirm, and Escape backs out.
 *
 * It also opens *on top of* the planner-event form, which is a `PopoutShell`
 * listening for Escape on `window`. One Escape must close one dialog — the
 * last test here is what keeps that true.
 */

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PlannerSeriesScopeDialog } from '@/components/planner/PlannerSeriesScopeDialog';

function open(overrides: Partial<React.ComponentProps<typeof PlannerSeriesScopeDialog>> = {}) {
  const onChoose = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <PlannerSeriesScopeDialog
      intent="edit"
      title="Studio"
      onChoose={onChoose}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onChoose, onCancel, view, dialog: screen.getByRole('dialog') };
}

describe('the question', () => {
  it('is a modal dialog with a name, naming the event it is about', () => {
    const { dialog } = open();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Change repeating event');
    expect(within(dialog).getByText('Studio')).toBeInTheDocument();
  });

  it('offers the three scopes and starts on the narrowest', () => {
    const { dialog } = open();
    const radios = within(dialog).getAllByRole('radio');
    expect(radios.map((radio) => radio.getAttribute('value'))).toEqual([
      'this',
      'following',
      'all',
    ]);
    expect(within(dialog).getByLabelText('This event')).toBeChecked();
    expect(within(dialog).getByLabelText('All events')).not.toBeChecked();
  });

  it('reports nothing until the choice is confirmed', () => {
    const { onChoose, dialog } = open();
    fireEvent.click(within(dialog).getByLabelText('This and following events'));
    expect(onChoose).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('following');
  });

  it('sends the scope the reader picked, not the one they started on', () => {
    const { onChoose, dialog } = open();
    fireEvent.click(within(dialog).getByLabelText('All events'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(onChoose).toHaveBeenCalledExactlyOnceWith('all');
  });

  it('says what a delete will do, and calls its button Delete', () => {
    const { dialog } = open({ intent: 'delete' });
    expect(within(dialog).getByRole('heading')).toHaveTextContent('Delete repeating event');
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(within(dialog).getByText(/Google calendar/)).toBeInTheDocument();
  });

  it('disables both buttons while its write is in flight', () => {
    const { dialog } = open({ pending: true });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});

describe('backing out', () => {
  it('cancels on the Cancel button', () => {
    const { onCancel, onChoose, dialog } = open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('cancels on Escape', () => {
    const { onCancel, onChoose } = open();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('cancels on a click outside the panel', () => {
    const { onCancel, dialog } = open();
    const backdrop = dialog.parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('keeps a click inside the panel from dismissing it', () => {
    const { onCancel, dialog } = open();
    fireEvent.mouseDown(dialog);
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('focus', () => {
  it('moves onto the first choice when it opens', () => {
    const { dialog } = open();
    expect(document.activeElement).toBe(within(dialog).getByLabelText('This event'));
  });

  it('goes back to whatever opened it', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();

    const { view } = open();
    expect(document.activeElement).not.toBe(opener);
    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('wraps Tab round inside the panel', () => {
    const { dialog } = open();
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>('input, button:not([disabled])'),
    ];
    const last = focusable[focusable.length - 1];
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(focusable[0]);

    focusable[0].focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});

describe('the dialog underneath', () => {
  it('never sees the Escape that closed this one', () => {
    // PopoutShell listens on window in the bubble phase; this dialog catches
    // Escape in the capture phase and stops it. One Escape, one dialog.
    const shell = vi.fn();
    window.addEventListener('keydown', shell);
    try {
      const { onCancel } = open();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onCancel).toHaveBeenCalledOnce();
      expect(shell).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', shell);
    }
  });

  it('still lets other keys through', () => {
    const shell = vi.fn();
    window.addEventListener('keydown', shell);
    try {
      open();
      fireEvent.keyDown(document.body, { key: 'a' });
      expect(shell).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('keydown', shell);
    }
  });
});
