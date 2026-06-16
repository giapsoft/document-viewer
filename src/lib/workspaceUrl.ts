import type { AppState, LoadedProject } from '../types';
import { enforcePanelLimit } from './index';
import { addPageToPanels } from './pagePanels';
import { applyComponentSelection } from './selectionNavigation';

export interface WorkspaceUrlState {
  expandedPageIds: string[];
  selectedComponentId: string | null;
}

function parseListParam(value: string | null): string[] {
  if (!value?.trim()) return [];
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export function getWorkspaceStateFromUrl(): WorkspaceUrlState {
  const params = new URLSearchParams(window.location.search);
  const selectedComponentId = params.get('c')?.trim() || null;
  return {
    expandedPageIds: parseListParam(params.get('pages')),
    selectedComponentId,
  };
}

export function encodeWorkspaceUrlParams(state: AppState): {
  c: string | null;
  pages: string | null;
} {
  if (!state.project) {
    return { c: null, pages: null };
  }

  const pageIdByFile = state.project.index.pageIdByFile;
  const expandedPageIds = state.panels
    .map((panel) => pageIdByFile.get(panel.pageFile))
    .filter((pageId): pageId is string => Boolean(pageId));

  const c = state.selection?.componentId ?? null;

  return {
    c,
    pages: expandedPageIds.length > 0 ? expandedPageIds.join(',') : null,
  };
}

export function syncWorkspaceUrl(state: AppState): void {
  const { c, pages } = encodeWorkspaceUrlParams(state);
  const url = new URL(window.location.href);
  const currentC = url.searchParams.get('c');
  const currentPages = url.searchParams.get('pages');

  if (c === currentC && pages === currentPages) return;

  if (c) url.searchParams.set('c', c);
  else url.searchParams.delete('c');

  if (pages) url.searchParams.set('pages', pages);
  else url.searchParams.delete('pages');

  window.history.replaceState({}, '', url);
}

export function clearWorkspaceFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('c');
  url.searchParams.delete('pages');
  window.history.replaceState({}, '', url);
}

export function resolveWorkspaceUrlState(
  project: LoadedProject,
  urlState: WorkspaceUrlState,
): {
  pageFiles: string[];
  primaryComponentId: string | null;
} | null {
  const pageFileById = new Map(project.pages.map((page) => [page.pageId, page.fileName]));

  const pageFiles = urlState.expandedPageIds
    .map((pageId) => pageFileById.get(pageId))
    .filter((pageFile): pageFile is string => Boolean(pageFile));

  const primaryComponentId =
    urlState.selectedComponentId &&
    project.index.componentData.has(urlState.selectedComponentId)
      ? urlState.selectedComponentId
      : null;

  if (pageFiles.length === 0 && !primaryComponentId) {
    return null;
  }

  return { pageFiles, primaryComponentId };
}

export function applyWorkspaceRestore(
  state: AppState,
  pageFiles: string[],
  primaryComponentId: string | null,
): AppState {
  if (!state.project) return state;

  let targetPageFiles = [...pageFiles];
  if (primaryComponentId) {
    const componentPage = state.project.index.componentToPage.get(primaryComponentId);
    if (componentPage && !targetPageFiles.includes(componentPage)) {
      targetPageFiles.push(componentPage);
    }
  }

  let panels = state.panels;
  for (const pageFile of targetPageFiles) {
    const nextPanels = addPageToPanels(panels, pageFile, state.maxOpenPages);
    if (nextPanels) panels = nextPanels;
  }

  const focusPage =
    (primaryComponentId
      ? state.project.index.componentToPage.get(primaryComponentId)
      : null) ??
    targetPageFiles[0] ??
    state.currentPage ??
    '';

  panels = enforcePanelLimit(
    panels,
    state.maxOpenPages,
    focusPage || undefined,
  );

  let nextState: AppState = {
    ...state,
    panels,
    currentPage: focusPage || state.currentPage,
  };

  if (primaryComponentId && focusPage) {
    const applied = applyComponentSelection(nextState, primaryComponentId, focusPage);
    if (applied) {
      nextState = {
        ...nextState,
        ...applied,
        selectionScrollNonce: state.selectionScrollNonce + 1,
        scrollToComponent: {
          componentId: primaryComponentId,
          nonce: (state.scrollToComponent?.nonce ?? 0) + 1,
        },
      };
    }
  }

  return nextState;
}
