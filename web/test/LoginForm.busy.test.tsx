/**
 * Busy says busy on the sign-in form (Phase 22, task 37; H-5, named exception 14).
 *
 * The two fields and the submit button are disabled only while the sign-in request is in
 * flight, so each also carries `aria-busy`: a screen reader hears "busy", not "unavailable", and
 * the stylesheet can tell a busy field (half strength, `cursor: progress`) from a switched-off
 * one (a flat grey box). At rest none of them is busy.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const signIn = vi.hoisted(() => ({ resolve: (_value: unknown): void => undefined }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: () =>
        new Promise((resolve) => {
          signIn.resolve = resolve;
        }),
    },
  }),
}));
vi.mock('@/lib/supabase/env', () => ({ isSupabaseConfigured: () => true }));
vi.mock('@/lib/query-provider', () => ({ clearPersistedQueryCache: vi.fn() }));

const { LoginForm } = await import('@/app/login/LoginForm');

describe('LoginForm busy', () => {
  it('carries aria-busy="false" on the two fields and the button at rest', () => {
    render(<LoginForm />);
    for (const control of [screen.getByLabelText('Email'), screen.getByLabelText('Password'), screen.getByRole('button', { name: 'Sign in' })]) {
      expect(control).toHaveAttribute('aria-busy', 'false');
      expect(control).toBeEnabled();
    }
  });

  it('while the request is in flight the fields and the button are disabled and aria-busy together', async () => {
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'sample@example.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'sample password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const busyButton = await screen.findByRole('button', { name: 'Signing in…' });
    for (const control of [screen.getByLabelText('Email'), screen.getByLabelText('Password'), busyButton]) {
      expect(control).toBeDisabled();
      expect(control).toHaveAttribute('aria-busy', 'true');
    }
  });
});
