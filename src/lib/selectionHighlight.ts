import type { PageData, SelectionState } from '../types';

/** Main page: selected component only. Other pages: all linked components on that page. */
export function getHighlightedIdsForPage(
  page: PageData,
  selection: SelectionState,
  isCurrent: boolean,
): Set<string> {
  if (isCurrent) {
    return page.components.some((c) => c.id === selection.componentId)
      ? new Set([selection.componentId])
      : new Set();
  }

  const ids = new Set<string>();
  for (const c of page.components) {
    if (selection.relatedIds.has(c.id)) {
      ids.add(c.id);
    }
  }
  return ids;
}

export function getFirstHighlightedComponentId(
  page: PageData,
  selection: SelectionState,
  isCurrent: boolean,
): string | null {
  const ids = getHighlightedIdsForPage(page, selection, isCurrent);
  for (const c of page.components) {
    if (ids.has(c.id)) return c.id;
  }
  return null;
}
