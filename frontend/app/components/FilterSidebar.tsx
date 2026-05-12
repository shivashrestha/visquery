'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { DEFAULT_FILTERS } from '@/lib/hooks';
import type { FilterState, SearchResultItem, BuildingMetadata } from '@/lib/types';

interface FilterSidebarProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  activeCount: number;
  corpus?: SearchResultItem[];
}

type Facet = {
  key: string;
  label: string;
  values: string[];
  filterKey: keyof FilterState;
  isArray: boolean;
  matchMode: 'exact' | 'contains';
  metaKey?: keyof BuildingMetadata;
  getVal?: (item: SearchResultItem) => string | string[] | undefined;
};

const FACETS: Facet[] = [
  {
    key: 'style',
    label: 'Architectural Style',
    values: [
      'Art Deco', 'Art Nouveau', 'Baroque', 'Bauhaus', 'Beaux-Arts',
      'Byzantine', 'Chicago School', 'Deconstructivism', 'Gothic',
      'Greek Revival', 'International Style', 'Palladian',
      'Postmodern', 'Romanesque',
    ],
    filterKey: 'style',
    isArray: false,
    matchMode: 'contains',
    getVal: (item) => item.image_metadata?.architecture_style_classified as string | undefined,
  },
  {
    key: 'typology',
    label: 'Programme / Typology',
    values: [
      'House / Villa', 'Apartment / Housing', 'Office',
      'Museum / Gallery', 'Library', 'School / University',
      'Religious / Sacred', 'Government / Civic', 'Commercial / Retail',
      'Hotel / Hospitality', 'Industrial / Warehouse',
      'Cultural / Theater', 'Transport / Station', 'Monastery / Abbey',
      'Hospital / Healthcare', 'Monument / Memorial',
    ],
    filterKey: 'typology',
    metaKey: 'typology',
    isArray: true,
    matchMode: 'contains',
  },
  {
    key: 'material',
    label: 'Primary Material',
    values: [
      'Concrete', 'Brick', 'Masonry', 'Timber', 'Steel',
      'Glass', 'Stone', 'Earth / Adobe', 'Aluminum', 'Copper',
    ],
    filterKey: 'material',
    metaKey: 'materials',
    isArray: true,
    matchMode: 'contains',
  },
  {
    key: 'structure',
    label: 'Structural System',
    values: [
      'Moment frame', 'Load-bearing wall', 'Shell / Vault',
      'Tensile / Membrane', 'Space frame', 'Diagrid', 'Hybrid',
    ],
    filterKey: 'structural_system',
    metaKey: 'structural_system',
    isArray: false,
    matchMode: 'contains',
  },
  {
    key: 'climate',
    label: 'Climate Zone',
    values: [
      'Tropical', 'Hot desert', 'Mediterranean', 'Humid subtropical',
      'Oceanic', 'Continental', 'Subarctic', 'Alpine',
    ],
    filterKey: 'climate_zone',
    metaKey: 'climate_zone',
    isArray: false,
    matchMode: 'contains',
  },
];

function normalizeFilterValue(value: string, facetKey: string): string {
  // contains-matched fields sent as-is (lowercase) so backend ILIKE works correctly
  const containsFacets = ['style', 'structure', 'climate', 'typology', 'material'];
  if (containsFacets.includes(facetKey)) return value.toLowerCase();
  return value.toLowerCase().replace(/\s+/g, '_');
}

function toggleValue(arr: string[], value: string, facetKey: string): string[] {
  const normalized = normalizeFilterValue(value, facetKey);
  const has = arr.some((v) => v.toLowerCase() === normalized || v.toLowerCase() === value.toLowerCase());
  if (has) return arr.filter((v) => v.toLowerCase() !== normalized && v.toLowerCase() !== value.toLowerCase());
  return [...arr, normalized];
}

function isActive(arr: string[], value: string, facetKey: string): boolean {
  const normalized = normalizeFilterValue(value, facetKey);
  return arr.some((v) => v.toLowerCase() === normalized || v.toLowerCase() === value.toLowerCase());
}

function getItemVal(item: SearchResultItem, f: Facet): string | string[] | undefined {
  if (f.getVal) return f.getVal(item);
  if (!f.metaKey) return undefined;
  return item.metadata[f.metaKey] as string | string[] | undefined;
}

export default function FilterSidebar({
  filters,
  onChange,
  activeCount,
  corpus = [],
}: FilterSidebarProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    style: true, typology: true, material: true, structure: false, climate: false,
  });

  const update = (partial: Partial<FilterState>) =>
    onChange({ ...filters, ...partial });

  // Compute facet counts from corpus
  const counts = useMemo(() => {
    const out: Record<string, Record<string, number>> = {};
    FACETS.forEach((f) => {
      out[f.key] = {};
      f.values.forEach((v) => { out[f.key][v] = 0; });
      corpus.forEach((item) => {
        const val = getItemVal(item, f);
        if (Array.isArray(val)) {
          const joined = (val as string[]).join(',').toLowerCase();
          f.values.forEach((v) => {
            if (f.matchMode === 'contains') {
              if (joined.includes(v.toLowerCase())) {
                out[f.key][v] = (out[f.key][v] ?? 0) + 1;
              }
            } else {
              if ((val as string[]).some((x) => x.toLowerCase() === v.toLowerCase())) {
                out[f.key][v] = (out[f.key][v] ?? 0) + 1;
              }
            }
          });
        } else if (typeof val === 'string') {
          const valLower = val.toLowerCase();
          f.values.forEach((v) => {
            if (f.matchMode === 'contains') {
              if (valLower.includes(v.toLowerCase())) {
                out[f.key][v] = (out[f.key][v] ?? 0) + 1;
              }
            } else if (v.toLowerCase() === valLower) {
              out[f.key][v] = (out[f.key][v] ?? 0) + 1;
            }
          });
        }
      });
    });
    return out;
  }, [corpus]);

  const total = [
    filters.typology.length,
    filters.material.length,
    filters.structural_system.length,
    filters.climate_zone.length,
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

      {FACETS.map((f) => {
        const activeVals = filters[f.filterKey] as string[];
        return (
          <div className="facet-group" key={f.key}>
            <button
              className={`facet-head${open[f.key] ? '' : ' is-closed'}`}
              onClick={() => setOpen((o) => ({ ...o, [f.key]: !o[f.key] }))}
            >
              <span>{f.label}</span>
              <span className="chev">
                <ChevronDown size={11} />
              </span>
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
                  {f.values.map((v) => {
                    const on = isActive(activeVals, v, f.key);
                    const count = counts[f.key]?.[v] ?? 0;
                    return (
                      <motion.div
                        key={v}
                        className={`facet-item${on ? ' on' : ''}`}
                        onClick={() =>
                          update({ [f.filterKey]: toggleValue(activeVals, v, f.key) } as Partial<FilterState>)
                        }
                        whileTap={{ scale: 0.98 }}
                      >
                        <span className="box" />
                        <span>{v}</span>
                        {count > 0 && <span className="count">{count}</span>}
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

    </aside>
  );
}
