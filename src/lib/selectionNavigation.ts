import type { AppState, LoadedProject, SelectionState, SelectionHistoryEntry } from '../types';
import {
  getLinkedComponentIds,
} from './index';
import { getDisplayGroups, getPersistedGroupIndicesForComponent } from './mdVirtualGroups';

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

export function buildSelectionStateForComponent(
  state: AppState,
  componentId: string,
  pageFile: string,
): { currentPage: string; selection: SelectionState } | null {
  if (!state.project) return null;

  const { index } = state.project;
  const displayGroups = getDisplayGroups(index);
  const matchingGroupIndices = getPersistedGroupIndicesForComponent(index, componentId);
  const { links: relatedIds } = getLinkedComponentIds(componentId, displayGroups);

  return {
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
): { currentPage: string; selection: SelectionState } | null {
  return buildSelectionStateForComponent(state, componentId, pageFile);
}

/** Recompute selection.relatedIds after project index / md virtual groups change. */
export function applySelectionRefreshAfterProjectChange(
  state: AppState,
  project: LoadedProject,
): Partial<Pick<AppState, 'selection' | 'selectionScrollNonce'>> {
  if (!state.selection) return {};
  const pageFile = project.index.componentToPage.get(state.selection.componentId);
  if (!pageFile) return {};

  const next = buildSelectionStateForComponent(
    { ...state, project },
    state.selection.componentId,
    pageFile,
  );
  if (!next) return {};

  const prevRelated = state.selection.relatedIds.size;
  const nextRelated = next.selection.relatedIds.size;
  const relatedIdsChanged =
    prevRelated !== nextRelated ||
    [...state.selection.relatedIds].some((id) => !next.selection.relatedIds.has(id));

  if (!relatedIdsChanged) return {};

  return {
    selection: next.selection,
    ...(nextRelated > 1 && nextRelated > prevRelated
      ? { selectionScrollNonce: state.selectionScrollNonce + 1 }
      : {}),
  };
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
): { componentId: string; pageFile: string; nonce: number } {
  return {
    componentId: entry.componentId,
    pageFile: entry.pageFile,
    nonce: (state.scrollToComponent?.nonce ?? 0) + 1,
  };
}
