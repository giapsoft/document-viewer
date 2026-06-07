import type { PageData, SelectionState } from '../types';

export function pageHasHighlightedComponents(
  page: PageData,
  selection: SelectionState | null,
  currentPageFile: string | null,
): boolean {
  if (!selection) return false;
  const isCurrent = currentPageFile === page.fileName;
  return getHighlightedIdsForPage(page, selection, isCurrent).size > 0;
}

/** Current page: primary selection, or linked components when primary is elsewhere. Other pages: linked components. */
export function getHighlightedIdsForPage(
  page: PageData,
  selection: SelectionState,
  isCurrent: boolean,
): Set<string> {
  if (isCurrent) {
    if (page.components.some((c) => c.id === selection.componentId)) {
      return new Set([selection.componentId]);
    }

    const ids = new Set<string>();
    for (const c of page.components) {
      if (selection.relatedIds.has(c.id)) {
        ids.add(c.id);
      }
    }
    return ids;
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

/** Linked components on this page in document order (for in-panel prev/next). */
export function getOrderedHighlightedIdsForPage(
  page: PageData,
  selection: SelectionState,
): string[] {
  const ids: string[] = [];
  for (const c of page.components) {
    if (selection.relatedIds.has(c.id)) {
      ids.push(c.id);
    }
  }
  return ids;
}

/** Split highlighted ids into runs that are adjacent in the page component list. */
export function groupConsecutiveHighlightedIds(
  page: PageData,
  orderedIds: string[],
): string[][] {
  if (orderedIds.length === 0) return [];

  const indexById = new Map(page.components.map((c, i) => [c.id, i]));
  const groups: string[][] = [];
  let current: string[] = [orderedIds[0]!];

  for (let i = 1; i < orderedIds.length; i++) {
    const prevIdx = indexById.get(orderedIds[i - 1]!);
    const currIdx = indexById.get(orderedIds[i]!);
    if (prevIdx !== undefined && currIdx === prevIdx + 1) {
      current.push(orderedIds[i]!);
    } else {
      groups.push(current);
      current = [orderedIds[i]!];
    }
  }
  groups.push(current);
  return groups;
}

/** First component of each consecutive highlight run — scroll targets for panel nav. */
export function getHighlightNavTargetsForPage(
  page: PageData,
  selection: SelectionState,
): string[] {
  const ordered = getOrderedHighlightedIdsForPage(page, selection);
  return groupConsecutiveHighlightedIds(page, ordered).map((group) => group[0]!);
}
