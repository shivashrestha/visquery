import type { MetadataRoute } from 'next';
import { BLOG_POSTS } from './components/home/blogData';

const SITE_URL = 'https://visquery.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const posts = BLOG_POSTS.map((p) => ({
    url: `${SITE_URL}/journal/${p.id}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [
    { url: SITE_URL, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/library`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE_URL}/collections`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/journal`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    ...posts,
  ];
}
