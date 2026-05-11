'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import type { SearchResultItem } from '@/lib/types';

interface RowCardProps {
  result: SearchResultItem;
  onClick: (result: SearchResultItem) => void;
  queryTerms?: string[];
  index?: number;
}

export default function RowCard({
  result,
  onClick,
  queryTerms = [],
  index = 0,
}: RowCardProps) {
  const { metadata, source } = result;
  const matchTags = (result.tags ?? []).filter((t) =>
    queryTerms.some((q) => q && t.toLowerCase().includes(q.toLowerCase())),
  );
  const locationStr = [metadata.location_city, metadata.location_country]
    .filter(Boolean)
    .join(', ');

  return (
    <motion.div
      className="row"
      onClick={() => onClick(result)}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{
        duration: 0.35,
        delay: Math.min(index * 0.03, 0.3),
        ease: 'easeOut',
      }}
    >
      <div className="card-img" style={{ borderRadius: '3px' }}>
        {result.image_url ? (
          <Image
            src={result.image_url}
            alt={metadata.architect ?? 'Building'}
            fill
            className="object-cover"
            sizes="140px"
            loading="lazy"
          />
        ) : (
          <div
            className="pp thick-wall"
            style={{ '--c1': '#d4d0c8', '--c2': '#7a7268' } as React.CSSProperties}
          />
        )}
      </div>

      <div className="row-body">
        {(source.title || metadata.architect) && (
          <h3>{source.title || metadata.architect}</h3>
        )}
        <div className="meta">
          {[metadata.architect, locationStr, metadata.year_built]
            .filter(Boolean)
            .join(' · ')}
        </div>
        <div className="card-tags" style={{ marginTop: '8px' }}>
          {(result.tags ?? []).slice(0, 6).map((t) => (
            <span
              key={t}
              className={`card-tag${matchTags.includes(t) ? ' match' : ''}`}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

    </motion.div>
  );
}
