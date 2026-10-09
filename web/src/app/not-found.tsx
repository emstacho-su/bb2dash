import Link from 'next/link';
import styles from './NotFound.module.css';

export default function NotFound() {
  return (
    <main className={styles.screen}>
      <div>
        <h1 className={styles.title}>Not found</h1>
        <p className={styles.lede}>That page does not exist.</p>
        <Link href="/">Back to Today</Link>
      </div>
    </main>
  );
}
