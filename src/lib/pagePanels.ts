import type { AppState, PanelState } from '../types';
import { enforcePanelLimit } from './index';
import { getStoredPageOrder } from './pageOrder';

export function getMainSelectionPageFile(state: AppState): string | null {
  if (!state.project || !state.selection) return null;
  return state.project.index.componentToPage.get(state.selection.componentId) ?? null;
}

function protectedPageFilesForLimit(
  maxOpenPages: number,
  protectedPageFile: string | null | undefined,
  ...alsoKeep: Array<string | null | undefined>
): string[] {
  const keep = new Set(
    alsoKeep.filter((pageFile): pageFile is string => Boolean(pageFile)),
  );
  if (maxOpenPages > 1 && protectedPageFile) {
    keep.add(protectedPageFile);
  }
  return [...keep];
}

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
  maxOpenPages: number,
  protectedPageFile?: string | null,
): PanelState[] {
  const keepPages = protectedPageFilesForLimit(maxOpenPages, protectedPageFile, pageFile);

  if (panels.some((panel) => panel.pageFile === pageFile)) {
    return enforcePanelLimit(
      panels.map((panel) => ({ ...panel, expanded: true })),
      maxOpenPages,
      keepPages,
    );
  }

  const result = panels.map((panel) => ({ ...panel, expanded: true }));
  if (result.length < maxOpenPages) {
    return [...result, { pageFile, expanded: true }];
  }

  if (maxOpenPages <= 1) {
    return [{ pageFile, expanded: true }];
  }

  const replaceIndex = result.findIndex(
    (panel) =>
      panel.pageFile !== protectedPageFile &&
      panel.pageFile !== pageFile,
  );

  if (replaceIndex < 0) {
    return [...result.slice(1), { pageFile, expanded: true }];
  }

  const next = [...result];
  next[replaceIndex] = { pageFile, expanded: true };
  return next;
}

export function removePageFromPanels(
  panels: PanelState[],
  pageFile: string,
): PanelState[] {
  return panels.filter((p) => p.pageFile !== pageFile);
}

/** Insert or replace at the slot beside the anchor without moving the anchor. */
function insertOrReplaceBesideAnchor(
  panels: PanelState[],
  targetPageFile: string,
  anchorPageFile: string | null,
  maxOpenPages: number,
): PanelState[] {
  if (targetPageFile === anchorPageFile) {
    return panels.map((panel) => ({ ...panel, expanded: true }));
  }

  const result = panels.map((panel) => ({ ...panel, expanded: true }));
  const anchorIndex =
    anchorPageFile != null
      ? result.findIndex((panel) => panel.pageFile === anchorPageFile)
      : -1;

  if (anchorIndex < 0) {
    return addPageToPanels(result, targetPageFile, maxOpenPages, anchorPageFile);
  }

  const targetIndex = result.findIndex((panel) => panel.pageFile === targetPageFile);
  const insertIndex = anchorIndex + 1;

  if (targetIndex >= 0) {
    if (
      targetIndex === insertIndex ||
      (insertIndex >= result.length && targetIndex === anchorIndex - 1)
    ) {
      return result;
    }

    if (insertIndex < result.length) {
      const next = [...result];
      const movingTarget = next[targetIndex];
      next[targetIndex] = next[insertIndex];
      next[insertIndex] = movingTarget;
      return next;
    }

    if (anchorIndex > 0) {
      const swapIndex = anchorIndex - 1;
      if (targetIndex === swapIndex) {
        return result;
      }
      const next = [...result];
      const movingTarget = next[targetIndex];
      next[targetIndex] = next[swapIndex];
      next[swapIndex] = movingTarget;
      return next;
    }

    return result;
  }

  const targetPanel: PanelState = { pageFile: targetPageFile, expanded: true };

  if (result.length < maxOpenPages) {
    const next = [...result];
    next.splice(insertIndex, 0, targetPanel);
    return next;
  }

  if (insertIndex < result.length) {
    const next = [...result];
    next[insertIndex] = targetPanel;
    return next;
  }

  const replaceIndex = result.findIndex((_panel, index) => index !== anchorIndex);
  if (replaceIndex >= 0) {
    const next = [...result];
    next[replaceIndex] = targetPanel;
    return next;
  }

  return enforcePanelLimit(result, maxOpenPages, [
    targetPageFile,
    ...(anchorPageFile ? [anchorPageFile] : []),
  ]);
}

/** Open a linked page beside the anchor (e.g. the MD source page). */
export function addLinkedPageToPanels(
  panels: PanelState[],
  targetPageFile: string,
  anchorPageFile: string | null,
  maxOpenPages: number,
): PanelState[] {
  return insertOrReplaceBesideAnchor(
    panels,
    targetPageFile,
    anchorPageFile,
    maxOpenPages,
  );
}

/** Toggle a page in or out of the panel list from the sidebar. */
export function applyOpenPage(state: AppState, pageFile: string): Partial<AppState> {
  const inPanels = state.panels.some((p) => p.pageFile === pageFile);

  if (inPanels) {
    const panels = removePageFromPanels(state.panels, pageFile);
    const currentPage =
      state.currentPage === pageFile ? (panels[0]?.pageFile ?? null) : state.currentPage;
    return { currentPage, panels };
  }

  const panels = addPageToPanels(
    state.panels,
    pageFile,
    state.maxOpenPages,
    getMainSelectionPageFile(state),
  );
  return {
    currentPage: pageFile,
    panels,
  };
}
