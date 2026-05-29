import type { AppState, PanelState, RelationsFile } from '../types';
import { buildPanelsForPages } from './index';
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

/** Append pinned pages (except current) that are not already in the list. */
export function mergePinnedPagesIntoOrder(
  orderedPages: string[],
  currentPage: string,
  pinnedPages: string[],
  validPageFiles: Set<string>,
): string[] {
  const result = [...orderedPages];
  const seen = new Set(result);
  for (const pin of pinnedPages) {
    if (!validPageFiles.has(pin) || pin === currentPage || seen.has(pin)) continue;
    result.push(pin);
    seen.add(pin);
  }
  return result;
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
  const ordered = mergePinnedPagesIntoOrder(
    [currentPage],
    currentPage,
    pinned,
    validFiles,
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
      state.selection.activeGroupIndex,
    );
    return applied?.panels ?? null;
  }

  return buildPanelsForPageContext(state, state.currentPage);
}
