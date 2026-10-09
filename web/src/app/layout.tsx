import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { GOOGLE_FONTS_HREF, GOOGLE_FONTS_ORIGINS } from '@/lib/fonts-href';
import { QueryProvider } from '@/lib/query-provider';
import { THEME_BOOT_SCRIPT, THEME_COLOR } from '@/lib/theme-preference';
import './globals.css';

export const metadata: Metadata = {
  title: 'bb2dash',
  description: 'Blackboard, reorganised around what is actually due.',
};

export const viewport: Viewport = {
  // One value, the dark ground: a first visit is dark, also under a light system.
  // The boot script and ThemeMenu re-colour the meta when a theme is stamped.
  themeColor: THEME_COLOR,
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // `data-theme` is stamped by THEME_BOOT_SCRIPT before React hydrates, and
    // React never renders it, so the attribute is the one thing the server HTML
    // and the client are allowed to disagree on.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* The fonts are also an @import in globals.css, which the build drops (lib/fonts-href.ts). */}
        {GOOGLE_FONTS_ORIGINS.map((origin) => (
          <link key={origin} rel="preconnect" href={origin} crossOrigin="" />
        ))}
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
