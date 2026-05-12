import type { SearchResultItem } from './types';

export type PersonalImage = {
  id: string;
  name: string;
  dataUrl: string;
  addedAt: number;
};

const KEY = 'visquery_personal_images';

export function getPersonalImages(): PersonalImage[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as PersonalImage[];
  } catch {
    return [];
  }
}

export function savePersonalImage(img: PersonalImage): void {
  const images = getPersonalImages();
  images.unshift(img);
  localStorage.setItem(KEY, JSON.stringify(images));
}

export function personalImageToResultItem(img: PersonalImage): SearchResultItem {
  return {
    image_id: img.id,
    building_id: null,
    score: 1,
    image_url: img.dataUrl,
    source: { url: '', license: 'personal', title: img.name },
    metadata: {},
    tags: [],
  };
}
