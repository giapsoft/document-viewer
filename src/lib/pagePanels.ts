import type { AppState, PanelState } from '../types';
import { enforceExpandedLimit } from './index';
import {
  buildPanelsInSidebarOrder,
  getStoredPageOrder,
  orderPageFilesBySidebar,
} from './pageOrder';

export function getSidebarOrder(state: AppState): string[] {
  if (!state.project) return [];
  return getStoredPageOrder(
    state.project.relations,
    state.project.pages.map((p) => p.fileName),
  );
}

export function addPageToPanels(
  panels: PanelState[],
  pageFile: string,
  sidebarOrder: string[],
): PanelState[] {
  const panelFiles = panels.map((p) => p.pageFile);
  if (panelFiles.includes(pageFile)) {
    return enforceExpandedLimit(
      panels.map((p) =>
        p.pageFile === pageFile ? { ...p, expanded: true } : p,
      ),
      pageFile,
    );
  }

  const visiblePageFiles = orderPageFilesBySidebar(
    [...panelFiles, pageFile],
    sidebarOrder,
  );
  return buildPanelsInSidebarOrder(panels, visiblePageFiles, sidebarOrder, pageFile);
}

export function removePageFromPanels(
  panels: PanelState[],
  pageFile: string,
): PanelState[] {
  return panels.filter((p) => p.pageFile !== pageFile);
}

/** Toggle a page in or out of the panel list from the sidebar. */
export function applyOpenPage(state: AppState, pageFile: string): Partial<AppState> {
  const sidebarOrder = getSidebarOrder(state);
  const inPanels = state.panels.some((p) => p.pageFile === pageFile);

  if (inPanels) {
    const panels = removePageFromPanels(state.panels, pageFile);
    const currentPage =
      state.currentPage === pageFile ? (panels[0]?.pageFile ?? null) : state.currentPage;
    return { currentPage, panels };
  }

  const panels = addPageToPanels(state.panels, pageFile, sidebarOrder);
  return {
    currentPage: pageFile,
    panels,
  };
}
