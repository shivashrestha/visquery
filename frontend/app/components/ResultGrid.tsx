'use client';

import type { SearchResultItem } from '@/lib/types';
import BuildingCard from './BuildingCard';

interface ResultGridProps {
  results: SearchResultItem[];
  loading: boolean;
  onCardClick: (result: SearchResultItem) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  query: string;
  ratings: Record<string, 'up' | 'down'>;
  onRatingChange: (imageId: string, rating: 'up' | 'down') => void;
}

function SkeletonCard({ tall }: { tall?: boolean }) {
  return (
    <div className="break-inside-avoid mb-4 bg-white border border-border rounded-sm overflow-hidden">
      <div
        className={`skeleton ${tall ? 'h-72' : 'h-48'} w-full`}
        aria-hidden="true"
      />
      <div className="p-3 space-y-2">
        <div className="skeleton h-4 w-3/4 rounded" aria-hidden="true" />
        <div className="skeleton h-3 w-1/2 rounded" aria-hidden="true" />
        <div className="skeleton h-3 w-full rounded" aria-hidden="true" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="font-serif text-2xl text-near-black/30 mb-3">
        No results found
      </p>
      <p className="text-sm text-muted max-w-xs">
        Try different keywords, adjust your filters, or search by image.
      </p>
    </div>
  );
}

export default function ResultGrid({
  results,
  loading,
  onCardClick,
  onLoadMore,
  hasMore,
  query,
  ratings,
  onRatingChange,
}: ResultGridProps) {
  if (loading && results.length === 0) {
    return (
      <div
        className="columns-1 sm:columns-2 lg:columns-3 xl:columns-3 gap-4"
        aria-busy="true"
        aria-label="Loading results"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonCard key={i} tall={i === 0 || i === 3} />
        ))}
      </div>
    );
  }

  if (!loading && results.length === 0) {
    return <EmptyState />;
  }

  return (
    <div>
      <div
        className="columns-1 sm:columns-2 lg:columns-3 xl:columns-3 gap-4"
        role="list"
        aria-label="Search results"
      >
        {results.map((result) => (
          <div key={`${result.building_id}-${result.image_id}`} role="listitem">
            <BuildingCard
              result={result}
              onClick={onCardClick}
              query={query}
              currentRating={ratings[result.image_id]}
              onRatingChange={onRatingChange}
            />
          </div>
        ))}

        {loading &&
          Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={`skeleton-${i}`} />
          ))}
      </div>

      {hasMore && !loading && (
        <div className="flex justify-center mt-8 mb-4">
          <button
            onClick={onLoadMore}
            className="px-6 py-2.5 text-sm border border-border rounded-sm text-near-black hover:border-accent/60 hover:text-accent transition-colors bg-white"
          >
            Load 30 more
          </button>
        </div>
      )}

      {results.length > 0 && (
        <p className="text-center text-xs text-muted mt-4 mb-8">
          {results.length} result{results.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}
