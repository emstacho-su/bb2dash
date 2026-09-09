import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { QueryProvider } from '@/lib/query-provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'bb2dash',
  description: 'Blackboard, reorganised around what is actually due.',
};

export const viewport: Viewport = {
  themeColor: '#161826',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
