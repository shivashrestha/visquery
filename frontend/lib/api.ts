import type { SearchRequest, SearchResponse, Building, FeedbackRequest, UploadResponse, ArchitecturalArtifacts, EphemeralAnalysis } from './types';

// Nginx default client_max_body_size is 1 MB. Compress before upload to stay safe.
const UPLOAD_MAX_BYTES = 900 * 1024; // 900 KB target
const UPLOAD_MAX_DIM = 1024;

async function compressForUpload(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      if (Math.max(w, h) > UPLOAD_MAX_DIM) {
        const scale = UPLOAD_MAX_DIM / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);

      let quality = 0.85;
      const attempt = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
            if (blob.size <= UPLOAD_MAX_BYTES || quality <= 0.4) {
              resolve(blob);
            } else {
              quality = Math.max(quality - 0.1, 0.4);
              attempt();
            }
          },
          'image/jpeg',
          quality,
        );
      };
      attempt();
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

export async function searchByImage(file: File): Promise<SearchResponse> {
  const blob = await compressForUpload(file);
  const formData = new FormData();
  formData.append('file', blob, 'query.jpg');
  const res = await fetch('/api/search-by-image', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Image search failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<SearchResponse>;
}

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export function getImageUrl(imageId: string): string {
  return `${BACKEND_URL}/api/images/${imageId}/raw`;
}

export async function search(req: SearchRequest): Promise<SearchResponse> {
  const res = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Search failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<SearchResponse>;
}

export async function getBuilding(id: string): Promise<Building> {
  const res = await fetch(`${BACKEND_URL}/api/buildings/${id}`);
  if (!res.ok) {
    throw new Error(`Building not found (${res.status})`);
  }
  return res.json() as Promise<Building>;
}

export async function submitFeedback(req: FeedbackRequest): Promise<void> {
  const payload = {
    query_text: req.query,
    result_image_id: req.image_id,
    rating: req.rating === 'up' ? 1 : -1,
    reason: req.reason ?? null,
    session_id: 'web-ui',
  };
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Feedback failed (${res.status})`);
  }
}

export async function uploadImage(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BACKEND_URL}/api/images/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Image upload failed (${res.status})`);
  }
  return (await res.json()) as UploadResponse;
}

export async function getImageStatus(imageId: string): Promise<{ ingest_status: string; metadata_ready: boolean }> {
  const res = await fetch(`${BACKEND_URL}/api/images/${imageId}/status`);
  if (!res.ok) {
    throw new Error(`Image status failed (${res.status})`);
  }
  return res.json() as Promise<{ ingest_status: string; metadata_ready: boolean }>;
}

export interface LibraryResponse {
  results: import('./types').SearchResultItem[];
  total: number;
  skip: number;
  limit: number;
}

export async function listImages(
  skip = 0,
  limit = 40,
  sort: 'created_at_desc' | 'created_at_asc' | 'year_desc' | 'year_asc' = 'created_at_desc',
  apiEndpoint = '/api/images',
): Promise<LibraryResponse> {
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit), sort });
  const res = await fetch(`${apiEndpoint}?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Library fetch failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<LibraryResponse>;
}

export async function getArtifacts(imageId: string): Promise<{ artifacts: ArchitecturalArtifacts; generated: boolean }> {
  const res = await fetch(`/api/images/${imageId}/artifacts`);
  if (!res.ok) {
    throw new Error(`Artifacts fetch failed (${res.status})`);
  }
  return res.json() as Promise<{ artifacts: ArchitecturalArtifacts; generated: boolean }>;
}

export async function analyzeEphemeral(file: File): Promise<EphemeralAnalysis> {
  const blob = await compressForUpload(file);
  const formData = new FormData();
  formData.append('file', blob, 'image.jpg');
  const res = await fetch('/api/images/analyze-ephemeral', {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Ephemeral analysis failed (${res.status})`);
  }
  const data = (await res.json()) as { analysis: EphemeralAnalysis };
  return data.analysis;
}

export async function chatEphemeral(artifacts: EphemeralAnalysis, message: string): Promise<string> {
  const res = await fetch('/api/images/chat-ephemeral', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifacts, message }),
  });
  if (!res.ok) {
    throw new Error(`Ephemeral chat failed (${res.status})`);
  }
  const data = (await res.json()) as { answer: string };
  return data.answer;
}

export interface FacetValue { value: string; count: number; }
export interface FacetsResponse {
  style: FacetValue[];
  building_type: FacetValue[];
  material: FacetValue[];
}

export async function getFacets(): Promise<FacetsResponse> {
  const res = await fetch('/api/facets');
  if (!res.ok) throw new Error(`Facets failed (${res.status})`);
  return res.json() as Promise<FacetsResponse>;
}

export async function getSimilarImages(imageId: string, k = 6): Promise<SearchResponse> {
  const res = await fetch(`/api/images/${imageId}/similar?k=${k}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Similar images failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<SearchResponse>;
}

export type SegmentModel = 'fastsam';

export interface SegmentObject {
  id: number;
  confidence: number;
  bbox: [number, number, number, number]; // [x1,y1,x2,y2] normalised 0–1
  area_ratio: number;
  color: [number, number, number];        // [R, G, B]
  class_name: string | null;             // null = class-agnostic (FastSAM)
  crop_data_url: string;
}

export interface SegmentResponse {
  segments: SegmentObject[];
  annotated_data_url: string;
  image_width: number;
  image_height: number;
  model_used: string;
}

export async function segmentImage(imageId: string, model: SegmentModel = 'fastsam'): Promise<SegmentResponse> {
  const res = await fetch(`/api/images/${imageId}/segment?model=${model}`, { method: 'POST' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Segmentation failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<SegmentResponse>;
}

export async function segmentImageFromUrl(imageUrl: string, model: SegmentModel = 'fastsam'): Promise<SegmentResponse> {
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error('Could not load image for segmentation');
  const blob = await imgRes.blob();
  const form = new FormData();
  form.append('file', blob, 'image.jpg');
  const res = await fetch(`/api/images/segment-upload?model=${model}`, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Segmentation failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<SegmentResponse>;
}

// ── Component-level segment search ───────────────────────────────────────────
export interface SegmentSearchSegment {
  id: string;
  label: string | null;
  bbox: [number, number, number, number]; // [x, y, w, h] normalised 0–1
  mask_area_ratio: number;
  crop_url: string;
}

export type SegmentSearchResultItem = import('./types').SearchResultItem & {
  segment?: SegmentSearchSegment;
};

export interface SegmentSearchResponse {
  results: SegmentSearchResultItem[];
  query: { label: string | null; crop_url: string | null };
}

/** Search similar components from a crop data URL (panel "Find similar"). */
export async function searchBySegmentCrop(
  cropDataUrl: string,
  k = 12,
  excludeImageId?: string,
): Promise<SegmentSearchResponse> {
  const blob = await (await fetch(cropDataUrl)).blob();
  const form = new FormData();
  form.append('file', blob, 'crop.jpg');
  if (excludeImageId) form.append('exclude_image_id', excludeImageId);
  const res = await fetch(`/api/search/by-segment?k=${k}`, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Segment search failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<SegmentSearchResponse>;
}

/** Search similar components from an already-indexed segment reference. */
export async function searchBySegmentRef(
  imageId: string,
  segmentIndex: number,
  k = 12,
): Promise<SegmentSearchResponse> {
  const form = new FormData();
  form.append('image_id', imageId);
  form.append('segment_index', String(segmentIndex));
  const res = await fetch(`/api/search/by-segment?k=${k}`, { method: 'POST', body: form });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Segment search failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<SegmentSearchResponse>;
}

// ── Precedent reports ─────────────────────────────────────────────────────────
export interface ReportSection {
  heading: string;
  body_md: string;
  image_refs: number[];
}

export interface ReportImageEntry {
  ref: number;
  image_id: string | null;
  title: string;
  image_url: string | null;
}

export interface PrecedentReport {
  report_id: string;
  cached: boolean;
  sections: ReportSection[];
  images: ReportImageEntry[];
  focus: string | null;
  generated_at: string;
}

export type ReportFocus = 'materials' | 'structure' | 'typology' | 'climate';

/**
 * Generate a comparative precedent report from selected result items.
 * Stored images go first, ephemeral (tryout) items after — IMG-n refs follow
 * that order, so callers should map refs against the returned `images` list.
 */
export async function generatePrecedentReport(
  items: import('./types').SearchResultItem[],
  focus?: ReportFocus,
): Promise<PrecedentReport> {
  const stored = items.filter((i) => !i.ephemeral_artifacts && !i.image_id.startsWith('ephemeral-'));
  const ephemeral = items.filter((i) => i.ephemeral_artifacts || i.image_id.startsWith('ephemeral-'));
  const res = await fetch('/api/reports/precedent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_ids: stored.map((i) => i.image_id),
      ephemeral_items: ephemeral.map((i) => i.ephemeral_artifacts ?? {}),
      focus: focus ?? null,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Report generation failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<PrecedentReport>;
}

export function reportPdfUrl(reportId: string): string {
  return `/api/reports/${reportId}/pdf`;
}

// ── Ask the Archive — RAG chat over ingested documents ───────────────────────
export interface ArchiveSource {
  source_id: string;
  title: string;
  file_type: string;
  page_count: number | null;
  chunk_count: number;
  index_status: 'queued' | 'indexing' | 'ready' | 'failed';
  index_error: string | null;
}

export interface ArchiveStatus {
  has_documents: boolean;
  document_count: number;
  sources: ArchiveSource[];
}

export interface ArchiveCitation {
  source_id: string;
  title: string;
  page: number;
  snippet: string;
}

export interface ArchiveChatResponse {
  answer: string;
  citations: ArchiveCitation[];
}

/** Studio-gated: returns null for anonymous users (401) or any error. */
export async function getArchiveStatus(): Promise<ArchiveStatus | null> {
  try {
    const res = await fetch('/api/archive/status', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as ArchiveStatus;
  } catch {
    return null;
  }
}

export async function chatArchive(
  message: string,
  history: { who: 'user' | 'ai'; text: string }[] = [],
  sourceIds?: string[],
): Promise<ArchiveChatResponse> {
  const res = await fetch('/api/archive/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      history,
      source_ids: sourceIds && sourceIds.length > 0 ? sourceIds : null,
    }),
  });
  if (!res.ok) {
    throw new Error(`Archive chat failed (${res.status})`);
  }
  return (await res.json()) as ArchiveChatResponse;
}

export async function deleteArchiveSource(sourceId: string): Promise<void> {
  const res = await fetch(`/api/archive/sources/${encodeURIComponent(sourceId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Document delete failed (${res.status})`);
  }
}

export async function chatImage(imageId: string, message: string): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/api/images/${imageId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    throw new Error(`Image chat failed (${res.status})`);
  }
  const data = (await res.json()) as { answer: string };
  return data.answer;
}
