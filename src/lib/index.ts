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

/** Page id prefix from component id, e.g. `user-stories.l2` → `user-stories`. */
export function getPageIdPrefix(componentId: string): string {
  const dot = componentId.indexOf('.');
  return dot >= 0 ? componentId.slice(0, dot) : componentId;
}

/** Same-page components cannot bridge into new groups (except the selected id itself). */
export function canBridgeAsLink(componentId: string, selectedId: string): boolean {
  if (componentId === selectedId) return true;
  return getPageIdPrefix(componentId) !== getPageIdPrefix(selectedId);
}

/** Only the selected id is kept from its page; other same-page members are omitted. */
export function shouldIncludeInLinks(componentId: string, selectedId: string): boolean {
  if (componentId === selectedId) return true;
  return getPageIdPrefix(componentId) !== getPageIdPrefix(selectedId);
}

function pageHasLinkedMembers(page: string, memberOrder: string[]): boolean {
  return memberOrder.some((id) => getPageIdPrefix(id) === page);
}

function countGroupMembersOnPageInLinks(
  group: string[],
  page: string,
  links: Set<string>,
  selectedId: string,
): number {
  return group.filter(
    (member) =>
      getPageIdPrefix(member) === page &&
      (links.has(member) || member === selectedId),
  ).length;
}

/**
 * Transitive link closure from `selectedId`.
 * - Phase 1: merge every group that contains `selectedId`.
 * - After phase 1: lock the selected page and any page that contributed multiple
 *   ids in phase 1 (hub children stay stable).
 * - Phase 2+: merge when a bridge-eligible member intersects `links`. A member
 *   joins via a cross-page anchor in its group, or as a same-page batch when
 *   exactly one linked anchor on that page exists in the group.
 * - Further expansion to a page already in `links` is allowed from phase-1 pages,
 *   or from pages that originally opened that page (prevents sideways story→story
 *   hops while keeping task→story→media chains).
 * - Same-page siblings of the selected id are omitted and cannot bridge.
 */
export function getLinkedComponentIds(
  selectedId: string,
  groups: string[][],
  excludes: Iterable<string> = [],
): { links: Set<string>; memberOrder: string[] } {
  const excludeSet = new Set(excludes);
  const selectedPage = getPageIdPrefix(selectedId);
  const remaining = groups.map((group) => [...group]);
  const links = new Set<string>();
  const memberOrder: string[] = [];
  const lockedPages = new Set<string>();
  const phase1Pages = new Set<string>();
  const firstHopPages = new Map<string, Set<string>>();

  const canUseAsBridge = (id: string) =>
    links.has(id) && canBridgeAsLink(id, selectedId);

  const recordFirstHop = (page: string, anchorPage: string) => {
    const hops = firstHopPages.get(page) ?? new Set<string>();
    hops.add(anchorPage);
    firstHopPages.set(page, hops);
  };

  const canExpandToPage = (page: string, anchorPage: string) => {
    if (!pageHasLinkedMembers(page, memberOrder)) return true;
    if (phase1Pages.has(page)) return false;
    if (phase1Pages.has(anchorPage)) return true;

    const hops = firstHopPages.get(page);
    if (!hops) return true;
    return hops.has(anchorPage);
  };

  const pickAnchor = (
    memberId: string,
    group: string[],
    anchors: string[],
    touchedInMerge: Set<string>,
  ): string | null => {
    const page = getPageIdPrefix(memberId);
    const crossPageAnchors = anchors.filter(
      (anchor) => getPageIdPrefix(anchor) !== page,
    );
    if (crossPageAnchors.length > 0) return crossPageAnchors[0];

    if (
      !pageHasLinkedMembers(page, memberOrder) &&
      !touchedInMerge.has(page) &&
      countGroupMembersOnPageInLinks(group, page, links, selectedId) === 1
    ) {
      return (
        anchors.find((anchor) => getPageIdPrefix(anchor) === page) ?? null
      );
    }

    return null;
  };

  const mergeGroup = (group: string[], phase1: boolean) => {
    const anchors = phase1
      ? []
      : group.filter(
          (id) =>
            (links.has(id) || id === selectedId) &&
            canBridgeAsLink(id, selectedId),
        );
    if (!phase1 && anchors.length === 0) return;

    const touchedInMerge = new Set<string>();

    for (const id of group) {
      if (excludeSet.has(id) || links.has(id)) continue;
      if (!shouldIncludeInLinks(id, selectedId)) continue;

      const page = getPageIdPrefix(id);
      if (lockedPages.has(page)) continue;

      if (phase1) {
        links.add(id);
        memberOrder.push(id);
        phase1Pages.add(page);
        continue;
      }

      const anchor = pickAnchor(id, group, anchors, touchedInMerge);
      if (!anchor) continue;

      const anchorPage = getPageIdPrefix(anchor);
      if (!canExpandToPage(page, anchorPage)) continue;

      const wasEmpty =
        !pageHasLinkedMembers(page, memberOrder) && !touchedInMerge.has(page);
      links.add(id);
      memberOrder.push(id);
      if (wasEmpty) recordFirstHop(page, anchorPage);
      touchedInMerge.add(page);
    }
  };

  const lockPagesAfterPhase1 = () => {
    lockedPages.add(selectedPage);
    for (const page of phase1Pages) {
      const count = memberOrder.filter((id) => getPageIdPrefix(id) === page).length;
      if (count > 1) lockedPages.add(page);
    }
  };

  for (let i = remaining.length - 1; i >= 0; i--) {
    const current = remaining[i];
    if (!current.includes(selectedId)) continue;

    mergeGroup(current, true);
    remaining.splice(i, 1);
  }

  lockPagesAfterPhase1();

  while (remaining.length > 0) {
    let found = false;

    for (let i = remaining.length - 1; i >= 0; i--) {
      const current = remaining[i];
      if (!current.some((id) => canUseAsBridge(id))) continue;

      mergeGroup(current, false);
      remaining.splice(i, 1);
      found = true;
    }

    if (!found) break;
  }

  return { links, memberOrder };
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

  const pageIdByFile = new Map<string, string>();
  for (const page of pages) {
    pageIdByFile.set(page.fileName, page.pageId);
  }

  return {
    index: {
      componentToPage,
      componentData,
      pageIdByFile,
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

const MAX_EXPANDED_PANELS = 3;

export function applyExpandLimits(
  panels: { pageFile: string; expanded: boolean }[],
  _orderedPages: string[],
  currentPage: string,
): { pageFile: string; expanded: boolean }[] {
  const withCurrent = panels.map((panel) => ({
    ...panel,
    expanded: panel.pageFile === currentPage ? true : panel.expanded,
  }));
  return enforceExpandedLimit(withCurrent, currentPage);
}

/** Keep desired expand state; main page stays open; shrink extras past the limit. */
export function enforceExpandedLimit(
  panels: { pageFile: string; expanded: boolean }[],
  currentPage: string,
): { pageFile: string; expanded: boolean }[] {
  let result = panels.map((panel) => ({
    ...panel,
    expanded: panel.pageFile === currentPage ? true : panel.expanded,
  }));

  let expandedCount = result.filter((panel) => panel.expanded).length;
  while (expandedCount > MAX_EXPANDED_PANELS) {
    const toShrink = [...result]
      .reverse()
      .find((panel) => panel.expanded && panel.pageFile !== currentPage);
    if (!toShrink) break;

    result = result.map((panel) =>
      panel.pageFile === toShrink.pageFile ? { ...panel, expanded: false } : panel,
    );
    expandedCount -= 1;
  }

  return result;
}

export function movePanelToFront(
  panels: { pageFile: string; expanded: boolean }[],
  pageFile: string,
  expanded = false,
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

/** Keep the main page at its current panel index when possible; fill other slots from selection order. */
export function buildPanelsPreservingMainPosition(
  existingPanels: { pageFile: string; expanded: boolean }[],
  orderedPages: string[],
  currentPage: string,
): { pageFile: string; expanded: boolean }[] {
  const otherPages = orderedPages.filter((p) => p !== currentPage);
  const existingMap = new Map(existingPanels.map((p) => [p.pageFile, p]));

  const mainIndex = existingPanels.findIndex((p) => p.pageFile === currentPage);
  const resolvedMainIndex =
    mainIndex >= 0
      ? mainIndex
      : orderedPages.length > 3
        ? Math.min(2, Math.max(0, orderedPages.length - 1))
        : Math.max(0, orderedPages.length - 1);

  const slotCount = Math.max(
    existingPanels.length,
    orderedPages.length > 3 ? 3 : orderedPages.length,
    resolvedMainIndex + 1,
  );

  const slots: (string | null)[] = Array.from({ length: slotCount }, () => null);
  slots[resolvedMainIndex] = currentPage;

  let otherIdx = 0;
  for (let i = 0; i < slotCount; i++) {
    if (i === resolvedMainIndex) continue;
    if (otherIdx < otherPages.length) {
      slots[i] = otherPages[otherIdx++];
    }
  }

  const pageOrder = slots.filter((page): page is string => page !== null);
  while (otherIdx < otherPages.length) {
    pageOrder.push(otherPages[otherIdx++]);
  }

  const panels = pageOrder.map((pageFile) => {
    const existing = existingMap.get(pageFile);
    if (existing) {
      return { pageFile, expanded: existing.expanded };
    }
    return { pageFile, expanded: false };
  });

  return enforceExpandedLimit(panels, currentPage);
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
