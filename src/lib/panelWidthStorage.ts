import type { LoadedProject } from '../types';

const STORAGE_KEY_PREFIX = 'docs-viewer-panel-widths-';

export const MIN_PAGE_PANEL_WIDTH = 200;

/** Must match `.page-panel-resize-handle { width: 6px }` in CSS. */
export const PANEL_RESIZE_HANDLE_WIDTH = 6;

export function resolvePanelWidthProjectKey(project: LoadedProject): string {
  if (project.remoteDocId) return project.remoteDocId;
  const pageKey = project.pages
    .map((page) => page.fileName)
    .sort()
    .join('|');
  return pageKey || 'draft';
}

function storageKey(projectKey: string): string {
  return `${STORAGE_KEY_PREFIX}${projectKey}`;
}

export function loadPanelWidths(projectKey: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(storageKey(projectKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, number> = {};
    for (const [pageFile, width] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof width !== 'number' || !Number.isFinite(width)) continue;
      if (width < MIN_PAGE_PANEL_WIDTH) continue;
      result[pageFile] = Math.round(width);
    }
    return result;
  } catch {
    return {};
  }
}

export function persistPanelWidths(
  projectKey: string,
  widths: Record<string, number>,
): void {
  try {
    const sanitized: Record<string, number> = {};
    for (const [pageFile, width] of Object.entries(widths)) {
      if (!Number.isFinite(width) || width < MIN_PAGE_PANEL_WIDTH) continue;
      sanitized[pageFile] = Math.round(width);
    }
    localStorage.setItem(storageKey(projectKey), JSON.stringify(sanitized));
  } catch {
    // ignore storage failures
  }
}
