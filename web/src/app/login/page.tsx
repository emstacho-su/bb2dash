import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from './LoginForm';
import styles from './Login.module.css';

export const metadata: Metadata = {
  title: 'Sign in · bb2dash',
};

/** Rendered per-request: the middleware bounces a signed-in visitor away. */
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className={styles.screen}>
      <div className={styles.panel}>
        <div>
          <div className={styles.brand}>
            <span className={styles.mark} aria-hidden="true" />
            bb2dash
          </div>
          <p className={styles.lede}>Sign in to continue.</p>
        </div>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>

        <p className={styles.foot}>
          Single-user hub — accounts are provisioned by the owner, so there is no sign-up.
        </p>
      </div>
    </main>
  );
}
