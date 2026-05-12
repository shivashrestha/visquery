export interface SearchRequest {
  query: string;
  image_id?: string;
  filters?: {
    period?: [number, number];
    typology?: string[];
    material?: string[];
    country?: string;
    structural_system?: string[];
    climate_zone?: string[];
    style?: string[];
  };
  config?: string;
}

export interface BuildingMetadata {
  name?: string;
  architect?: string;
  year_built?: number;
  location_country?: string;
  location_city?: string;
  typology?: string[];
  materials?: string[];
  structural_system?: string;
  climate_zone?: string;
  description?: string;
}

export interface SearchResultItem {
  building_id: string | null;
  image_id: string;
  score: number;
  explanation?: string;
  metadata: BuildingMetadata;
  source: {
    url: string;
    license: string;
    photographer?: string;
    title?: string;
  };
  image_url: string;
  image_metadata?: Record<string, unknown>;
  tags?: string[];
}

export interface SearchResponse {
  results: SearchResultItem[];
  rewritten_query?: {
    visual_descriptions: string[];
    filters: Record<string, unknown>;
  };
  latency_ms: {
    total: number;
    [key: string]: number;
  };
}

export interface Building {
  id: string;
  name: string;
  architect?: string;
  year_built?: number;
  location_country?: string;
  location_city?: string;
  typology?: string[];
  materials?: string[];
  structural_system?: string;
  climate_zone?: string;
  description?: string;
  images: Array<{
    id: string;
    storage_path: string;
    caption?: string;
    photographer?: string;
    license: string;
    source: { url: string; title: string; license: string };
  }>;
}

export interface FeedbackRequest {
  image_id: string;
  building_id?: string;
  query: string;
  rating: 'up' | 'down';
  reason?: string;
}

export interface UploadResponse {
  image_id: string;
  metadata_job_id?: string;
  ingest_status: string;
}

export type FilterState = {
  period: [number, number];
  typology: string[];
  material: string[];
  structural_system: string[];
  climate_zone: string[];
  style: string[];
  location_country: string;
};

export const TYPOLOGY_OPTIONS = [
  { value: 'house', label: 'House' },
  { value: 'apartment_building', label: 'Apartment building' },
  { value: 'school', label: 'School' },
  { value: 'library', label: 'Library' },
  { value: 'museum', label: 'Museum' },
  { value: 'office', label: 'Office' },
  { value: 'cultural_center', label: 'Cultural center' },
  { value: 'religious', label: 'Religious' },
  { value: 'industrial', label: 'Industrial' },
] as const;

export const MATERIAL_OPTIONS = [
  { value: 'concrete', label: 'Concrete' },
  { value: 'brick', label: 'Brick' },
  { value: 'timber', label: 'Timber' },
  { value: 'steel', label: 'Steel' },
  { value: 'glass', label: 'Glass' },
  { value: 'stone', label: 'Stone' },
  { value: 'earth', label: 'Earth' },
] as const;

export const STRUCTURAL_SYSTEM_OPTIONS = [
  { value: 'moment_frame', label: 'Moment frame' },
  { value: 'load_bearing_wall', label: 'Load-bearing wall' },
  { value: 'shell', label: 'Shell' },
  { value: 'tensile', label: 'Tensile' },
  { value: 'space_frame', label: 'Space frame' },
] as const;

export const CLIMATE_ZONE_OPTIONS = [
  { value: 'tropical', label: 'Tropical' },
  { value: 'hot_desert', label: 'Hot desert' },
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'humid', label: 'Humid' },
  { value: 'oceanic', label: 'Oceanic' },
  { value: 'continental', label: 'Continental' },
  { value: 'subarctic', label: 'Subarctic' },
] as const;
