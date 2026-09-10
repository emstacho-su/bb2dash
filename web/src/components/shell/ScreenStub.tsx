import type { ReactNode } from 'react';
import tokens from '@/styles/tokens.module.css';
import styles from '@/app/(app)/Shell.module.css';

/**
 * A placeholder panel for a route that exists but whose screen belongs to
 * another worker. It states plainly what is missing rather than inventing
 * sample content — no fabricated numbers anywhere in this app.
 */
export function ScreenStub({
  title,
  owner,
  children,
}: {
  title: string;
  owner: string;
  children?: ReactNode;
}) {
  return (
    <section className={styles.stub}>
      <h2 className={styles.stubTitle}>{title}</h2>
      <p className={styles.stubBody}>{children}</p>
      <div className={styles.stubMeta}>
        <span className={tokens.tagOutline}>not built yet</span>
        <span className={tokens.tagNeutral}>{owner}</span>
      </div>
    </section>
  );
}
