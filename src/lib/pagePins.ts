import type { AppState, PanelState, RelationsFile } from '../types';
import { buildPanelsForPages } from './index';
import { getStoredPageOrder, orderPageFilesBySidebar } from './pageOrder';
import { buildSelectionForComponent } from './selectionNavigation';

export function getPinnedPages(relations: RelationsFile): string[] {
  return relations.pinnedPages ?? [];
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

export function validPageFileSet(state: AppState): Set<string> {
  return new Set(state.project?.pages.map((p) => p.fileName) ?? []);
}

export function buildPanelsForPageContext(
  state: AppState,
  currentPage: string,
): PanelState[] {
  if (!state.project) return [{ pageFile: currentPage, expanded: true }];

  const validFiles = validPageFileSet(state);
  const pinned = getPinnedPages(state.project.relations);
  const sidebarOrder = getStoredPageOrder(
    state.project.relations,
    state.project.pages.map((p) => p.fileName),
  );
  const ordered = mergePinnedPagesIntoOrder(
    [currentPage],
    currentPage,
    pinned,
    validFiles,
    sidebarOrder,
  );
  return buildPanelsForPages(ordered, currentPage);
}

/** Rebuild panels from selection (if any) or current page, including pinned secondaries. */
export function refreshPanelsWithPins(state: AppState): PanelState[] | null {
  if (!state.project || !state.currentPage) return null;

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
