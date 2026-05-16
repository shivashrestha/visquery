'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import type { SearchResultItem } from '@/lib/types';
import CachedImage from './CachedImage';

interface BuildingCardProps {
  result: SearchResultItem;
  onClick: (result: SearchResultItem) => void;
  onFav?: (result: SearchResultItem) => void;
  fav?: boolean;
  queryTerms?: string[];
  index?: number;
  compact?: boolean;
}

/** Derive a pseudo-photo motif from metadata */
function getMotif(result: SearchResultItem): string {
  const mat = result.metadata.materials?.[0]?.toLowerCase() ?? '';
  const typ = result.metadata.typology?.[0]?.toLowerCase() ?? '';
  const tags = (result.tags ?? []).map((t) => t.toLowerCase());
  if (mat === 'timber') return 'timber-vault';
  if (mat === 'glass') return 'glass-box';
  if (mat === 'brick') return 'brick-grid';
  if (mat === 'steel') return 'industrial';
  if (mat === 'earth') return 'thick-wall';
  if (tags.some((t) => t.includes('cantilever') || t.includes('floating'))) return 'cantilever';
  if (tags.some((t) => t.includes('courtyard') || t.includes('patio'))) return 'courtyard';
  if (tags.some((t) => t.includes('curved') || t.includes('curve'))) return 'curve';
  if (typ.includes('religious') || typ.includes('chapel')) return 'thick-wall';
  return 'thick-wall';
}

const MATERIAL_PALETTES: Record<string, [string, string, string]> = {
  concrete:  ['#c4c1b8', '#6f6a60', '#1f1d18'],
  brick:     ['#c79775', '#7d4a2f', '#2a1812'],
  timber:    ['#e6dcc6', '#b08a52', '#3a2d1c'],
  stone:     ['#d8cdb8', '#8a7458', '#403426'],
  glass:     ['#cbd0c9', '#5d6862', '#1a1f1c'],
  steel:     ['#bcbab2', '#4d4a44', '#15140f'],
  earth:     ['#e3c79c', '#a06d3c', '#3a2110'],
};

function getColors(result: SearchResultItem): [string, string, string] {
  const mat = result.metadata.materials?.[0]?.toLowerCase() ?? '';
  return MATERIAL_PALETTES[mat] ?? ['#d4d0c8', '#7a7268', '#252218'];
}

export default function BuildingCard({
  result,
  onClick,
  onFav,
  fav = false,
  queryTerms = [],
  index = 0,
  compact = false,
}: BuildingCardProps) {
  const { metadata, source, explanation } = result;
  const motif = getMotif(result);
  const [c1, c2, c3] = getColors(result);
  const [imgFailed, setImgFailed] = useState(false);

  const matchTags = (result.tags ?? []).filter((t) =>
    queryTerms.some((q) => q && t.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <motion.article
      className="card"
      onClick={() => onClick(result)}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
      transition={{
        duration: 0.45,
        delay: Math.min(index * 0.04, 0.36),
        ease: [0.22, 0.61, 0.36, 1],
      }}
    >
      <div className="card-img">
        {result.image_url && !imgFailed ? (
          <CachedImage
            src={result.image_url}
            alt={metadata.architect ?? 'Building'}
            fill
            className="object-cover"
            sizes="(max-width: 480px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div
            className={`pp ${motif}`}
            style={
              { '--c1': c1, '--c2': c2, '--c3': c3 } as React.CSSProperties
            }
          >
            {source.title && <span className="pp-caption">{source.title}</span>}
          </div>
        )}

        <div className="card-corners" aria-hidden="true">
          <span /><span /><span /><span />
        </div>

        {onFav && (
          <motion.button
            className={`card-fav${fav ? ' on' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onFav(result);
            }}
            whileTap={{ scale: 0.85 }}
            animate={fav ? { scale: [1, 1.28, 1] } : { scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <Heart size={13} fill={fav ? 'currentColor' : 'none'} />
          </motion.button>
        )}
      </div>

      {(source.title || metadata.architect || metadata.year_built) && (
        <div className="card-meta-1">
          {(source.title || metadata.architect) && (
            <h3 className="card-title">{source.title || metadata.architect}</h3>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {metadata.year_built && (
              <span className="card-year">{metadata.year_built}</span>
            )}
            {index !== undefined && (
              <span className="card-plate-num">No.{String(index + 1).padStart(3, '0')}</span>
            )}
          </div>
        </div>
      )}

      {(metadata.architect || metadata.location_city || metadata.location_country) && (
        <p className="card-sub">
          {[
            metadata.architect,
            [metadata.location_city, metadata.location_country]
              .filter(Boolean)
              .join(', '),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      {!compact && (explanation || (result.tags && result.tags.length > 0)) && (
        <div className="card-tags">
          {result.tags
            ? result.tags.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className={`card-tag${matchTags.includes(t) ? ' match' : ''}`}
                >
                  {t}
                </span>
              ))
            : null}
        </div>
      )}
    </motion.article>
  );
}
