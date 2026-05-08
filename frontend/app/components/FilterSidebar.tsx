'use client';

import { useId } from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as Slider from '@radix-ui/react-slider';
import { ChevronDown, Check, X } from 'lucide-react';
import { DEFAULT_FILTERS } from '@/lib/hooks';
import type { FilterState } from '@/lib/types';
import {
  TYPOLOGY_OPTIONS,
  MATERIAL_OPTIONS,
  STRUCTURAL_SYSTEM_OPTIONS,
  CLIMATE_ZONE_OPTIONS,
} from '@/lib/types';

interface FilterSidebarProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  activeCount: number;
}

function FilterSection({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Collapsible.Root defaultOpen className="border-b border-border">
      <Collapsible.Trigger className="flex items-center justify-between w-full py-3 text-left group">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider font-medium text-muted group-hover:text-near-black transition-colors">
            {title}
          </span>
          {badge !== undefined && badge > 0 && (
            <span className="text-2xs bg-accent text-white px-1.5 py-0.5 rounded-full font-medium">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown className="w-3.5 h-3.5 text-muted group-data-[state=open]:rotate-180 transition-transform" />
      </Collapsible.Trigger>
      <Collapsible.Content className="pb-3 space-y-1.5">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function CheckboxItem({
  value,
  label,
  checked,
  onChange,
}: {
  value: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2.5">
      <Checkbox.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        className="w-3.5 h-3.5 border border-border rounded-sm flex-shrink-0 flex items-center justify-center data-[state=checked]:bg-accent data-[state=checked]:border-accent transition-colors"
      >
        <Checkbox.Indicator>
          <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
        </Checkbox.Indicator>
      </Checkbox.Root>
      <label
        htmlFor={id}
        className="text-sm text-near-black/80 cursor-pointer hover:text-near-black transition-colors select-none"
      >
        {label}
      </label>
    </div>
  );
}

function toggleValue(arr: string[], value: string): string[] {
  return arr.includes(value)
    ? arr.filter((v) => v !== value)
    : [...arr, value];
}

export default function FilterSidebar({
  filters,
  onChange,
  activeCount,
}: FilterSidebarProps) {
  const update = (partial: Partial<FilterState>) =>
    onChange({ ...filters, ...partial });

  return (
    <div className="py-4 pr-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider font-medium text-muted">
          Filters
        </span>
        {activeCount > 0 && (
          <button
            onClick={() => onChange({ ...DEFAULT_FILTERS })}
            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <X className="w-3 h-3" />
            Clear all
          </button>
        )}
      </div>

      <FilterSection
        title="Typology"
        badge={filters.typology.length}
      >
        {TYPOLOGY_OPTIONS.map((opt) => (
          <CheckboxItem
            key={opt.value}
            value={opt.value}
            label={opt.label}
            checked={filters.typology.includes(opt.value)}
            onChange={() =>
              update({ typology: toggleValue(filters.typology, opt.value) })
            }
          />
        ))}
      </FilterSection>

      <FilterSection title="Material" badge={filters.material.length}>
        {MATERIAL_OPTIONS.map((opt) => (
          <CheckboxItem
            key={opt.value}
            value={opt.value}
            label={opt.label}
            checked={filters.material.includes(opt.value)}
            onChange={() =>
              update({ material: toggleValue(filters.material, opt.value) })
            }
          />
        ))}
      </FilterSection>

      <FilterSection
        title="Structure"
        badge={filters.structural_system.length}
      >
        {STRUCTURAL_SYSTEM_OPTIONS.map((opt) => (
          <CheckboxItem
            key={opt.value}
            value={opt.value}
            label={opt.label}
            checked={filters.structural_system.includes(opt.value)}
            onChange={() =>
              update({
                structural_system: toggleValue(
                  filters.structural_system,
                  opt.value,
                ),
              })
            }
          />
        ))}
      </FilterSection>

      <FilterSection title="Climate" badge={filters.climate_zone.length}>
        {CLIMATE_ZONE_OPTIONS.map((opt) => (
          <CheckboxItem
            key={opt.value}
            value={opt.value}
            label={opt.label}
            checked={filters.climate_zone.includes(opt.value)}
            onChange={() =>
              update({
                climate_zone: toggleValue(filters.climate_zone, opt.value),
              })
            }
          />
        ))}
      </FilterSection>

      <FilterSection
        title="Period"
        badge={
          filters.period[0] !== 0 || filters.period[1] !== 2024 ? 1 : 0
        }
      >
        <div className="px-1 pt-2 pb-1">
          <Slider.Root
            min={0}
            max={2024}
            step={1}
            value={filters.period}
            onValueChange={(val) =>
              update({ period: val as [number, number] })
            }
            className="relative flex items-center select-none touch-none w-full h-5"
          >
            <Slider.Track className="bg-border relative grow rounded-full h-0.5">
              <Slider.Range className="absolute bg-accent rounded-full h-full" />
            </Slider.Track>
            <Slider.Thumb
              className="block w-3.5 h-3.5 bg-white border-2 border-accent rounded-full shadow focus:outline-none focus:ring-2 focus:ring-accent/40"
              aria-label="Period start"
            />
            <Slider.Thumb
              className="block w-3.5 h-3.5 bg-white border-2 border-accent rounded-full shadow focus:outline-none focus:ring-2 focus:ring-accent/40"
              aria-label="Period end"
            />
          </Slider.Root>
          <div className="flex justify-between mt-2 text-xs text-muted">
            <span>{filters.period[0] === 0 ? 'Any' : filters.period[0]}</span>
            <span>{filters.period[1]}</span>
          </div>
        </div>
      </FilterSection>

      <FilterSection title="Country" badge={filters.location_country ? 1 : 0}>
        <input
          type="text"
          value={filters.location_country}
          onChange={(e) => update({ location_country: e.target.value })}
          placeholder="e.g. Finland"
          list="country-list"
          className="w-full text-sm border border-border rounded-sm px-2.5 py-1.5 bg-white outline-none focus:border-accent/60 placeholder:text-muted/50 transition-colors"
        />
        <datalist id="country-list">
          {COUNTRIES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </FilterSection>
    </div>
  );
}

const COUNTRIES = [
  'Australia',
  'Austria',
  'Belgium',
  'Brazil',
  'Canada',
  'Chile',
  'China',
  'Czech Republic',
  'Denmark',
  'Egypt',
  'Finland',
  'France',
  'Germany',
  'Ghana',
  'Greece',
  'India',
  'Iran',
  'Israel',
  'Italy',
  'Japan',
  'Mexico',
  'Morocco',
  'Netherlands',
  'Norway',
  'Peru',
  'Poland',
  'Portugal',
  'Russia',
  'South Korea',
  'Spain',
  'Sweden',
  'Switzerland',
  'Turkey',
  'United Kingdom',
  'United States',
];
