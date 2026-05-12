import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft } from 'lucide-react';
import type { Building } from '@/lib/types';
import { getImageUrl } from '@/lib/api';

interface PageProps {
  params: { id: string };
  searchParams: { query?: string; explanation?: string };
}

async function fetchBuilding(id: string): Promise<Building | null> {
  const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8000';
  try {
    const res = await fetch(`${backendUrl}/api/buildings/${id}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<Building>;
  } catch {
    return null;
  }
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-2 border-b border-border last:border-0">
      <dt className="w-36 flex-shrink-0 text-xs text-muted uppercase tracking-wider font-medium pt-0.5">
        {label}
      </dt>
      <dd className="text-sm text-near-black">{value}</dd>
    </div>
  );
}

async function BuildingDetail({ id, query, explanation }: { id: string; query?: string; explanation?: string }) {
  const building = await fetchBuilding(id);

  if (!building) {
    return (
      <div className="text-center py-24">
        <p className="text-muted text-lg font-serif">Building not found.</p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-accent hover:underline"
        >
          Return to search
        </Link>
      </div>
    );
  }

  const primaryImage = building.images[0];
  const remainingImages = building.images.slice(1);

  return (
    <article className="max-w-screen-lg mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <Link
          href={query ? `/?q=${encodeURIComponent(query)}` : '/'}
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-near-black transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to results
        </Link>
      </div>

      {explanation && (
        <div className="mb-6 px-4 py-3 bg-amber-50 border-l-2 border-accent text-sm italic text-near-black/80">
          <span className="not-italic text-xs uppercase tracking-wider text-accent font-medium mr-2">
            Why this matches
          </span>
          {explanation}
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_360px] gap-10">
        <div>
          {primaryImage && (
            <div className="relative aspect-[4/3] mb-3 bg-surface overflow-hidden rounded-sm">
              <Image
                src={getImageUrl(primaryImage.id)}
                alt={primaryImage.caption ?? building.name}
                fill
                className="object-cover"
                priority
                sizes="(max-width: 1024px) 100vw, calc(100vw - 400px)"
              />
            </div>
          )}
          {primaryImage?.caption && (
            <p className="text-xs text-muted italic mb-6">
              {primaryImage.caption}
              {primaryImage.photographer && ` — ${primaryImage.photographer}`}
            </p>
          )}

          {remainingImages.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-6">
              {remainingImages.map((img) => (
                <div
                  key={img.id}
                  className="relative aspect-[4/3] bg-surface overflow-hidden rounded-sm"
                >
                  <Image
                    src={getImageUrl(img.id)}
                    alt={img.caption ?? building.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 50vw, 33vw"
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="lg:sticky lg:top-24 self-start">
          <h1 className="font-serif text-3xl sm:text-4xl text-near-black mb-1 leading-tight">
            {building.name}
          </h1>
          {building.architect && (
            <p className="text-muted text-base mb-6">
              {building.architect}
              {building.year_built ? `, ${building.year_built}` : ''}
            </p>
          )}

          {building.description && (
            <div className="mb-6 border-b border-border pb-6">
              <p className="text-sm leading-relaxed text-near-black/80 mb-2">
                {building.description}
              </p>
              <p className="text-2xs text-muted font-mono" style={{ fontSize: '10px', opacity: 0.7 }}>
                ✦ AI-generated description · Claude (Anthropic) · may not be fully accurate
              </p>
            </div>
          )}

          <dl className="mb-6">
            {building.location_city || building.location_country ? (
              <MetaRow
                label="Location"
                value={[building.location_city, building.location_country]
                  .filter(Boolean)
                  .join(', ')}
              />
            ) : null}
            {building.typology && building.typology.length > 0 && (
              <MetaRow
                label="Typology"
                value={building.typology
                  .map((t) => t.replace(/_/g, ' '))
                  .join(', ')}
              />
            )}
            {building.materials && building.materials.length > 0 && (
              <MetaRow label="Materials" value={building.materials.join(', ')} />
            )}
            {building.structural_system && (
              <MetaRow
                label="Structure"
                value={building.structural_system.replace(/_/g, ' ')}
              />
            )}
            {building.climate_zone && (
              <MetaRow
                label="Climate"
                value={building.climate_zone.replace(/_/g, ' ')}
              />
            )}
          </dl>

          <div className="border-t border-border pt-4">
            <p className="text-xs uppercase tracking-wider text-muted font-medium mb-2">
              Description source
            </p>
            <p className="text-xs text-muted font-mono">
              Claude (Anthropic) · AI Vision Model
            </p>
            <p className="text-xs text-muted mt-1" style={{ lineHeight: 1.5 }}>
              All descriptions and metadata are AI-generated and may not be exact or fully accurate.
            </p>
            {building.images.some((img) => img.photographer) && (
              <div className="mt-3 space-y-1">
                <p className="text-xs uppercase tracking-wider text-muted font-medium">Photography</p>
                {building.images.filter((img) => img.photographer).map((img) => (
                  <p key={img.id} className="text-xs text-muted">{img.photographer}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function BuildingPage({ params, searchParams }: PageProps) {
  return (
    <div className="min-h-screen bg-near-white">
      <header className="border-b border-border bg-near-white/95 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-screen-lg mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center">
          <Link
            href="/"
            className="font-serif text-lg tracking-tight text-near-black"
          >
            Visquery
          </Link>
        </div>
      </header>
      <Suspense
        fallback={
          <div className="max-w-screen-lg mx-auto px-4 py-8">
            <div className="skeleton h-8 w-24 rounded mb-8" />
            <div className="grid lg:grid-cols-[1fr_360px] gap-10">
              <div>
                <div className="skeleton aspect-[4/3] rounded-sm mb-3" />
                <div className="skeleton h-4 w-48 rounded mt-2" />
              </div>
              <div className="space-y-4">
                <div className="skeleton h-10 w-64 rounded" />
                <div className="skeleton h-4 w-40 rounded" />
                <div className="skeleton h-24 w-full rounded" />
              </div>
            </div>
          </div>
        }
      >
        <BuildingDetail
          id={params.id}
          query={searchParams.query}
          explanation={searchParams.explanation}
        />
      </Suspense>
    </div>
  );
}
