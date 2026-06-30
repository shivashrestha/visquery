import type { Metadata } from 'next';
import BrowseShell from '../components/BrowseShell';

const SITE_URL = 'https://visquery.com';

export const metadata: Metadata = {
  title: 'Architecture Style Collections — Curated Precedents · Visquery',
  description:
    'Explore curated collections of architectural precedents grouped by style — Modernism, Neoclassical, Baroque, Brutalism, Art Deco, Gothic Revival, Deconstructivism and more — plus the buildings you save.',
  keywords: [
    'architecture collections',
    'architecture styles',
    'modernism collection',
    'brutalism examples',
    'art deco buildings',
    'gothic revival',
    'neoclassical architecture',
    'curated building precedents',
  ],
  alternates: { canonical: `${SITE_URL}/collections` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/collections`,
    title: 'Architecture Style Collections · Visquery',
    description:
      'Curated collections of architectural precedents grouped by style — Modernism, Brutalism, Art Deco, Gothic and more.',
    siteName: 'Visquery',
    images: [{ url: '/blog/heat-dome-facade.png' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Architecture Style Collections · Visquery',
    description: 'Curated architectural precedents grouped by style.',
    images: ['/blog/heat-dome-facade.png'],
  },
};

const STYLE_NAMES = [
  'Modernism', 'Neoclassical', 'Baroque', 'Islamic Architecture', 'Neo-Gothic',
  'Beaux-Arts', 'Contemporary', 'Art Deco', 'Brutalism', 'Art Nouveau',
  'Deconstructivism', 'Byzantine', 'Greek Revival', 'International Style',
  'Postmodern', 'Romanesque',
];

export default function CollectionsPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Architecture Style Collections',
    description:
      'Curated collections of architectural precedents grouped by style.',
    url: `${SITE_URL}/collections`,
    isPartOf: { '@type': 'WebSite', name: 'Visquery', url: SITE_URL },
    hasPart: STYLE_NAMES.map((name) => ({ '@type': 'CreativeWorkSeries', name })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <h1 className="sr-only">Architecture Style Collections — Curated Precedents</h1>
      <BrowseShell view="collections" />
    </>
  );
}
