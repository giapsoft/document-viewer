import type { Component, PageData, ProjectIndex, RelationsFile } from '../types';

export function buildBidirectionalGraph(
  connectors: Record<string, string[]>,
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  const addEdge = (from: string, to: string) => {
    if (!graph.has(from)) graph.set(from, new Set());
    graph.get(from)!.add(to);
  };

  for (const [from, targets] of Object.entries(connectors)) {
    for (const to of targets) {
      addEdge(from, to);
      addEdge(to, from);
    }
  }

  return graph;
}

export function getRelatedIds(
  componentId: string,
  graph: Map<string, Set<string>>,
): Set<string> {
  const related = new Set<string>([componentId]);
  const neighbors = graph.get(componentId);
  if (neighbors) {
    for (const id of neighbors) related.add(id);
  }
  return related;
}

export function buildIndex(
  pages: PageData[],
  relations: RelationsFile,
): { index: ProjectIndex; warnings: string[] } {
  const componentToPage = new Map<string, string>();
  const componentData = new Map<string, Component>();
  const warnings: string[] = [];

  for (const page of pages) {
    for (const component of page.components) {
      if (componentData.has(component.id)) {
        warnings.push(
          `Duplicate component ID "${component.id}" in ${page.fileName} — skipped`,
        );
        continue;
      }
      componentToPage.set(component.id, page.fileName);
      componentData.set(component.id, component);
    }
  }

  const graph = buildBidirectionalGraph(relations.connectors);

  return {
    index: {
      componentToPage,
      componentData,
      graph,
      connectors: relations.connectors,
    },
    warnings,
  };
}

export function orderPagesForSelection(
  componentId: string,
  currentPage: string,
  relatedIds: Set<string>,
  index: ProjectIndex,
): string[] {
  const pagesNeeded = new Set<string>();
  for (const id of relatedIds) {
    const page = index.componentToPage.get(id);
    if (page) pagesNeeded.add(page);
  }

  const ordered: string[] = [];
  const seen = new Set<string>();

  if (pagesNeeded.has(currentPage)) {
    ordered.push(currentPage);
    seen.add(currentPage);
  }

  const outgoing = index.connectors[componentId] ?? [];
  for (const id of outgoing) {
    const page = index.componentToPage.get(id);
    if (page && pagesNeeded.has(page) && !seen.has(page)) {
      ordered.push(page);
      seen.add(page);
    }
  }

  for (const [key, values] of Object.entries(index.connectors)) {
    if (values.includes(componentId)) {
      const page = index.componentToPage.get(key);
      if (page && pagesNeeded.has(page) && !seen.has(page)) {
        ordered.push(page);
        seen.add(page);
      }
    }
  }

  for (const page of pagesNeeded) {
    if (!seen.has(page)) {
      ordered.push(page);
      seen.add(page);
    }
  }

  return ordered;
}

export function applyExpandLimits(
  panels: { pageFile: string; expanded: boolean }[],
  orderedPages: string[],
  currentPage: string,
): { pageFile: string; expanded: boolean }[] {
  const expandSet = new Set<string>();
  expandSet.add(currentPage);

  for (const page of orderedPages) {
    if (expandSet.size >= 3) break;
    expandSet.add(page);
  }

  return panels.map((panel) => ({
    ...panel,
    expanded: expandSet.has(panel.pageFile),
  }));
}

export function movePanelToFront(
  panels: { pageFile: string; expanded: boolean }[],
  pageFile: string,
  expanded = true,
): { pageFile: string; expanded: boolean }[] {
  const existing = panels.find((p) => p.pageFile === pageFile);
  const rest = panels.filter((p) => p.pageFile !== pageFile);
  const panel = existing ?? { pageFile, expanded };
  return [{ ...panel, expanded }, ...rest.map((p) => ({ ...p }))];
}

export function ensurePanelsForPages(
  panels: { pageFile: string; expanded: boolean }[],
  pageFiles: string[],
  currentPage: string,
): { pageFile: string; expanded: boolean }[] {
  let result = [...panels.map((p) => ({ ...p }))];
  for (const pageFile of pageFiles) {
    if (!result.some((p) => p.pageFile === pageFile)) {
      result.push({ pageFile, expanded: false });
    }
  }
  return applyExpandLimits(result, pageFiles, currentPage);
}

export function buildPanelsForPages(
  orderedPages: string[],
  currentPage: string,
): { pageFile: string; expanded: boolean }[] {
  const panels = orderedPages.map((pageFile) => ({
    pageFile,
    expanded: false,
  }));
  return applyExpandLimits(panels, orderedPages, currentPage);
}

export function shrinkFarthestExpanded(
  panels: { pageFile: string; expanded: boolean }[],
  currentPage: string,
  expandingPage: string,
): { pageFile: string; expanded: boolean }[] {
  const expandedCount = panels.filter((p) => p.expanded).length;

  if (expandedCount < 3) {
    return panels.map((p) =>
      p.pageFile === expandingPage ? { ...p, expanded: true } : p,
    );
  }

  const toShrink =
    [...panels]
      .reverse()
      .find(
        (p) =>
          p.expanded &&
          p.pageFile !== currentPage &&
          p.pageFile !== expandingPage,
      ) ??
    [...panels]
      .reverse()
      .find((p) => p.expanded && p.pageFile !== expandingPage);

  if (!toShrink) {
    return panels.map((p) =>
      p.pageFile === expandingPage ? { ...p, expanded: true } : p,
    );
  }

  return panels.map((p) => {
    if (p.pageFile === expandingPage) return { ...p, expanded: true };
    if (p.pageFile === toShrink.pageFile) return { ...p, expanded: false };
    return p;
  });
}
