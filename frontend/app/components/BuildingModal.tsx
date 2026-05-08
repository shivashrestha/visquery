'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ArrowUpRight,
} from 'lucide-react';
import type { SearchResultItem } from '@/lib/types';
import FeedbackButtons from './FeedbackButtons';

interface BuildingModalProps {
  result: SearchResultItem;
  query: string;
  onClose: () => void;
  ratings: Record<string, 'up' | 'down'>;
  onRatingChange: (imageId: string, rating: 'up' | 'down') => void;
}

function LicenseBadge({ license }: { license: string }) {
  return (
    <span className="inline-block text-2xs font-medium text-muted border border-border rounded px-1.5 py-0.5 uppercase tracking-wide">
      {license.replace(/_/g, ' ')}
    </span>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="inline-block text-xs px-2 py-0.5 bg-surface border border-border rounded-full text-near-black/70 capitalize">
      {label.replace(/_/g, ' ')}
    </span>
  );
}

function MetaItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 border-b border-border last:border-0">
      <dt className="text-2xs uppercase tracking-wider font-medium text-muted">
        {label}
      </dt>
      <dd className="text-sm text-near-black">{children}</dd>
    </div>
  );
}

export default function BuildingModal({
  result,
  query,
  onClose,
  ratings,
  onRatingChange,
}: BuildingModalProps) {
  const [activeImage, setActiveImage] = useState(0);

  const images = [result.image_url];

  const prevImage = useCallback(() => {
    setActiveImage((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const nextImage = useCallback(() => {
    setActiveImage((i) => (i + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prevImage();
      if (e.key === 'ArrowRight') nextImage();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose, prevImage, nextImage]);

  const { metadata, source, explanation } = result;

  const locationStr = [metadata.location_city, metadata.location_country]
    .filter(Boolean)
    .join(', ');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={metadata.architect ?? 'Building detail'}
      className="fixed inset-0 z-50"
    >
      <motion.div
        className="absolute inset-0 bg-near-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
      />

      <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-6 lg:p-10 pointer-events-none">
        <motion.div
          className="relative w-full max-w-5xl max-h-[90vh] bg-white rounded-sm shadow-2xl overflow-hidden flex flex-col lg:flex-row pointer-events-auto"
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 p-1.5 bg-white/90 hover:bg-white border border-border rounded-sm text-muted hover:text-near-black transition-colors shadow-sm"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="lg:flex-1 flex flex-col min-h-0 bg-surface">
            <div className="relative aspect-[4/3] lg:aspect-auto lg:h-full min-h-[200px]">
              <Image
                src={images[activeImage]}
                alt={metadata.architect ?? 'Building'}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 60vw"
                priority
              />

              {images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 bg-white/80 hover:bg-white rounded-sm border border-border shadow-sm transition-colors"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="w-4 h-4 text-near-black" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 bg-white/80 hover:bg-white rounded-sm border border-border shadow-sm transition-colors"
                    aria-label="Next image"
                  >
                    <ChevronRight className="w-4 h-4 text-near-black" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveImage(i)}
                        className={[
                          'w-1.5 h-1.5 rounded-full transition-colors',
                          i === activeImage
                            ? 'bg-white'
                            : 'bg-white/50 hover:bg-white/75',
                        ].join(' ')}
                        aria-label={`Image ${i + 1}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="lg:w-80 xl:w-96 flex flex-col overflow-y-auto border-t lg:border-t-0 lg:border-l border-border">
            <div className="p-5 flex-1">
              <h2 className="font-serif text-2xl lg:text-3xl text-near-black leading-tight mb-1">
                {metadata.architect ?? 'Unknown architect'}
              </h2>
              {metadata.year_built && (
                <p className="text-muted text-sm mb-4">
                  {metadata.year_built}
                  {locationStr ? ` · ${locationStr}` : ''}
                </p>
              )}

              {explanation && (
                <div className="mb-4 px-3 py-2 bg-amber-50 border-l-2 border-accent text-xs italic text-near-black/80 rounded-sm">
                  {explanation}
                </div>
              )}

              {metadata.description && (
                <p className="text-sm leading-relaxed text-near-black/80 mb-4 pb-4 border-b border-border">
                  {metadata.description}
                </p>
              )}

              <dl>
                {metadata.typology && metadata.typology.length > 0 && (
                  <MetaItem label="Typology">
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {metadata.typology.map((t) => (
                        <Chip key={t} label={t} />
                      ))}
                    </div>
                  </MetaItem>
                )}
                {metadata.materials && metadata.materials.length > 0 && (
                  <MetaItem label="Materials">
                    {metadata.materials.join(', ')}
                  </MetaItem>
                )}
                {metadata.structural_system && (
                  <MetaItem label="Structure">
                    {metadata.structural_system.replace(/_/g, ' ')}
                  </MetaItem>
                )}
                {metadata.climate_zone && (
                  <MetaItem label="Climate">
                    {metadata.climate_zone.replace(/_/g, ' ')}
                  </MetaItem>
                )}
              </dl>
            </div>

            <div className="px-5 py-4 border-t border-border space-y-3 bg-surface/50">
              <div className="space-y-1.5">
                {source.title && (
                  <p className="text-xs text-near-black font-medium">
                    {source.title}
                  </p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <LicenseBadge license={source.license} />
                  {source.photographer && (
                    <span className="text-xs text-muted">
                      {source.photographer}
                    </span>
                  )}
                </div>
                {source.url && (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    Open original
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              <div className="flex items-center justify-between">
                <Link
                  href={`/building/${result.building_id}?query=${encodeURIComponent(query)}&explanation=${encodeURIComponent(explanation ?? '')}`}
                  className="inline-flex items-center gap-1 text-xs text-muted hover:text-near-black transition-colors"
                >
                  Full record
                  <ArrowUpRight className="w-3 h-3" />
                </Link>

                <FeedbackButtons
                  imageId={result.image_id}
                  buildingId={result.building_id}
                  query={query}
                  currentRating={ratings[result.image_id]}
                  onRatingChange={onRatingChange}
                />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
