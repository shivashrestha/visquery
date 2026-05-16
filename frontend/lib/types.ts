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

export interface ArtifactRelationship {
  source: string;
  relation: string;
  target: string;
}

export interface ArchitecturalArtifacts {
  style?: {
    primary?: string;
    secondary?: string[];
    confidence?: number;
  };
  architectural_elements?: {
    structural?: string[];
    facade?: string[];
    ornamental?: string[];
  };
  materials?: string[];
  spatial_features?: string[];
  relationships?: ArtifactRelationship[];
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
  artifacts_json?: ArchitecturalArtifacts | null;
  tags?: string[];
  ephemeral_artifacts?: EphemeralAnalysis;
}

export interface EphemeralAnalysis {
  title?: string;
  description?: string;
  building_type?: string;
  style?: {
    primary?: string;
    secondary?: string[];
    confidence?: number;
    style_evidence?: string[];
    emergent_tags?: string[];
  };
  architectural_elements?: {
    structural?: string[];
    facade?: string[];
    roofing?: string[];
    openings?: string[];
    ornamental?: string[];
    circulation?: string[];
  };
  materials?: string[];
  spatial_features?: Record<string, string[]> | string[];
  environment?: {
    setting?: string[];
    urban_context?: string[];
    landscape?: string[];
    climate_indicators?: string[];
  };
  relationships?: Array<{ source: string; relation: string; target: string }>;
  semantic_keywords?: string[];
  retrieval_tags?: string[];
  architecture_style_classified?: string;
  architecture_style_top?: [string, number][];
  vlm_unavailable?: boolean;
  [key: string]: unknown;
}

export interface SearchResponse {
  results: SearchResultItem[];
  analysis?: EphemeralAnalysis;
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

