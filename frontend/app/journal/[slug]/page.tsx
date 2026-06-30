import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { BLOG_POSTS, getPostBySlug } from '../../components/home/blogData';
import { BlogArticleBody } from '../../components/home/BlogSection';

const SITE_URL = 'https://visquery.com';

// Pre-render every post at build time → static, instantly crawlable HTML.
export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.id }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = getPostBySlug(params.slug);
  if (!post) return { title: 'Journal · Visquery' };

  const url = `${SITE_URL}/journal/${post.id}`;
  const description = post.brief;
  const image = `${SITE_URL}${post.hero.src}`;

  return {
    title: `${post.title} · Visquery Journal`,
    description,
    keywords: [
      'passive cooling architecture',
      'heatwave building design',
      'cool roofs and facades',
      'building retrofit AI',
      'thermal mass shading materials',
      'European heatwave 2026',
    ],
    alternates: { canonical: url },
    authors: [{ name: post.author }],
    openGraph: {
      type: 'article',
      url,
      title: post.title,
      description,
      siteName: 'Visquery',
      publishedTime: '2026-06-30',
      images: [{ url: image, alt: post.hero.alt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description,
      images: [image],
    },
  };
}

export default function JournalPostPage({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug);
  if (!post) notFound();

  // Article structured data so the post is eligible for rich results.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.brief,
    image: [`${SITE_URL}${post.hero.src}`],
    datePublished: '2026-06-30',
    dateModified: '2026-06-30',
    author: { '@type': 'Organization', name: post.author },
    publisher: {
      '@type': 'Organization',
      name: 'Visquery',
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/app-logo.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE_URL}/journal/${post.id}` },
  };

  return (
    <div className="app">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main className="blog-article blog-article-page">
        <div className="blog-article-bar">
          <Link className="blog-back-btn" href="/" aria-label="Back to Visquery">
            <ArrowLeft size={16} />
            <span>Visquery</span>
          </Link>
          <span className="blog-article-bar-meta">{post.dispatch} · Visquery Journal</span>
        </div>

        <BlogArticleBody post={post} />

        <div className="blog-article-inner blog-article-foot-wrap">
          <div className="blog-article-foot">
            <Link className="blog-back-btn" href="/journal" aria-label="All journal entries">
              <ArrowLeft size={16} />
              <span>All entries</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
