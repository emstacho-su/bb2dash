import type { Metadata } from 'next';
import styles from '../login/Login.module.css';

export const metadata: Metadata = {
  title: 'Privacy · bb2dash',
};

/**
 * The privacy page Google's OAuth consent screen requires before an app can be
 * published (Phase 11, R-25). Public route (see proxy-session.ts). Plain facts
 * about a single-user app; nothing here is marketing.
 */
export default function PrivacyPage() {
  return (
    <main className={styles.screen}>
      <div className={styles.panel}>
        <div>
          <div className={styles.brand}>
            <span className={styles.mark} aria-hidden="true" />
            bb2dash
          </div>
          <p className={styles.lede}>Privacy</p>
        </div>
        <p className={styles.foot}>
          bb2dash is a personal, single-user academic hub run by its owner. It stores the owner&rsquo;s
          own course data in a private database and nothing about anyone else.
        </p>
        <p className={styles.foot}>
          Google Calendar access (scope <code>calendar.events</code>) is used for one thing: writing
          the owner&rsquo;s assignment due dates to a calendar named &ldquo;bb2dash&rdquo; in the
          owner&rsquo;s own Google account, and updating or removing those events when the dates change.
          Nothing is read back from Google Calendar, no other calendar is touched, and no Google data
          is shared with anyone or used for any other purpose. The OAuth token is stored encrypted on
          the server and can be revoked at any time from the Google account&rsquo;s security settings.
        </p>
        <p className={styles.foot}>Contact: the account owner.</p>
      </div>
    </main>
  );
}
