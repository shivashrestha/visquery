'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { SearchResponse, FilterState } from './types';
import { search, searchByImage } from './api';
import type { SearchRequest } from './types';

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export const DEFAULT_FILTERS: FilterState = {
  period: [0, 2024],
  typology: [],
  material: [],
  structural_system: [],
  climate_zone: [],
  style: [],
  location_country: '',
};

function filtersToSearchFilters(
  filters: FilterState,
): SearchRequest['filters'] {
  const f: SearchRequest['filters'] = {};
  if (filters.period[0] !== 0 || filters.period[1] !== 2024) {
    f.period = filters.period;
  }
  if (filters.typology.length > 0) f.typology = filters.typology;
  if (filters.material.length > 0) f.material = filters.material;
  if (filters.location_country) f.country = filters.location_country;
  if (filters.structural_system.length > 0) f.structural_system = filters.structural_system;
  if (filters.climate_zone.length > 0) f.climate_zone = filters.climate_zone;
  if (filters.style.length > 0) f.style = filters.style;
  return f;
}

export function useSearch() {
  const [query, setQuery] = useState('');
  const [imageId, setImageId] = useState<string | undefined>(undefined);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(
    async (
      q: string,
      imgId: string | undefined,
      activeFilters: FilterState,
      currentPage: number,
    ) => {
      if (!q.trim() && !imgId) return;
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setLoading(true);
      setError(null);
      setHasSearched(true);

      try {
        const response = await search({
          query: q,
          image_id: imgId,
          filters: filtersToSearchFilters(activeFilters),
        });

        if (currentPage > 1) {
          setResults((prev) =>
            prev
              ? {
                  ...response,
                  results: [...prev.results, ...response.results],
                }
              : response,
          );
        } else {
          setResults(response);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const submit = useCallback(
    (q: string, imgId?: string) => {
      setQuery(q);
      setImageId(imgId);
      setPage(1);
      setResults(null);
      runSearch(q, imgId, filters, 1);
    },
    [filters, runSearch],
  );

  const loadMore = useCallback(() => {
    const next = page + 1;
    setPage(next);
    runSearch(query, imageId, filters, next);
  }, [page, query, imageId, filters, runSearch]);

  const updateFilters = useCallback(
    (next: FilterState) => {
      setFilters(next);
      if (hasSearched && (query || imageId)) {
        setPage(1);
        setResults(null);
        runSearch(query, imageId, next, 1);
      }
    },
    [hasSearched, query, imageId, runSearch],
  );

  const submitByImage = useCallback(async (file: File) => {
    setQuery('');
    setImageId(undefined);
    setPage(1);
    setResults(null);
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const response = await searchByImage(file);
      setResults(response);
    } catch (err) {
      if (err instanceof Error) setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearSearch = useCallback(() => {
    setQuery('');
    setImageId(undefined);
    setResults(null);
    setHasSearched(false);
    setError(null);
  }, []);

  const activeFilterCount =
    (filters.typology.length > 0 ? 1 : 0) +
    (filters.material.length > 0 ? 1 : 0) +
    (filters.structural_system.length > 0 ? 1 : 0) +
    (filters.climate_zone.length > 0 ? 1 : 0) +
    (filters.style.length > 0 ? 1 : 0) +
    (filters.location_country ? 1 : 0) +
    (filters.period[0] !== 0 || filters.period[1] !== 2024 ? 1 : 0);

  return {
    query,
    setQuery,
    imageId,
    filters,
    results,
    loading,
    error,
    hasSearched,
    page,
    submit,
    submitByImage,
    loadMore,
    updateFilters,
    clearSearch,
    activeFilterCount,
  };
}

export function useFeedbackState() {
  const [ratings, setRatings] = useState<Record<string, 'up' | 'down'>>({});

  const setRating = useCallback((imageId: string, rating: 'up' | 'down') => {
    setRatings((prev) => ({ ...prev, [imageId]: rating }));
  }, []);

  return { ratings, setRating };
}
