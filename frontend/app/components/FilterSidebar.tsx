'use client';

import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { DEFAULT_FILTERS } from '@/lib/hooks';
import { getFacets } from '@/lib/api';
import type { FilterState, SearchResultItem, BuildingMetadata } from '@/lib/types';

interface FilterSidebarProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  activeCount: number;
  corpus?: SearchResultItem[];
}

type FacetValue = { label: string; value: string };

type FacetDef = {
  key: string;
  label: string;
  filterKey: keyof FilterState;
  isArray: boolean;
  matchMode: 'exact' | 'contains';
  showMoreAt?: number;
  metaKey?: keyof BuildingMetadata;
  getVal?: (item: SearchResultItem) => string | string[] | undefined;
};

// Static fallback values used before DB facets load.
const STYLE_FALLBACK: FacetValue[] = [
  'modernism', 'neoclassical', 'baroque', 'islamic architecture', 'neo gothic',
  'beaux arts', 'contemporary', 'historicism', 'art deco', 'brutalism',
  'neo renaissance', 'gothic revival', 'art nouveau', 'deconstructivism', 'byzantine',
].map((v) => ({ value: v, label: toTitleCase(v) }));

const BTYPE_FALLBACK: FacetValue[] = [
  'residential', 'commercial', 'religious', 'civic', 'cultural', 'institutional',
].map((v) => ({ value: v, label: toTitleCase(v) }));

const MATERIAL_FALLBACK: FacetValue[] = [
  'glass', 'stone', 'stucco', 'brick', 'concrete', 'steel',
  'masonry', 'timber', 'slate', 'metal', 'aluminum', 'copper',
].map((v) => ({ value: v, label: toTitleCase(v) }));

function toTitleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

const FACET_DEFS: FacetDef[] = [
  {
    key: 'style',
    label: 'Architectural Style',
    filterKey: 'style',
    isArray: false,
    matchMode: 'contains',
    showMoreAt: 10,
    getVal: (item) =>
      (item.artifacts_json?.style?.primary as string | undefined) ??
      (item.image_metadata?.architecture_style_classified as string | undefined),
  },
  {
    key: 'typology',
    label: 'Building Type',
    filterKey: 'typology',
    isArray: true,
    matchMode: 'contains',
    getVal: (item) => {
      const bt = item.artifacts_json?.building_type as string | undefined;
      if (bt) return bt;
      return item.metadata?.typology as string[] | undefined;
    },
  },
  {
    key: 'material',
    label: 'Primary Material',
    filterKey: 'material',
    metaKey: 'materials',
    isArray: true,
    matchMode: 'contains',
    showMoreAt: 10,
  },
];

function normalizeVal(value: string): string {
  return value.toLowerCase().replace(/_/g, ' ');
}

function normalizeFilterValue(value: string): string {
  return value.toLowerCase();
}

function toggleValue(arr: string[], value: string): string[] {
  const norm = normalizeFilterValue(value);
  const has = arr.some((v) => normalizeVal(v) === norm || v.toLowerCase() === norm);
  if (has) return arr.filter((v) => normalizeVal(v) !== norm && v.toLowerCase() !== norm);
  return [...arr, norm];
}

function isActive(arr: string[], value: string): boolean {
  const norm = normalizeFilterValue(value);
  return arr.some((v) => normalizeVal(v) === norm || v.toLowerCase() === norm);
}

function getItemVal(item: SearchResultItem, f: FacetDef): string | string[] | undefined {
  if (f.getVal) return f.getVal(item);
  if (!f.metaKey) return undefined;
  return item.metadata[f.metaKey] as string | string[] | undefined;
}

function countValuesInCorpus(
  corpus: SearchResultItem[],
  facets: FacetDef[],
  facetValues: Record<string, FacetValue[]>,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  facets.forEach((f) => {
    out[f.key] = {};
    (facetValues[f.key] ?? []).forEach((fv) => { out[f.key][fv.value] = 0; });
    corpus.forEach((item) => {
      const val = getItemVal(item, f);
      const values = Array.isArray(val) ? val : val ? [val] : [];
      const joined = values.map(normalizeVal).join(',');
      (facetValues[f.key] ?? []).forEach((fv) => {
        if (joined.includes(fv.value.toLowerCase())) {
          out[f.key][fv.value] = (out[f.key][fv.value] ?? 0) + 1;
        }
      });
    });
  });
  return out;
}

export default function FilterSidebar({
  filters,
  onChange,
  activeCount,
  corpus = [],
}: FilterSidebarProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    style: true, typology: true, material: true,
  });
  const [showMore, setShowMore] = useState<Record<string, boolean>>({});

  // Facet values: start with fallback, replace when DB data arrives
  const [facetValues, setFacetValues] = useState<Record<string, FacetValue[]>>({
    style: STYLE_FALLBACK,
    typology: BTYPE_FALLBACK,
    material: MATERIAL_FALLBACK,
  });

  useEffect(() => {
    getFacets()
      .then((data) => {
        const toFV = (items: { value: string }[]) =>
          items.map((i) => ({ value: i.value, label: toTitleCase(i.value) }));
        setFacetValues({
          style: data.style.length ? toFV(data.style) : STYLE_FALLBACK,
          typology: data.building_type.length ? toFV(data.building_type) : BTYPE_FALLBACK,
          material: data.material.length ? toFV(data.material) : MATERIAL_FALLBACK,
        });
      })
      .catch(() => { /* keep fallback */ });
  }, []);

  const update = (partial: Partial<FilterState>) =>
    onChange({ ...filters, ...partial });

  const counts = useMemo(
    () => countValuesInCorpus(corpus, FACET_DEFS, facetValues),
    [corpus, facetValues],
  );

  const total = [
    filters.typology.length,
    filters.material.length,
    filters.style.length,
  ].reduce((a, b) => a + b, 0);

  return (
    <aside className="sidebar">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <p className="sidebar-label" style={{ margin: 0 }}>Filters</p>
        {total > 0 && (
          <button className="clear-link" onClick={() => onChange({ ...DEFAULT_FILTERS })}>
            Clear ({total})
          </button>
        )}
      </div>

      {FACET_DEFS.map((f) => {
        const activeVals = filters[f.filterKey] as string[];
        const values = facetValues[f.key] ?? [];
        const cutoff = f.showMoreAt ?? values.length;
        const expanded = showMore[f.key] ?? false;
        const visible = expanded ? values : values.slice(0, cutoff);
        const hiddenCount = values.length - cutoff;

        return (
          <div className="facet-group" key={f.key}>
            <button
              className={`facet-head${open[f.key] ? '' : ' is-closed'}`}
              onClick={() => setOpen((o) => ({ ...o, [f.key]: !o[f.key] }))}
            >
              <span>{f.label}</span>
              <span className="chev"><ChevronDown size={11} /></span>
            </button>
            <AnimatePresence initial={false}>
              {open[f.key] && (
                <motion.div
                  className="facet-list"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  {visible.map((fv) => {
                    const on = isActive(activeVals, fv.value);
                    const count = counts[f.key]?.[fv.value] ?? 0;
                    return (
                      <motion.div
                        key={fv.value}
                        className={`facet-item${on ? ' on' : ''}`}
                        onClick={() =>
                          update({ [f.filterKey]: toggleValue(activeVals, fv.value) } as Partial<FilterState>)
                        }
                        whileTap={{ scale: 0.98 }}
                      >
                        <span className="box" />
                        <span>{fv.label}</span>
                        {count > 0 && <span className="count">{count}</span>}
                      </motion.div>
                    );
                  })}
                  {hiddenCount > 0 && (
                    <button
                      className="clear-link"
                      style={{ marginTop: 4, fontSize: '0.7rem', display: 'block' }}
                      onClick={() => setShowMore((s) => ({ ...s, [f.key]: !expanded }))}
                    >
                      {expanded ? 'Show less' : `+${hiddenCount} more`}
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </aside>
  );
}
