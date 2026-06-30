import type { Metadata } from 'next';
import BrowseShell from '../components/BrowseShell';

const SITE_URL = 'https://visquery.com';

export const metadata: Metadata = {
  title: 'Architecture Library — Browse Building Precedents · Visquery',
  description:
    'Browse the full Visquery library of architectural precedents. Filter thousands of buildings by style, material, typology, structural system, climate, and period — Modernism, Brutalism, Art Deco, Gothic, Neoclassical and more.',
  keywords: [
    'architecture library',
    'building precedents',
    'architectural reference',
    'browse architecture styles',
    'building typology',
    'architecture by material',
    'modernism brutalism art deco gothic',
  ],
  alternates: { canonical: `${SITE_URL}/library` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/library`,
    title: 'Architecture Library — Browse Building Precedents · Visquery',
    description:
      'Filter thousands of architectural precedents by style, material, typology, structure, climate, and period.',
    siteName: 'Visquery',
    images: [{ url: '/blog/heat-dome-facade.png' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Architecture Library · Visquery',
    description: 'Browse and filter architectural precedents by style, material, typology and period.',
    images: ['/blog/heat-dome-facade.png'],
  },
};

export default function LibraryPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Architecture Library',
    description:
      'Browse and filter architectural precedents by style, material, typology, structural system, climate, and period.',
    url: `${SITE_URL}/library`,
    isPartOf: { '@type': 'WebSite', name: 'Visquery', url: SITE_URL },
    about: { '@type': 'Thing', name: 'Architecture' },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Server-rendered landmarks for crawlers; the interactive grid hydrates below. */}
      <h1 className="sr-only">Architecture Library — Browse Building Precedents</h1>
      <BrowseShell view="library" />
    </>
  );
}
