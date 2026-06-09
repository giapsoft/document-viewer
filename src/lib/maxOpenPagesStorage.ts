const STORAGE_KEY = 'docs-viewer-max-open-pages';

export const DEFAULT_MAX_OPEN_PAGES = 2;
export const MIN_MAX_OPEN_PAGES = 1;
export const MAX_MAX_OPEN_PAGES = 8;

export function clampMaxOpenPages(value: number): number {
  return Math.max(
    MIN_MAX_OPEN_PAGES,
    Math.min(MAX_MAX_OPEN_PAGES, Math.round(value)),
  );
}

export function getStoredMaxOpenPages(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MAX_OPEN_PAGES;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return DEFAULT_MAX_OPEN_PAGES;
    return clampMaxOpenPages(parsed);
  } catch {
    return DEFAULT_MAX_OPEN_PAGES;
  }
}

export function persistMaxOpenPages(value: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(clampMaxOpenPages(value)));
  } catch {
    // ignore storage failures
  }
}
