import type { Metadata } from 'next';
import './globals.css';
import CookieConsent from './components/CookieConsent';

const SITE_URL = 'https://visquery.com';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Visquery | Visual Query for Architecture Styles',
  applicationName: 'Visquery',
  description:
    'Search architectural precedents by building style, material, form, typology, and more. Powered by visual AI trained on architecture. Read the Visquery Journal on climate, passive cooling, and material-led retrofit.',
  alternates: { canonical: '/' },
  category: 'architecture',
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
    'passive cooling architecture',
    'heatwave building design',
    'cool roofs and facades',
    'building retrofit AI',
    'thermal mass shading materials',
  ],
  openGraph: {
    title: 'Visquery | Visual Query for Architecture Styles',
    description:
      'Visual AI for architectural precedent search — plus the Visquery Journal on the 2026 heat dome, passive cooling, and AI-led building retrofit.',
    type: 'website',
    siteName: 'Visquery',
    images: [{ url: '/blog/heat-dome-facade.png' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Visquery | Visual Query for Architecture Styles',
    description:
      'Search architectural precedents by style, material, form, and typology — visual AI trained on architecture.',
    images: ['/blog/heat-dome-facade.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [{ url: '/app-logo.png', sizes: '100x100', type: 'image/png' }],
    shortcut: [{ url: '/app-logo.png', sizes: '100x100', type: 'image/png' }],
    apple: [{ url: '/app-logo.png', sizes: '100x100', type: 'image/png' }],
  },
};

// Sitewide structured data. WebSite + SearchAction makes the site eligible for
// a Google sitelinks search box; Organization feeds the knowledge panel / logo.
const SITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: 'Visquery',
      description: 'Visual query for architecture styles and building precedents.',
      publisher: { '@id': `${SITE_URL}/#organization` },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/?view=results&q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'Visquery',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/app-logo.png` },
    },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSON_LD) }}
        />
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
