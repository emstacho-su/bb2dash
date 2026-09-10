'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { clearPersistedQueryCache } from '@/lib/query-provider';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import tokens from '@/styles/tokens.module.css';
import styles from './Login.module.css';

/**
 * Email + password sign-in. There is ONE user and NO signup path anywhere in
 * this app — no "create account", no magic link, no OAuth. Adding one would
 * contradict the security punch list; if a second user is ever needed, the
 * owner creates them in the Supabase dashboard.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const configured = isSupabaseConfigured();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setError(null);

    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setPending(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        // Supabase returns a deliberately vague message for bad credentials;
        // surface anything more specific (rate limit, unconfirmed email) as-is.
        setError(
          signInError.message === 'Invalid login credentials'
            ? 'That email and password did not match.'
            : signInError.message,
        );
        setPending(false);
        return;
      }

      // A fresh session should not inherit the previous one's cached rows.
      clearPersistedQueryCache();
      router.replace(nextPath && nextPath.startsWith('/') ? nextPath : '/');
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `Could not reach the server: ${caught.message}`
          : 'Could not reach the server.',
      );
      setPending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {!configured && (
        <p className={styles.error} role="alert">
          This deployment is missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.
          Sign-in will not work until they are set.
        </p>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={tokens.field}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          className={tokens.input}
          type="email"
          name="email"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={pending}
          required
        />
      </div>

      <div className={tokens.field}>
        <label htmlFor="password">Password</label>
        <input
          id="password"
          className={tokens.input}
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={pending}
          required
        />
      </div>

      <button type="submit" className={`${tokens.btnPrimary} ${styles.submit}`} disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
