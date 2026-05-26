export const BINDING_STORAGE_KEY = 'movieTrackerBinding';
export const API_BASE_URL_STORAGE_KEY = 'movieTrackerApiBaseUrl';
export const DEFAULT_API_BASE_URL = 'http://89.23.99.104';

function storageGet(storageArea, keys) {
  return new Promise((resolve) => {
    storageArea.get(keys, (result) => resolve(result ?? {}));
  });
}

export function normalizeApiBaseUrl(value) {
  if (typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    if (!/^https?:$/i.test(parsed.protocol)) return '';
    return parsed.href.replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export async function readApiBaseUrl() {
  const storageArea = globalThis.chrome?.storage?.local;
  if (!storageArea) {
    return DEFAULT_API_BASE_URL;
  }

  const result = await storageGet(storageArea, [API_BASE_URL_STORAGE_KEY]);
  return normalizeApiBaseUrl(result[API_BASE_URL_STORAGE_KEY]) || DEFAULT_API_BASE_URL;
}
