import type { AppState, PanelState, SelectionState, SelectionHistoryEntry } from '../types';
import {
  getLinkedComponentIds,
  orderPagesForSelection,
  getGroupIndicesForComponent,
} from './index';
import { buildPanelsInSidebarOrder, getStoredPageOrder } from './pageOrder';
import {
  getPinnedPages,
  hasPinnedPages,
  resolveVisiblePageFiles,
  validPageFileSet,
} from './pagePins';

export const MAX_SELECTION_HISTORY = 20;

export function entriesEqual(
  a: SelectionHistoryEntry,
  b: SelectionHistoryEntry,
): boolean {
  return a.componentId === b.componentId && a.pageFile === b.pageFile;
}

export function appendSelectionHistory(
  history: SelectionHistoryEntry[],
  index: number,
  entry: SelectionHistoryEntry,
): { history: SelectionHistoryEntry[]; index: number } {
  const current = index >= 0 ? history[index] : null;
  if (current && entriesEqual(current, entry)) {
    return { history, index };
  }

  let nextHistory = history.slice(0, index + 1);
  nextHistory.push(entry);
  let nextIndex = nextHistory.length - 1;

  if (nextHistory.length > MAX_SELECTION_HISTORY) {
    const overflow = nextHistory.length - MAX_SELECTION_HISTORY;
    nextHistory = nextHistory.slice(overflow);
    nextIndex -= overflow;
  }

  return { history: nextHistory, index: nextIndex };
}

export function buildSelectionForComponent(
  state: AppState,
  componentId: string,
  pageFile: string,
): {
  panels: PanelState[];
  currentPage: string;
  selection: SelectionState;
} | null {
  if (!state.project) return null;

  const { index } = state.project;
  const matchingGroupIndices = getGroupIndicesForComponent(index.groups, componentId);
  const { links: relatedIds, memberOrder: groupMemberOrder } = getLinkedComponentIds(
    componentId,
    index.groups,
  );

  const hasLinks = relatedIds.size > 1;
  const validFiles = validPageFileSet(state);
  const pinnedPages = getPinnedPages(state.project.relations);
  const pinModeActive = hasPinnedPages(state.project.relations);
  const sidebarOrder = getStoredPageOrder(
    state.project.relations,
    state.project.pages.map((p) => p.fileName),
  );

  const basePages = hasLinks
    ? orderPagesForSelection(pageFile, relatedIds, index, groupMemberOrder)
    : [pageFile];
  const orderedPages = resolveVisiblePageFiles(
    basePages,
    pageFile,
    pinnedPages,
    validFiles,
    sidebarOrder,
    pinModeActive,
  );

  if (!hasLinks) {
    return {
      panels: buildPanelsInSidebarOrder(state.panels, orderedPages, sidebarOrder, pageFile),
      currentPage: pageFile,
      selection: {
        componentId,
        relatedIds,
        activeGroupIndex: null,
        matchingGroupIndices,
      },
    };
  }

  return {
    panels: buildPanelsInSidebarOrder(state.panels, orderedPages, sidebarOrder, pageFile),
    currentPage: pageFile,
    selection: {
      componentId,
      relatedIds,
      activeGroupIndex: null,
      matchingGroupIndices,
    },
  };
}

export function applyComponentSelection(
  state: AppState,
  componentId: string,
  pageFile: string,
): {
  panels: PanelState[];
  currentPage: string;
  selection: SelectionState;
} | null {
  return buildSelectionForComponent(state, componentId, pageFile);
}

export function remapSelectionHistoryId(
  history: SelectionHistoryEntry[],
  oldId: string,
  newId: string,
): SelectionHistoryEntry[] {
  return history.map((entry) =>
    entry.componentId === oldId ? { ...entry, componentId: newId } : entry,
  );
}

export function scrollToHistoryEntry(
  state: AppState,
  entry: SelectionHistoryEntry,
): { componentId: string; nonce: number } {
  return {
    componentId: entry.componentId,
    nonce: (state.scrollToComponent?.nonce ?? 0) + 1,
  };
}
