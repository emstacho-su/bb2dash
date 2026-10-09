/**
 * `useExit` (Phase 22, task 29; D-3): a panel that closes stays for one exit, carries
 * `data-leaving`, and is then removed. The time is read from the panel's own computed
 * `--motion-exit` and never written in script; where it reads 0 or cannot be read (jsdom loads no
 * stylesheet, and reduced motion redeclares it `0ms`) the panel is removed in the render that closes it.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { EXIT_TOKEN, EXIT_TOKEN_LG, readExitMs, useExit } from '@/components/shell/useExit';
import { PopoutShell } from '@/components/popout/PopoutShell';

function Harness({ token }: { token?: string }) {
  const [open, setOpen] = useState(false);
  const [exit, exitRef] = useExit(open, token);
  return (
    <div>
      <button type="button" onClick={() => setOpen((value) => !value)}>
        toggle
      </button>
      {exit.present && (
        <div ref={exitRef} data-testid="panel" data-leaving={exit.leaving ? '' : undefined}>
          panel
        </div>
      )}
    </div>
  );
}

/** Makes the computed style of every element report the given custom-property values. */
function stubExitTimes(values: Record<string, string>) {
  return vi.spyOn(window, 'getComputedStyle').mockImplementation(
    () => ({ getPropertyValue: (name: string) => values[name] ?? '' }) as unknown as CSSStyleDeclaration,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('readExitMs', () => {
  it('reads milliseconds and seconds, and 0 for anything it cannot read', () => {
    const node = document.createElement('div');
    for (const [value, expected] of [
      ['120ms', 120],
      [' 160ms ', 160],
      ['0.12s', 120],
      ['0ms', 0],
      ['', 0],
      ['soon', 0],
    ] as const) {
      stubExitTimes({ [EXIT_TOKEN]: value });
      expect(readExitMs(node, EXIT_TOKEN), value).toBe(expected);
      vi.restoreAllMocks();
    }
    expect(readExitMs(null, EXIT_TOKEN)).toBe(0);
  });
});

describe('useExit', () => {
  it('removes the panel in the same render as it closes when no exit time can be read', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('panel')).toBeInTheDocument();

    fireEvent.click(screen.getByText('toggle'));

    expect(screen.queryByTestId('panel')).toBeNull();
  });

  it('keeps the panel for the exit time, marked data-leaving, and then removes it', () => {
    stubExitTimes({ [EXIT_TOKEN]: '120ms' });
    render(<Harness />);
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('panel')).not.toHaveAttribute('data-leaving');

    fireEvent.click(screen.getByText('toggle'));

    expect(screen.getByTestId('panel')).toHaveAttribute('data-leaving');
    act(() => {
      vi.advanceTimersByTime(119);
    });
    expect(screen.getByTestId('panel')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId('panel')).toBeNull();
  });

  it('reads the token it is given (the popout leaves over --motion-exit-lg)', () => {
    stubExitTimes({ [EXIT_TOKEN]: '120ms', [EXIT_TOKEN_LG]: '160ms' });
    render(<Harness token={EXIT_TOKEN_LG} />);
    fireEvent.click(screen.getByText('toggle'));
    fireEvent.click(screen.getByText('toggle'));

    act(() => {
      vi.advanceTimersByTime(159);
    });
    expect(screen.getByTestId('panel')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId('panel')).toBeNull();
  });

  it('is open and not leaving when it is reopened inside the exit, and the old timer does not close it', () => {
    stubExitTimes({ [EXIT_TOKEN]: '120ms' });
    render(<Harness />);
    fireEvent.click(screen.getByText('toggle'));
    fireEvent.click(screen.getByText('toggle'));
    act(() => {
      vi.advanceTimersByTime(60);
    });

    fireEvent.click(screen.getByText('toggle'));

    expect(screen.getByTestId('panel')).not.toHaveAttribute('data-leaving');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('panel')).toBeInTheDocument();
  });

  it('leaves no timer behind when it is unmounted inside the exit', () => {
    stubExitTimes({ [EXIT_TOKEN]: '120ms' });
    const view = render(<Harness />);
    fireEvent.click(screen.getByText('toggle'));
    fireEvent.click(screen.getByText('toggle'));
    expect(vi.getTimerCount()).toBe(1);

    view.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('PopoutShell never waits before it calls onClose', () => {
  it('calls onClose in the same tick, with an exit time of 120 as well', () => {
    stubExitTimes({ [EXIT_TOKEN]: '120ms', [EXIT_TOKEN_LG]: '120ms' });
    const onClose = vi.fn();
    render(
      <PopoutShell label="Test popout" onClose={onClose}>
        body
      </PopoutShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('is marked data-leaving, and does not take presses, while its host keeps it for the exit', () => {
    render(
      <PopoutShell label="Test popout" onClose={() => undefined} leaving>
        body
      </PopoutShell>,
    );

    expect(screen.getByRole('dialog', { hidden: true })).toHaveAttribute('data-leaving');
  });
});
