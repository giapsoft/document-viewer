import type { AppState, PanelState, SelectionState, SelectionHistoryEntry } from '../types';
import {
  getRelatedIdsForGroup,
  orderPagesForSelection,
  buildPanelsForPages,
  getGroupIndicesForComponent,
} from './index';
import {
  getPinnedPages,
  mergePinnedPagesIntoOrder,
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
  activeGroupIndex: number | null = null,
): {
  panels: PanelState[];
  currentPage: string;
  selection: SelectionState;
} | null {
  if (!state.project) return null;

  const { index } = state.project;
  const matchingGroupIndices = getGroupIndicesForComponent(index.groups, componentId);

  let resolvedGroupIndex = activeGroupIndex;
  if (matchingGroupIndices.length === 0) {
    resolvedGroupIndex = null;
  } else if (
    resolvedGroupIndex === null ||
    !matchingGroupIndices.includes(resolvedGroupIndex)
  ) {
    resolvedGroupIndex = matchingGroupIndices[0];
  }

  const activeGroup = resolvedGroupIndex === null ? [] : (index.groups[resolvedGroupIndex] ?? []);
  const relatedIds =
    matchingGroupIndices.length === 0
      ? new Set([componentId])
      : getRelatedIdsForGroup(componentId, activeGroup);

  const hasLinks = relatedIds.size > 1;
  const validFiles = validPageFileSet(state);
  const pinnedPages = getPinnedPages(state.project.relations);

  if (!hasLinks) {
    const orderedPages = mergePinnedPagesIntoOrder(
      [pageFile],
      pageFile,
      pinnedPages,
      validFiles,
    );
    return {
      panels: buildPanelsForPages(orderedPages, pageFile),
      currentPage: pageFile,
      selection: {
        componentId,
        relatedIds,
        activeGroupIndex: resolvedGroupIndex,
        matchingGroupIndices,
      },
    };
  }

  const groupMemberOrder = activeGroup;

  const orderedPages = mergePinnedPagesIntoOrder(
    orderPagesForSelection(pageFile, relatedIds, index, groupMemberOrder),
    pageFile,
    pinnedPages,
    validFiles,
  );

  return {
    panels: buildPanelsForPages(orderedPages, pageFile),
    currentPage: pageFile,
    selection: {
      componentId,
      relatedIds,
      activeGroupIndex: resolvedGroupIndex,
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

export function cycleSelectionGroup(
  state: AppState,
  direction: 'prev' | 'next',
): {
  panels: PanelState[];
  currentPage: string;
  selection: SelectionState;
} | null {
  if (!state.project || !state.selection) return null;

  const { componentId, matchingGroupIndices, activeGroupIndex } = state.selection;
  if (matchingGroupIndices.length <= 1 || activeGroupIndex === null) return null;

  const currentPos = matchingGroupIndices.indexOf(activeGroupIndex);
  if (currentPos < 0) return null;

  const nextPos =
    direction === 'prev'
      ? (currentPos - 1 + matchingGroupIndices.length) % matchingGroupIndices.length
      : (currentPos + 1) % matchingGroupIndices.length;

  const pageFile =
    state.project.index.componentToPage.get(componentId) ?? state.currentPage;
  if (!pageFile) return null;

  return buildSelectionForComponent(
    state,
    componentId,
    pageFile,
    matchingGroupIndices[nextPos],
  );
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
