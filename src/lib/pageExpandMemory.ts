/** Session-only expanded/shrunk state keyed by page file name. */
const expandedByPage = new Map<string, boolean>();

export function getPageExpanded(pageFile: string): boolean | undefined {
  return expandedByPage.get(pageFile);
}

export function setPageExpanded(pageFile: string, expanded: boolean): void {
  expandedByPage.set(pageFile, expanded);
}

export function syncPanelExpandMemory(
  panels: { pageFile: string; expanded: boolean }[],
): void {
  for (const panel of panels) {
    setPageExpanded(panel.pageFile, panel.expanded);
  }
}

/** Drop remembered state for pages no longer in the panel list. */
export function prunePageExpandMemory(activePageFiles: Iterable<string>): void {
  const active = new Set(activePageFiles);
  for (const pageFile of expandedByPage.keys()) {
    if (!active.has(pageFile)) {
      expandedByPage.delete(pageFile);
    }
  }
}

export function clearPageExpandMemory(): void {
  expandedByPage.clear();
}

export function resolvePanelExpanded(
  pageFile: string,
  currentPage: string,
  hadExistingPanel: boolean,
  existingExpanded?: boolean,
): boolean {
  if (pageFile === currentPage) return true;
  if (hadExistingPanel && existingExpanded !== undefined) return existingExpanded;
  const remembered = getPageExpanded(pageFile);
  if (remembered !== undefined) return remembered;
  return true;
}
