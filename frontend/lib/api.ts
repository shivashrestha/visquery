import type { SearchRequest, SearchResponse, Building, FeedbackRequest } from './types';

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000';

export function getImageUrl(imageId: string): string {
  return `${BACKEND_URL}/images/${imageId}/raw`;
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
  const res = await fetch(`${BACKEND_URL}/buildings/${id}`);
  if (!res.ok) {
    throw new Error(`Building not found (${res.status})`);
  }
  return res.json() as Promise<Building>;
}

export async function submitFeedback(req: FeedbackRequest): Promise<void> {
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`Feedback failed (${res.status})`);
  }
}

export async function uploadImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BACKEND_URL}/images/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Image upload failed (${res.status})`);
  }
  const data = (await res.json()) as { image_id: string };
  return data.image_id;
}
