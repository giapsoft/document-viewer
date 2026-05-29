import type { RelationsFile } from '../types';

export function cloneGroups(groups: string[][]): string[][] {
  return groups.map((group) => [...group]);
}

export function normalizeRelations(relations: RelationsFile): RelationsFile {
  const groups = Array.isArray(relations.groups) ? relations.groups : [];
  const pinnedPages = Array.isArray(relations.pinnedPages)
    ? [...new Set(relations.pinnedPages.filter((f) => typeof f === 'string' && f.trim()))]
    : [];
  return {
    pageNames: relations.pageNames ? { ...relations.pageNames } : {},
    pinnedPages,
    groups: cloneGroups(groups),
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
  if (filtered.length === 0) {
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
