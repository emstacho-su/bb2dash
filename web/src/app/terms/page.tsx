import type { Metadata } from 'next';
import styles from '../login/Login.module.css';

export const metadata: Metadata = {
  title: 'Terms · bb2dash',
};

/**
 * The terms-of-service page Google's OAuth consent screen requires alongside
 * /privacy before an app can be published (Phase 11, R-25). Public route (see
 * proxy-session.ts). Plain facts about a single-user app.
 */
export default function TermsPage() {
  return (
    <main className={styles.screen}>
      <div className={styles.panel}>
        <div>
          <div className={styles.brand}>
            <span className={styles.mark} aria-hidden="true" />
            bb2dash
          </div>
          <p className={styles.lede}>Terms of service</p>
        </div>
        <p className={styles.foot}>
          bb2dash is a personal tool operated by its single owner for the owner&rsquo;s own coursework.
          There is no sign-up and no service offered to anyone else; the only account is the
          owner&rsquo;s.
        </p>
        <p className={styles.foot}>
          The app is provided as-is, with no warranty and no guarantee of availability. Course facts
          shown in it are mirrored from Blackboard and the owner&rsquo;s own records; Blackboard remains
          the authoritative source for due dates and grades.
        </p>
        <p className={styles.foot}>
          Google Calendar access is governed by the privacy page and can be revoked at any time from the
          owner&rsquo;s Google account. Contact: the account owner.
        </p>
      </div>
    </main>
  );
}
