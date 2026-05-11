'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { DEFAULT_FILTERS } from '@/lib/hooks';
import type { FilterState, SearchResultItem } from '@/lib/types';

interface FilterSidebarProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  activeCount: number;
  corpus?: SearchResultItem[];
}

const FACETS = [
  {
    key: 'typology' as const,
    label: 'Typology',
    values: ['House', 'Apartment building', 'School', 'Library', 'Museum', 'Office', 'Cultural center', 'Religious', 'Industrial'],
    filterKey: 'typology' as keyof FilterState,
    metaKey: 'typology' as keyof import('@/lib/types').BuildingMetadata,
    isArray: true,
  },
  {
    key: 'material' as const,
    label: 'Material',
    values: ['Concrete', 'Brick', 'Timber', 'Steel', 'Glass', 'Stone', 'Earth'],
    filterKey: 'material' as keyof FilterState,
    metaKey: 'materials' as keyof import('@/lib/types').BuildingMetadata,
    isArray: true,
  },
  {
    key: 'structure' as const,
    label: 'Structure',
    values: ['Moment frame', 'Load-bearing wall', 'Shell', 'Tensile', 'Space frame'],
    filterKey: 'structural_system' as keyof FilterState,
    metaKey: 'structural_system' as keyof import('@/lib/types').BuildingMetadata,
    isArray: false,
  },
  {
    key: 'climate' as const,
    label: 'Climate',
    values: ['Tropical', 'Hot desert', 'Mediterranean', 'Humid', 'Oceanic', 'Continental', 'Subarctic'],
    filterKey: 'climate_zone' as keyof FilterState,
    metaKey: 'climate_zone' as keyof import('@/lib/types').BuildingMetadata,
    isArray: false,
  },
];

function toggleValue(arr: string[], value: string): string[] {
  const normalized = value.toLowerCase().replace(/\s+/g, '_');
  const has = arr.some((v) => v.toLowerCase() === normalized || v.toLowerCase() === value.toLowerCase());
  if (has) return arr.filter((v) => v.toLowerCase() !== normalized && v.toLowerCase() !== value.toLowerCase());
  return [...arr, normalized];
}

function isActive(arr: string[], value: string): boolean {
  const normalized = value.toLowerCase().replace(/\s+/g, '_');
  return arr.some((v) => v.toLowerCase() === normalized || v.toLowerCase() === value.toLowerCase());
}

export default function FilterSidebar({
  filters,
  onChange,
  activeCount,
  corpus = [],
}: FilterSidebarProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    typology: true, material: true, structure: false, climate: false,
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
        const val = item.metadata[f.metaKey as keyof typeof item.metadata];
        if (Array.isArray(val)) {
          (val as string[]).forEach((x) => {
            const match = f.values.find((v) => v.toLowerCase() === x.toLowerCase());
            if (match) out[f.key][match] = (out[f.key][match] ?? 0) + 1;
          });
        } else if (typeof val === 'string') {
          const match = f.values.find((v) => v.toLowerCase() === val.toLowerCase());
          if (match) out[f.key][match] = (out[f.key][match] ?? 0) + 1;
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
                    const on = isActive(activeVals, v);
                    const count = counts[f.key]?.[v] ?? 0;
                    return (
                      <motion.div
                        key={v}
                        className={`facet-item${on ? ' on' : ''}`}
                        onClick={() =>
                          update({ [f.filterKey]: toggleValue(activeVals, v) } as Partial<FilterState>)
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
