'use client';

import { useState, useCallback } from 'react';
import SearchBar from './components/SearchBar';
import FilterSidebar from './components/FilterSidebar';
import ResultGrid from './components/ResultGrid';
import GroundedAnswer from './components/GroundedAnswer';
import BuildingModal from './components/BuildingModal';
import { useSearch, useFeedbackState } from '@/lib/hooks';
import type { SearchResultItem } from '@/lib/types';
import { Menu, X } from 'lucide-react';

export default function HomePage() {
  const {
    query,
    results,
    loading,
    error,
    hasSearched,
    filters,
    submit,
    loadMore,
    updateFilters,
    clearSearch,
    activeFilterCount,
  } = useSearch();

  const { ratings, setRating } = useFeedbackState();

  const [selectedResult, setSelectedResult] = useState<SearchResultItem | null>(
    null,
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleCardClick = useCallback((result: SearchResultItem) => {
    setSelectedResult(result);
  }, []);

  const handleModalClose = useCallback(() => {
    setSelectedResult(null);
  }, []);

  const groundedAnswerText = results
    ? buildGroundedAnswer(results.results, query)
    : null;

  return (
    <div className="min-h-screen bg-near-white">
      <header className="border-b border-border bg-near-white/95 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6 h-14">
            <a href="/" className="flex-shrink-0" onClick={clearSearch}>
              <span className="font-serif text-lg tracking-tight text-near-black">
                Visquery
              </span>
            </a>
            <div className="flex-1 max-w-2xl">
              <SearchBar
                onSearch={submit}
                loading={loading}
                initialQuery={query}
              />
            </div>
            {hasSearched && (
              <button
                onClick={() => setSidebarOpen((v) => !v)}
                className="lg:hidden flex items-center gap-1.5 text-sm text-muted hover:text-near-black transition-colors"
                aria-label="Toggle filters"
              >
                {sidebarOpen ? (
                  <X className="w-4 h-4" />
                ) : (
                  <Menu className="w-4 h-4" />
                )}
                <span>Filters</span>
                {activeFilterCount > 0 && (
                  <span className="bg-accent text-white text-2xs px-1.5 py-0.5 rounded-full font-medium">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {!hasSearched && (
        <main
          id="main-content"
          className="flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] px-4"
        >
          <div className="w-full max-w-2xl text-center mb-10">
            <h1 className="font-serif text-4xl sm:text-5xl text-near-black mb-3 leading-tight">
              Find architectural precedents
            </h1>
            <p className="text-muted text-base sm:text-lg font-light leading-relaxed">
              Describe what you are looking for — material, form, atmosphere,
              typology — or drop an image.
            </p>
          </div>
          <div className="w-full max-w-2xl">
            <SearchBar
              onSearch={submit}
              loading={loading}
              initialQuery=""
              large
            />
          </div>
          <div className="mt-8 flex flex-wrap gap-2 justify-center">
            {EXAMPLE_QUERIES.map((q) => (
              <button
                key={q}
                onClick={() => submit(q)}
                className="text-sm text-muted border border-border rounded px-3 py-1.5 hover:border-accent hover:text-near-black transition-colors bg-white"
              >
                {q}
              </button>
            ))}
          </div>
        </main>
      )}

      {hasSearched && (
        <main
          id="main-content"
          className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
        >
          <div className="flex gap-8">
            <aside
              className={[
                'flex-shrink-0 w-60',
                'hidden lg:block sticky top-[3.5rem] self-start max-h-[calc(100vh-3.5rem)] overflow-y-auto',
              ].join(' ')}
            >
              <FilterSidebar
                filters={filters}
                onChange={updateFilters}
                activeCount={activeFilterCount}
              />
            </aside>

            {sidebarOpen && (
              <div
                className="fixed inset-0 z-40 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <div className="absolute inset-0 bg-near-black/20" />
                <aside
                  className="absolute left-0 top-14 bottom-0 w-72 bg-near-white border-r border-border overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <FilterSidebar
                    filters={filters}
                    onChange={updateFilters}
                    activeCount={activeFilterCount}
                  />
                </aside>
              </div>
            )}

            <div className="flex-1 min-w-0">
              {error && (
                <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
                  {error}
                </div>
              )}
              {groundedAnswerText && !loading && (
                <GroundedAnswer text={groundedAnswerText} />
              )}
              <ResultGrid
                results={results?.results ?? []}
                loading={loading}
                onCardClick={handleCardClick}
                onLoadMore={loadMore}
                hasMore={
                  results ? results.results.length % 30 === 0 : false
                }
                query={query}
                ratings={ratings}
                onRatingChange={setRating}
              />
            </div>
          </div>
        </main>
      )}

      {selectedResult && (
        <BuildingModal
          result={selectedResult}
          query={query}
          onClose={handleModalClose}
          ratings={ratings}
          onRatingChange={setRating}
        />
      )}
    </div>
  );
}

function buildGroundedAnswer(
  results: SearchResultItem[],
  query: string,
): string {
  if (results.length === 0) return 'No results found for this query.';

  const architects = [
    ...new Set(
      results
        .map((r) => r.metadata.architect)
        .filter(Boolean)
        .map((a) => a!.split(' ').pop()!),
    ),
  ].slice(0, 3);

  const years = results
    .map((r) => r.metadata.year_built)
    .filter((y): y is number => typeof y === 'number');

  const minYear = years.length ? Math.min(...years) : null;
  const maxYear = years.length ? Math.max(...years) : null;

  const count = results.length;
  const yearRange =
    minYear && maxYear && minYear !== maxYear
      ? `${minYear}–${maxYear}`
      : minYear
        ? String(minYear)
        : null;

  const parts: string[] = [`Found ${count} result${count !== 1 ? 's' : ''}`];
  if (yearRange) parts.push(`spanning ${yearRange}`);
  if (architects.length > 0) {
    parts.push(
      `including ${architects.slice(0, -1).join(', ')}${architects.length > 1 ? ' and ' : ''}${architects[architects.length - 1]}`,
    );
  }

  return parts.join(', ') + '.';
}

const EXAMPLE_QUERIES = [
  'Thick walls that become furniture',
  'Curved concrete facade with deep reveals',
  'Timber school with natural light',
  'Brutalist library with heavy cantilever',
  'Courtyard house in hot climate',
];
