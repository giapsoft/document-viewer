import type { AppState, PanelState, RelationsFile } from '../types';
import { buildPanelsForPages } from './index';
import { getStoredPageOrder, orderPageFilesBySidebar } from './pageOrder';
import { buildSelectionForComponent } from './selectionNavigation';

export function getPinnedPages(relations: RelationsFile): string[] {
  return relations.pinnedPages ?? [];
}

export function hasPinnedPages(relations: RelationsFile): boolean {
  return getPinnedPages(relations).length > 0;
}

export function shouldAutoScrollPanels(state: AppState): boolean {
  if (!state.project) return true;
  return !hasPinnedPages(state.project.relations);
}

export function togglePinnedPage(
  pinnedPages: string[] | undefined,
  fileName: string,
): string[] {
  const list = [...(pinnedPages ?? [])];
  const idx = list.indexOf(fileName);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(fileName);
  return list;
}

export function removePinnedPage(
  pinnedPages: string[] | undefined,
  fileName: string,
): string[] {
  return (pinnedPages ?? []).filter((f) => f !== fileName);
}

/** When any page is pinned: panel list is exactly the pinned pages (nothing else). */
export function orderedPagesForPinMode(
  pinnedPages: string[],
  validPageFiles: Set<string>,
  sidebarOrder: string[],
): string[] {
  const pages: string[] = [];
  for (const pin of pinnedPages) {
    if (validPageFiles.has(pin)) pages.push(pin);
  }
  return orderPageFilesBySidebar(pages, sidebarOrder);
}

/** Merge pinned pages, then sort everything by sidebar order. */
export function mergePinnedPagesIntoOrder(
  orderedPages: string[],
  _currentPage: string,
  pinnedPages: string[],
  validPageFiles: Set<string>,
  sidebarOrder: string[],
): string[] {
  const combined = new Set(orderedPages);
  for (const pin of pinnedPages) {
    if (!validPageFiles.has(pin)) continue;
    combined.add(pin);
  }
  return orderPageFilesBySidebar(combined, sidebarOrder);
}

export function resolveVisiblePageFiles(
  basePages: string[],
  currentPage: string,
  pinnedPages: string[],
  validPageFiles: Set<string>,
  sidebarOrder: string[],
  pinModeActive: boolean,
): string[] {
  if (pinModeActive) {
    return orderedPagesForPinMode(pinnedPages, validPageFiles, sidebarOrder);
  }
  return mergePinnedPagesIntoOrder(
    basePages,
    currentPage,
    pinnedPages,
    validPageFiles,
    sidebarOrder,
  );
}

export function validPageFileSet(state: AppState): Set<string> {
  return new Set(state.project?.pages.map((p) => p.fileName) ?? []);
}

export function buildPanelsForPinList(state: AppState): PanelState[] {
  if (!state.project) return [];

  const validFiles = validPageFileSet(state);
  const pinned = getPinnedPages(state.project.relations);
  const sidebarOrder = getStoredPageOrder(
    state.project.relations,
    state.project.pages.map((p) => p.fileName),
  );
  const ordered = orderedPagesForPinMode(pinned, validFiles, sidebarOrder);
  if (ordered.length === 0) return [];

  const focusPage =
    state.currentPage && ordered.includes(state.currentPage)
      ? state.currentPage
      : ordered[0];

  return buildPanelsForPages(ordered, focusPage);
}

export function buildPanelsForPageContext(
  state: AppState,
  currentPage: string | null,
): PanelState[] {
  if (!state.project) {
    return currentPage ? [{ pageFile: currentPage, expanded: true }] : [];
  }

  if (hasPinnedPages(state.project.relations)) {
    return buildPanelsForPinList(state);
  }

  if (!currentPage) return [];

  const validFiles = validPageFileSet(state);
  const pinned = getPinnedPages(state.project.relations);
  const sidebarOrder = getStoredPageOrder(
    state.project.relations,
    state.project.pages.map((p) => p.fileName),
  );
  const ordered = resolveVisiblePageFiles(
    [currentPage],
    currentPage,
    pinned,
    validFiles,
    sidebarOrder,
    false,
  );
  return buildPanelsForPages(ordered, currentPage);
}

/** Rebuild panels from selection (if any) or current page, including pinned secondaries. */
export function refreshPanelsWithPins(state: AppState): PanelState[] | null {
  if (!state.project) return null;

  if (hasPinnedPages(state.project.relations)) {
    return buildPanelsForPinList(state);
  }

  if (!state.currentPage) return null;

  if (state.selection && !state.linkMode) {
    const pageFile =
      state.project.index.componentToPage.get(state.selection.componentId) ??
      state.currentPage;
    const applied = buildSelectionForComponent(
      state,
      state.selection.componentId,
      pageFile,
    );
    return applied?.panels ?? null;
  }

  return buildPanelsForPageContext(state, state.currentPage);
}
