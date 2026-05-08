'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { SearchResultItem } from '@/lib/types';
import FeedbackButtons from './FeedbackButtons';

interface BuildingCardProps {
  result: SearchResultItem;
  onClick: (result: SearchResultItem) => void;
  query: string;
  currentRating?: 'up' | 'down';
  onRatingChange?: (imageId: string, rating: 'up' | 'down') => void;
}

function LicenseBadge({ license }: { license: string }) {
  return (
    <span className="text-2xs font-medium text-muted/70 bg-black/5 px-1 py-0.5 rounded uppercase tracking-wide">
      {license.replace(/_/g, ' ')}
    </span>
  );
}

export default function BuildingCard({
  result,
  onClick,
  query,
  currentRating,
  onRatingChange,
}: BuildingCardProps) {
  const [hovered, setHovered] = useState(false);
  const { metadata, source, image_url, explanation } = result;

  const name =
    metadata.architect
      ? `${metadata.architect}`
      : 'Unknown architect';

  const yearStr = metadata.year_built ? String(metadata.year_built) : '';
  const locationStr = [metadata.location_city, metadata.location_country]
    .filter(Boolean)
    .join(', ');

  const subtitle = [name, yearStr, locationStr].filter(Boolean).join(' · ');

  return (
    <div
      className="break-inside-avoid mb-4 bg-white border border-border rounded-sm overflow-hidden cursor-pointer group relative"
      onClick={() => onClick(result)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(result);
        }
      }}
      aria-label={`View ${metadata.architect ?? 'building'} details`}
    >
      <div className="relative overflow-hidden bg-surface">
        <Image
          src={image_url}
          alt={metadata.architect ?? 'Building'}
          width={600}
          height={400}
          className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          loading="lazy"
          placeholder="blur"
          blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/+F9PQAI8wNPvd7POQAAAABJRU5ErkJggg=="
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />

        <div
          className={[
            'absolute top-2 right-2 transition-opacity duration-150',
            hovered ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
          onClick={(e) => e.stopPropagation()}
        >
          <FeedbackButtons
            imageId={result.image_id}
            buildingId={result.building_id}
            query={query}
            currentRating={currentRating}
            onRatingChange={onRatingChange}
            compact
          />
        </div>
      </div>

      <div className="px-3 pt-2.5 pb-3">
        <h3 className="font-serif text-base text-near-black leading-snug mb-0.5">
          {metadata.architect ?? 'Unknown architect'}
        </h3>
        <p className="text-xs text-muted mb-1.5">{subtitle}</p>
        {explanation && (
          <p className="text-xs text-near-black/70 leading-relaxed line-clamp-2">
            {explanation}
          </p>
        )}
        <div className="flex items-center justify-between mt-2">
          {metadata.typology && metadata.typology.length > 0 && (
            <span className="text-2xs text-muted capitalize">
              {metadata.typology[0].replace(/_/g, ' ')}
            </span>
          )}
          <div className="ml-auto">
            <LicenseBadge license={source.license} />
          </div>
        </div>
      </div>
    </div>
  );
}
