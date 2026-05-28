import type { Component, PageData, ProjectIndex, RelationsFile } from '../types';
import { getGroupIndicesForComponent } from './groupRelations';

export function getRelatedIdsForGroup(
  componentId: string,
  group: string[],
): Set<string> {
  if (!group.includes(componentId)) {
    return new Set([componentId]);
  }
  return new Set(group);
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

  const groups = relations.groups.map((group) => [...group]);
  const componentToGroups = new Map<string, number[]>();

  groups.forEach((group, groupIndex) => {
    const seenInGroup = new Set<string>();
    for (const id of group) {
      if (seenInGroup.has(id)) {
        warnings.push(`Duplicate ID "${id}" in group ${groupIndex} — ignored`);
        continue;
      }
      seenInGroup.add(id);
      const existing = componentToGroups.get(id) ?? [];
      existing.push(groupIndex);
      componentToGroups.set(id, existing);
    }
  });

  return {
    index: {
      componentToPage,
      componentData,
      groups,
      componentToGroups,
    },
    warnings,
  };
}

export function orderPagesForSelection(
  currentPage: string,
  relatedIds: Set<string>,
  index: ProjectIndex,
  groupMemberOrder: string[] = [],
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

  for (const id of groupMemberOrder) {
    if (!relatedIds.has(id)) continue;
    const page = index.componentToPage.get(id);
    if (page && pagesNeeded.has(page) && !seen.has(page)) {
      ordered.push(page);
      seen.add(page);
    }
  }

  for (const id of relatedIds) {
    const page = index.componentToPage.get(id);
    if (page && pagesNeeded.has(page) && !seen.has(page)) {
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

export { getGroupIndicesForComponent };
