import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Visquery — Architectural Precedent Search',
  description:
    'Search architectural precedents by description, image, typology, material, and more.',
  keywords: [
    'architecture',
    'precedent search',
    'building reference',
    'typology',
    'visual search',
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="bg-near-white text-near-black antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded text-sm"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
