import type { RelationsFile } from '../types';
import { commentsForPersistence, normalizeComments } from './comments';

export function cloneGroups(groups: string[][]): string[][] {
  return groups.map((group) => [...group]);
}

export function groupsEqual(a: string[][], b: string[][]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].length !== b[i].length) return false;
    const sortedA = [...a[i]].sort();
    const sortedB = [...b[i]].sort();
    for (let j = 0; j < sortedA.length; j++) {
      if (sortedA[j] !== sortedB[j]) return false;
    }
  }
  return true;
}

export function normalizeRelations(relations: RelationsFile): RelationsFile {
  const groups = Array.isArray(relations.groups) ? relations.groups : [];
  const pinnedPages = Array.isArray(relations.pinnedPages)
    ? [...new Set(relations.pinnedPages.filter((f) => typeof f === 'string' && f.trim()))]
    : [];
  const pageOrder = Array.isArray(relations.pageOrder)
    ? [...new Set(relations.pageOrder.filter((f) => typeof f === 'string' && f.trim()))]
    : [];
  const comments = commentsForPersistence(normalizeComments(relations.comments));
  return {
    pageNames: relations.pageNames ? { ...relations.pageNames } : {},
    pinnedPages,
    pageOrder,
    groups: pruneGroups(cloneGroups(groups)),
    comments,
  };
}

/** Update groups without dropping pageNames, pinnedPages, etc. */
export function withRelationsGroups(
  relations: RelationsFile,
  groups: string[][],
): RelationsFile {
  return normalizeRelations({ ...relations, groups });
}

export const EMPTY_RELATIONS: RelationsFile = { pageNames: {}, pinnedPages: [], groups: [] };

/** Groups with fewer members are dropped after removals. */
export const MIN_GROUP_MEMBER_COUNT = 2;

function pageIdPrefixFromComponentId(componentId: string): string {
  const dot = componentId.indexOf('.');
  return dot >= 0 ? componentId.slice(0, dot) : componentId;
}

/** True when every member shares the same page id prefix (same page). */
export function isSamePageOnlyGroup(group: string[]): boolean {
  if (group.length === 0) return false;
  const pagePrefix = pageIdPrefixFromComponentId(group[0]);
  return group.every((id) => pageIdPrefixFromComponentId(id) === pagePrefix);
}

/** Groups need cross-page links — singletons and same-page-only groups are dropped. */
export function isRetainedGroup(group: string[]): boolean {
  return group.length >= MIN_GROUP_MEMBER_COUNT && !isSamePageOnlyGroup(group);
}

export function pruneGroups(groups: string[][]): string[][] {
  return groups.filter(isRetainedGroup);
}

export function removeMemberIdsFromGroups(
  groups: string[][],
  memberIds: Iterable<string>,
): string[][] {
  const removeSet = new Set(memberIds);
  return pruneGroups(
    groups.map((group) => group.filter((id) => !removeSet.has(id))),
  );
}

export function getGroupIndicesForComponent(
  groups: string[][],
  componentId: string,
): number[] {
  const indices: number[] = [];
  groups.forEach((group, index) => {
    if (group.includes(componentId)) indices.push(index);
  });
  return indices;
}

export function addComponentToGroup(
  groups: string[][],
  groupIndex: number,
  componentId: string,
): string[][] {
  const next = cloneGroups(groups);
  const group = next[groupIndex];
  if (!group || group.includes(componentId)) return next;
  next[groupIndex] = [...group, componentId];
  return next;
}

export function removeComponentFromGroup(
  groups: string[][],
  groupIndex: number,
  componentId: string,
): { groups: string[][]; removedGroupIndex: number | null } {
  const next = cloneGroups(groups);
  const group = next[groupIndex];
  if (!group) return { groups: next, removedGroupIndex: null };

  const filtered = group.filter((id) => id !== componentId);
  if (!isRetainedGroup(filtered)) {
    next.splice(groupIndex, 1);
    return { groups: next, removedGroupIndex: groupIndex };
  }

  next[groupIndex] = filtered;
  return { groups: next, removedGroupIndex: null };
}

export function createGroup(groups: string[][], componentIds: string[]): string[][] {
  const unique = [...new Set(componentIds)];
  if (unique.length === 0) return cloneGroups(groups);
  return [...cloneGroups(groups), unique];
}

export const MAX_PAGES_PER_GROUP = 2;

export const LINK_GROUP_MAX_PAGES_TOAST =
  'A link group can only include components from up to 2 pages.';

export function getGroupMemberPageFiles(
  group: string[],
  componentToPage: Map<string, string>,
): Set<string> {
  const pages = new Set<string>();
  for (const id of group) {
    const pageFile = componentToPage.get(id);
    if (pageFile) pages.add(pageFile);
  }
  return pages;
}

/** False when adding `componentId` would put members on more than `maxPages` page files. */
export function canAddComponentToGroupByPageLimit(
  group: string[],
  componentId: string,
  componentToPage: Map<string, string>,
  maxPages = MAX_PAGES_PER_GROUP,
): boolean {
  if (group.includes(componentId)) return true;

  const pages = getGroupMemberPageFiles(group, componentToPage);
  const pageFile = componentToPage.get(componentId);
  if (!pageFile) return false;
  if (pages.has(pageFile)) return true;
  return pages.size < maxPages;
}

export function removeGroupAtIndex(groups: string[][], groupIndex: number): string[][] {
  if (groupIndex < 0 || groupIndex >= groups.length) return cloneGroups(groups);
  const next = cloneGroups(groups);
  next.splice(groupIndex, 1);
  return next;
}

export function renameComponentInGroups(
  groups: string[][],
  oldId: string,
  newId: string,
): string[][] {
  if (oldId === newId) return cloneGroups(groups);
  return groups.map((group) => group.map((id) => (id === oldId ? newId : id)));
}

export function adjustGroupIndexAfterRemoval(
  groupIndex: number | null,
  removedGroupIndex: number,
): number | null {
  if (groupIndex === null) return null;
  if (groupIndex === removedGroupIndex) return null;
  if (groupIndex > removedGroupIndex) return groupIndex - 1;
  return groupIndex;
}
