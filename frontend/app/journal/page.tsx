import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { BLOG_POSTS } from '../components/home/blogData';

const SITE_URL = 'https://visquery.com';

export const metadata: Metadata = {
  title: 'Journal · Visquery',
  description:
    'Field notes on climate, materials, and the architectural components that decide how a building behaves, and how AI helps read them at the scale of a city.',
  alternates: { canonical: `${SITE_URL}/journal` },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/journal`,
    title: 'Journal · Visquery',
    description:
      'Field notes on climate, materials, and how AI helps retrofit the existing city for extreme heat.',
    siteName: 'Visquery',
  },
};

export default function JournalIndexPage() {
  return (
    <div className="app">
      <main className="blog-article blog-article-page">
        <div className="blog-article-bar">
          <Link className="blog-back-btn" href="/" aria-label="Back to Visquery">
            <ArrowLeft size={16} />
            <span>Visquery</span>
          </Link>
          <span className="blog-article-bar-meta">Visquery Journal</span>
        </div>

        <div className="blog-article-inner">
          <p className="blog-eyebrow">
            <span>Journal</span>
            <span className="blog-eyebrow-rail" aria-hidden="true" />
            <span>{BLOG_POSTS.length} {BLOG_POSTS.length === 1 ? 'entry' : 'entries'}</span>
          </p>
          <h1 className="blog-reader-title">Notes from the Built Environment</h1>
          <p className="blog-reader-subtitle">
            Field notes on climate, materials, and the components that decide how a
            building behaves, and how AI helps us read them at the scale of a city.
          </p>

          <ul className="journal-index">
            {BLOG_POSTS.map((post) => (
              <li key={post.id}>
                <Link className="journal-index-item" href={`/journal/${post.id}`}>
                  <p className="blog-feature-meta">
                    {post.eyebrow} · {post.date} · {post.readMins} min read
                  </p>
                  <h2 className="journal-index-title">{post.title}</h2>
                  <p className="journal-index-sub">{post.subtitle}</p>
                  <p className="journal-index-brief">{post.brief}</p>
                  <span className="blog-feature-cta">Read the full dispatch →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </div>
  );
}
