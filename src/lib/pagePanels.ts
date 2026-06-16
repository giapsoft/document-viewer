import type { AppState, PanelState } from '../types';
import { enforcePanelLimit } from './index';
import { measurePagePanelsTrackWidth, measurePanelSlotWidth } from './panelSlotRegistry';
import {
  loadPanelWidths,
  PANEL_RESIZE_HANDLE_WIDTH,
  persistPanelWidths,
} from './panelWidthStorage';
import { getStoredPageOrder } from './pageOrder';

export const NO_PANEL_SLOT_TOAST =
  'No room to open another page. Close or unpin a page first.';

export type OpenPageResult = Partial<AppState> & { blocked?: boolean };

export function getPinnedPageFiles(panels: PanelState[]): string[] {
  return panels.filter((panel) => panel.pinned).map((panel) => panel.pageFile);
}

function isReplaceablePanel(
  panel: PanelState,
  pageFile: string,
  protectedPageFile?: string | null,
): boolean {
  if (panel.pinned) return false;
  if (panel.pageFile === protectedPageFile) return false;
  if (panel.pageFile === pageFile) return false;
  return true;
}

function findReplaceablePanelIndex(
  panels: PanelState[],
  pageFile: string,
  protectedPageFile?: string | null,
  skipIndices?: ReadonlySet<number>,
): number {
  return panels.findIndex(
    (panel, index) =>
      isReplaceablePanel(panel, pageFile, protectedPageFile) &&
      !(skipIndices?.has(index) ?? false),
  );
}

export function getMainSelectionPageFile(state: AppState): string | null {
  if (!state.project || !state.selection) return null;
  return state.project.index.componentToPage.get(state.selection.componentId) ?? null;
}

function protectedPageFilesForLimit(
  maxOpenPages: number,
  protectedPageFile: string | null | undefined,
  panels: PanelState[],
  ...alsoKeep: Array<string | null | undefined>
): string[] {
  const keep = new Set(
    alsoKeep.filter((pageFile): pageFile is string => Boolean(pageFile)),
  );
  for (const panel of panels) {
    if (panel.pinned) keep.add(panel.pageFile);
  }
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

/** One page swapped for another at the same open-panel count (not a new slot). */
export function getPanelReplacementDelta(
  prevPageFiles: string[],
  nextPageFiles: string[],
): { removed: string; added: string } | null {
  if (prevPageFiles.length !== nextPageFiles.length) return null;
  const prevSet = new Set(prevPageFiles);
  const removed = prevPageFiles.filter((pageFile) => !nextPageFiles.includes(pageFile));
  const added = nextPageFiles.filter((pageFile) => !prevSet.has(pageFile));
  if (removed.length !== 1 || added.length !== 1) return null;
  return { removed: removed[0], added: added[0] };
}

export function resolveReplacedPanelWidth(
  replaced: PanelState,
  storedWidths: Record<string, number>,
  measuredWidthPx?: number,
): number | undefined {
  for (const value of [
    measuredWidthPx,
    replaced.widthPx,
    storedWidths[replaced.pageFile],
  ]) {
    if (value != null && Number.isFinite(value) && value > 0) {
      return Math.round(value);
    }
  }
  return undefined;
}

function panelReplacing(
  pageFile: string,
  replaced: PanelState | undefined,
  storedWidths: Record<string, number>,
  measuredWidthPx?: number,
): PanelState {
  const widthPx =
    replaced != null
      ? resolveReplacedPanelWidth(replaced, storedWidths, measuredWidthPx)
      : undefined;
  return {
    pageFile,
    expanded: true,
    ...(widthPx != null ? { widthPx } : {}),
  };
}

export function applyPanelReplacementWidth(
  prevPanels: PanelState[],
  nextPanels: PanelState[],
  storedWidths: Record<string, number>,
  measureSlotWidth: (pageFile: string) => number | undefined = () => undefined,
): PanelState[] {
  const delta = getPanelReplacementDelta(
    prevPanels.map((panel) => panel.pageFile),
    nextPanels.map((panel) => panel.pageFile),
  );
  if (!delta) return nextPanels;

  const replaced = prevPanels.find((panel) => panel.pageFile === delta.removed);
  if (!replaced) return nextPanels;

  const widthPx = resolveReplacedPanelWidth(
    replaced,
    storedWidths,
    measureSlotWidth(delta.removed),
  );
  const replacedIndex = prevPanels.findIndex((panel) => panel.pageFile === delta.removed);
  const replacedWasLast = replacedIndex === prevPanels.length - 1;

  if (replacedWasLast) {
    return nextPanels.map((panel) => {
      if (panel.pageFile === delta.added) {
        const { widthPx: _removed, ...rest } = panel;
        return rest;
      }
      const prev = prevPanels.find((entry) => entry.pageFile === panel.pageFile);
      if (!prev) return panel;
      const preservedWidth = prev.widthPx ?? storedWidths[prev.pageFile];
      return preservedWidth != null ? { ...panel, widthPx: preservedWidth } : panel;
    });
  }

  if (widthPx == null) return nextPanels;

  return nextPanels.map((panel) => {
    if (panel.pageFile === delta.added) {
      return { ...panel, widthPx };
    }
    const prev = prevPanels.find((entry) => entry.pageFile === panel.pageFile);
    if (!prev) return panel;
    const preservedWidth = prev.widthPx ?? storedWidths[prev.pageFile];
    return preservedWidth != null ? { ...panel, widthPx: preservedWidth } : panel;
  });
}

export function ensureFlexLastPanel(panels: PanelState[]): PanelState[] {
  if (panels.length === 0) return panels;
  const lastPageFile = panels[panels.length - 1]?.pageFile;
  return panels.map((panel) => {
    if (panel.pageFile !== lastPageFile || panel.widthPx == null) return panel;
    const { widthPx: _widthPx, ...rest } = panel;
    return rest;
  });
}

export function fixedPanelWidthForCount(trackWidth: number, pageCount: number): number {
  if (pageCount <= 1) return 0;
  const handles = Math.max(0, pageCount - 1) * PANEL_RESIZE_HANDLE_WIDTH;
  const available = Math.max(0, trackWidth - handles);
  return Math.floor(available / pageCount);
}

function applyPanelCountIncrease(
  prevPanels: PanelState[],
  nextPanels: PanelState[],
): PanelState[] {
  if (nextPanels.length <= prevPanels.length || nextPanels.length <= 1) {
    return nextPanels;
  }

  const trackWidth = measurePagePanelsTrackWidth();
  if (trackWidth == null) {
    return ensureFlexLastPanel(nextPanels);
  }

  const pageCount = nextPanels.length;
  const fixedWidth = fixedPanelWidthForCount(trackWidth, pageCount);

  return nextPanels.map((panel, index) => {
    const isLast = index === pageCount - 1;
    if (isLast) {
      const { widthPx: _widthPx, ...rest } = panel;
      return rest;
    }
    return { ...panel, widthPx: fixedWidth };
  });
}

function persistFixedPanelWidths(
  panels: PanelState[],
  projectKey: string,
  storedWidths: Record<string, number>,
): void {
  if (panels.length <= 1) return;
  const widths: Record<string, number> = { ...storedWidths };
  for (let index = 0; index < panels.length - 1; index += 1) {
    const panel = panels[index];
    const widthPx = panel?.widthPx;
    if (panel && widthPx != null) {
      widths[panel.pageFile] = widthPx;
    }
  }
  const lastPageFile = panels[panels.length - 1]?.pageFile;
  if (lastPageFile) delete widths[lastPageFile];
  persistPanelWidths(projectKey, widths);
}

export function finalizePanelChange(
  prevPanels: PanelState[],
  nextPanels: PanelState[],
  storedWidths: Record<string, number>,
): PanelState[] {
  const delta = getPanelReplacementDelta(
    prevPanels.map((panel) => panel.pageFile),
    nextPanels.map((panel) => panel.pageFile),
  );
  if (!delta) return nextPanels;

  return applyPanelReplacementWidth(
    prevPanels,
    nextPanels,
    storedWidths,
    measurePanelSlotWidth,
  );
}

export function persistReplacementPanelWidth(
  prevPanels: PanelState[],
  nextPanels: PanelState[],
  projectKey: string,
  storedWidths: Record<string, number>,
): void {
  const delta = getPanelReplacementDelta(
    prevPanels.map((panel) => panel.pageFile),
    nextPanels.map((panel) => panel.pageFile),
  );
  if (!delta) return;
  const inherited = nextPanels.find((panel) => panel.pageFile === delta.added)?.widthPx;
  if (inherited == null) return;
  persistPanelWidths(projectKey, {
    ...storedWidths,
    [delta.added]: inherited,
  });
}

/** Apply width rules before dispatching a panel-list change. */
export function preparePanelsForOpen(
  prevPanels: PanelState[],
  nextPanels: PanelState[],
  projectKey: string,
): PanelState[] {
  const storedWidths = loadPanelWidths(projectKey);
  const delta = getPanelReplacementDelta(
    prevPanels.map((panel) => panel.pageFile),
    nextPanels.map((panel) => panel.pageFile),
  );

  let panels = nextPanels;

  if (delta) {
    panels = finalizePanelChange(prevPanels, nextPanels, storedWidths);
    persistReplacementPanelWidth(prevPanels, panels, projectKey, storedWidths);
  } else if (nextPanels.length > prevPanels.length) {
    panels = applyPanelCountIncrease(prevPanels, nextPanels);
    persistFixedPanelWidths(panels, projectKey, storedWidths);
  }

  return ensureFlexLastPanel(panels);
}

export function addPageToPanels(
  panels: PanelState[],
  pageFile: string,
  maxOpenPages: number,
  protectedPageFile?: string | null,
  storedWidths: Record<string, number> = {},
  measureSlotWidth: (pageFile: string) => number | undefined = () => undefined,
): PanelState[] | null {
  const keepPages = protectedPageFilesForLimit(
    maxOpenPages,
    protectedPageFile,
    panels,
    pageFile,
  );

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
    const replaceIndex = findReplaceablePanelIndex(result, pageFile, protectedPageFile);
    if (replaceIndex < 0) return null;
    const replaced = result[replaceIndex];
    return [
      panelReplacing(pageFile, replaced, storedWidths, measureSlotWidth(replaced.pageFile)),
    ];
  }

  const replaceIndex = findReplaceablePanelIndex(result, pageFile, protectedPageFile);
  if (replaceIndex < 0) return null;

  const next = [...result];
  const replaced = next[replaceIndex];
  next[replaceIndex] = panelReplacing(
    pageFile,
    replaced,
    storedWidths,
    measureSlotWidth(replaced.pageFile),
  );
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
  storedWidths: Record<string, number> = {},
  measureSlotWidth: (pageFile: string) => number | undefined = () => undefined,
): PanelState[] | null {
  if (targetPageFile === anchorPageFile) {
    return panels.map((panel) => ({ ...panel, expanded: true }));
  }

  const result = panels.map((panel) => ({ ...panel, expanded: true }));
  const anchorIndex =
    anchorPageFile != null
      ? result.findIndex((panel) => panel.pageFile === anchorPageFile)
      : -1;

  if (anchorIndex < 0) {
    return addPageToPanels(
      result,
      targetPageFile,
      maxOpenPages,
      anchorPageFile,
      storedWidths,
      measureSlotWidth,
    );
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

  if (result.length < maxOpenPages) {
    const next = [...result];
    next.splice(insertIndex, 0, panelReplacing(targetPageFile, undefined, storedWidths));
    return next;
  }

  if (insertIndex < result.length) {
    const victim = result[insertIndex];
    if (!victim.pinned) {
      const next = [...result];
      const replaced = next[insertIndex];
      next[insertIndex] = panelReplacing(
        targetPageFile,
        replaced,
        storedWidths,
        measureSlotWidth(replaced.pageFile),
      );
      return next;
    }
  }

  const skipIndices = new Set<number>([anchorIndex]);
  const replaceIndex = findReplaceablePanelIndex(
    result,
    targetPageFile,
    anchorPageFile,
    skipIndices,
  );
  if (replaceIndex < 0) return null;

  const next = [...result];
  const replaced = next[replaceIndex];
  next[replaceIndex] = panelReplacing(
    targetPageFile,
    replaced,
    storedWidths,
    measureSlotWidth(replaced.pageFile),
  );
  return next;
}

/** Open a linked page beside the anchor (e.g. the MD source page). */
export function addLinkedPageToPanels(
  panels: PanelState[],
  targetPageFile: string,
  anchorPageFile: string | null,
  maxOpenPages: number,
  storedWidths: Record<string, number> = {},
  measureSlotWidth: (pageFile: string) => number | undefined = () => undefined,
): PanelState[] | null {
  return insertOrReplaceBesideAnchor(
    panels,
    targetPageFile,
    anchorPageFile,
    maxOpenPages,
    storedWidths,
    measureSlotWidth,
  );
}

/** Toggle a page in or out of the panel list from the sidebar. */
export function applyOpenPage(state: AppState, pageFile: string): OpenPageResult {
  const existing = state.panels.find((panel) => panel.pageFile === pageFile);

  if (existing) {
    if (existing.pinned) {
      return { currentPage: pageFile };
    }
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
  if (panels === null) return { blocked: true };
  return {
    currentPage: pageFile,
    panels,
  };
}

export function closePagePanel(state: AppState, pageFile: string): Partial<AppState> {
  if (!state.panels.some((panel) => panel.pageFile === pageFile)) {
    return {};
  }
  const panels = removePageFromPanels(state.panels, pageFile);
  const currentPage =
    state.currentPage === pageFile ? (panels[0]?.pageFile ?? null) : state.currentPage;
  return { currentPage, panels };
}

export function togglePanelPin(state: AppState, pageFile: string): Partial<AppState> {
  const panels = state.panels.map((panel) =>
    panel.pageFile === pageFile ? { ...panel, pinned: !panel.pinned } : panel,
  );
  return { panels };
}
