import type { SearchRequest, SearchResponse, Building, FeedbackRequest, UploadResponse } from './types';

export async function searchByImage(file: File): Promise<SearchResponse> {
  const formData = new FormData();
  formData.append('file', file);
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
): Promise<LibraryResponse> {
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit), sort });
  const res = await fetch(`/api/images?${params.toString()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Library fetch failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<LibraryResponse>;
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
