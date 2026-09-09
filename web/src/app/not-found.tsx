import Link from 'next/link';

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-8)',
        textAlign: 'center',
      }}
    >
      <div>
        <h1 style={{ marginBottom: 'var(--space-3)' }}>Not found</h1>
        <p style={{ color: 'var(--color-muted)' }}>That page does not exist.</p>
        <Link href="/">Back to Today</Link>
      </div>
    </main>
  );
}
