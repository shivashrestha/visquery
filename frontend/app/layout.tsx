import type { Metadata } from 'next';
import './globals.css';
import CookieConsent from './components/CookieConsent';

export const metadata: Metadata = {
  title: 'Visquery | Visual Query for Architecture Styles',
  description:
    'Search architectural precedents by building style, material, form, typology, and more. Powered by visual AI trained on architecture.',
  keywords: [
    'architecture',
    'architectural style',
    'precedent search',
    'building reference',
    'typology',
    'visual search',
    'art deco',
    'bauhaus',
    'gothic architecture',
    'deconstructivism',
  ],
  icons: {
    icon: [{ url: '/app-logo.png', sizes: '100x100', type: 'image/png' }],
    shortcut: [{ url: '/app-logo.png', sizes: '100x100', type: 'image/png' }],
    apple: [{ url: '/app-logo.png', sizes: '100x100', type: 'image/png' }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Inter:wght@400;500;600&family=JetBrains+Mono:ital,wght@0,400;0,500;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="antialiased"
        style={{ background: 'var(--bg)', color: 'var(--ink)' }}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded text-sm"
          style={{ background: 'var(--ink)', color: 'var(--paper)' }}
        >
          Skip to main content
        </a>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
