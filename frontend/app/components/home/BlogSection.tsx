'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

import { type ImageMarker, type BlogPost, BLOG_POSTS, heatColor } from './blogData';
export { BLOG_POSTS, getPostBySlug } from './blogData';
export type { BlogPost, BlogBlock, ImageMarker, ThermalStat } from './blogData';


// Image with component-targeting overlay — dashed boxes + corner ticks + tags.
function MarkedImage({
  src,
  alt,
  markers,
  className,
}: {
  src: string;
  alt: string;
  markers?: ImageMarker[];
  className?: string;
}) {
  return (
    <div className={`blog-marked${className ? ` ${className}` : ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={(e) => {
          (e.currentTarget.parentElement as HTMLElement).classList.add('no-img');
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
      {markers?.map((m) => (
        <span
          key={m.label}
          className="blog-target"
          style={{
            top: `${m.top}%`,
            left: `${m.left}%`,
            width: `${m.width}%`,
            height: `${m.height}%`,
            // CSS var so border + tag + ticks share the marker colour.
            ['--mk' as string]: m.color,
          }}
        >
          <span className="blog-target-tag">{m.label}</span>
        </span>
      ))}
    </div>
  );
}

// ── Home section — featured editorial dispatch ─────────
export function BlogSection({ onOpen }: { onOpen: (post: BlogPost) => void }) {
  const post = BLOG_POSTS[0];

  return (
    <section className="blog-section" id="blog">
      <div className="blog-inner">
        <header className="blog-head">
          <p className="blog-eyebrow">
            <span>Journal</span>
            <span className="blog-eyebrow-rail" aria-hidden="true" />
            <span>{post.dispatch}</span>
          </p>
          <h2 className="blog-heading">Notes from the Built Environment</h2>
          <p className="blog-sub">
            Field notes on climate, materials, and the components that decide how a
            building behaves, and how AI helps us read them at the scale of a city.
          </p>
        </header>

        {/* Real <a> so crawlers (and JS-off users) reach the article at its
            own URL; click is intercepted for the in-page reading view. */}
        <a
          className="blog-feature"
          href={`/journal/${post.id}`}
          aria-label={`Read: ${post.title}`}
          onClick={(e) => {
            // Honour modifier-clicks / middle-click → let the browser open the URL.
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
            e.preventDefault();
            onOpen(post);
          }}
        >
          <div className="blog-feature-text">
            <p className="blog-feature-meta">
              {post.eyebrow} <span className="blog-card-dot">·</span> {post.date}{' '}
              <span className="blog-card-dot">·</span> {post.readMins} min read
            </p>
            <h3 className="blog-feature-title">{post.title}</h3>
            <p className="blog-feature-subtitle">{post.subtitle}</p>
            <p className="blog-feature-brief">{post.brief}</p>
            <span className="blog-feature-cta">Read the full dispatch →</span>
          </div>

          <div className="blog-feature-media">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.hero.src}
              alt={post.hero.alt}
              loading="lazy"
              decoding="async"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            {/* Signature: vertical thermal gauge marking the peak reading */}
            <div className="blog-gauge" aria-hidden="true">
              <span className="blog-gauge-peak">{post.gauge.peak}</span>
              <span className="blog-gauge-track" />
              <span className="blog-gauge-caption">{post.gauge.caption}</span>
            </div>
          </div>
        </a>

        {/* Signature: thermal ledger — real anomaly data on a cool→hot rail */}
        <div className="blog-ledger" aria-label="2026 European heatwave, by the numbers">
          {post.stats.map((s) => (
            <div className="blog-ledger-cell" key={s.label}>
              <span className="blog-ledger-value" style={{ color: heatColor(s.heat) }}>
                {s.value}
                {s.unit && <span className="blog-ledger-unit">{s.unit}</span>}
              </span>
              <span className="blog-ledger-label">{s.label}</span>
              <span
                className="blog-ledger-tick"
                style={{ left: `${s.heat * 100}%`, background: heatColor(s.heat) }}
                aria-hidden="true"
              />
            </div>
          ))}
          <div className="blog-ledger-rail" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}

// ── Shared article body — used by the in-page view and the /journal route ──
export function BlogArticleBody({ post }: { post: BlogPost }) {
  return (
    <article className="blog-article-inner">
      <p className="blog-reader-meta">
        {post.eyebrow} · {post.date} · {post.readMins} min read
      </p>
      <h1 className="blog-reader-title">{post.title}</h1>
      <p className="blog-reader-subtitle">{post.subtitle}</p>
      <p className="blog-reader-byline">By {post.author}</p>

      <div className="blog-reader-ledger" aria-label="By the numbers">
        {post.stats.map((s) => (
          <div className="blog-reader-stat" key={s.label}>
            <span className="blog-reader-stat-value" style={{ color: heatColor(s.heat) }}>
              {s.value}
              {s.unit && <span className="blog-ledger-unit">{s.unit}</span>}
            </span>
            <span className="blog-reader-stat-label">{s.label}</span>
          </div>
        ))}
        <div className="blog-reader-ledger-rail" aria-hidden="true" />
      </div>

      <figure className="blog-reader-figure blog-reader-hero-figure">
        <MarkedImage src={post.hero.src} alt={post.hero.alt} markers={post.hero.markers} />
        {post.hero.markers && (
          <figcaption className="blog-target-legend">
            Marked: the passive-cooling components doing the work, {post.hero.markers.map((m) => m.label.toLowerCase()).join(', ')}.
          </figcaption>
        )}
      </figure>

      {post.body.map((block, i) => {
        switch (block.type) {
          case 'h2':
            return <h2 key={i} className="blog-reader-h2">{block.text}</h2>;
          case 'p':
            return <p key={i} className="blog-reader-p">{block.text}</p>;
          case 'quote':
            return (
              <blockquote key={i} className="blog-reader-quote">
                <p>{block.text}</p>
                {block.cite && <cite>{block.cite}</cite>}
              </blockquote>
            );
          case 'list':
            return (
              <ul key={i} className="blog-reader-list">
                {block.items.map((it, j) => <li key={j}>{it}</li>)}
              </ul>
            );
          case 'figure':
            return (
              <figure key={i} className="blog-reader-figure">
                <MarkedImage src={block.src} alt={block.alt} markers={block.markers} />
                <figcaption>{block.caption}</figcaption>
              </figure>
            );
          case 'note':
            return (
              <aside key={i} className="blog-reader-note">
                <span className="blog-reader-note-label">{block.label}</span>
                <p>{block.text}</p>
              </aside>
            );
          default:
            return null;
        }
      })}
    </article>
  );
}

// ── Full in-page article view ──────────────────────────
export function BlogArticleView({ post, onBack }: { post: BlogPost; onBack: () => void }) {
  // Scroll the article container to top on open.
  useEffect(() => {
    const el = document.getElementById('blog-article-scroll');
    if (el) el.scrollTo(0, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <motion.main
      id="blog-article-scroll"
      className="blog-article"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
    >
      <div className="blog-article-bar">
        <button className="blog-back-btn" onClick={onBack} aria-label="Back to journal">
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <span className="blog-article-bar-meta">{post.dispatch} · Visquery Journal</span>
      </div>

      <BlogArticleBody post={post} />

      <div className="blog-article-inner blog-article-foot-wrap">
        <div className="blog-article-foot">
          <button className="blog-back-btn" onClick={onBack} aria-label="Back to journal">
            <ArrowLeft size={16} />
            <span>Back to journal</span>
          </button>
        </div>
      </div>
    </motion.main>
  );
}
