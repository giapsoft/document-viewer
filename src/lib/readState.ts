import type { LoadedProject, PageData } from '../types';
import { getComponentVersion } from './componentVersion';

export const READ_USERNAME_PATTERN = /^[A-Za-z0-9]{1,20}$/;

export type ComponentReadState = Record<string, number>;

/** Shallow value equality — avoids false changes when reducers assign fresh `{}` objects. */
export function readStateMapsEqual(
  a: ComponentReadState,
  b: ComponentReadState,
): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

export function normalizeReadUsername(input: string): string | null {
  const trimmed = input.trim();
  if (!READ_USERNAME_PATTERN.test(trimmed)) return null;
  return trimmed;
}

export function readStateFileName(username: string): string {
  return `${username}.reads.json`;
}

export function parseReadStateFile(raw: unknown): ComponentReadState {
  if (Array.isArray(raw)) {
    const result: ComponentReadState = {};
    for (const entry of raw) {
      if (typeof entry === 'string' && entry.length > 0) {
        result[entry] = Math.max(result[entry] ?? -1, 0);
      }
    }
    return result;
  }
  if (!raw || typeof raw !== 'object') return {};
  const result: ComponentReadState = {};
  for (const [componentId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      result[componentId] = Math.max(result[componentId] ?? -1, value);
    }
  }
  return result;
}

export function isComponentRead(
  componentId: string,
  componentVersion: number,
  readState: ComponentReadState,
): boolean {
  const readVersion = readState[componentId];
  return readVersion !== undefined && readVersion >= componentVersion;
}

export function markComponentRead(
  readState: ComponentReadState,
  componentId: string,
  version: number,
): ComponentReadState {
  const current = readState[componentId];
  if (current !== undefined && current >= version) return readState;
  return { ...readState, [componentId]: version };
}

export function markComponentUnread(
  readState: ComponentReadState,
  componentId: string,
): ComponentReadState {
  const next = { ...readState };
  delete next[componentId];
  return next;
}

export function countUnreadComponentsOnPage(
  components: PageData['components'],
  readState: ComponentReadState,
): number {
  let count = 0;
  for (const component of components) {
    if (!isComponentRead(component.id, getComponentVersion(component), readState)) {
      count += 1;
    }
  }
  return count;
}

export function countReadComponentsOnPage(
  components: PageData['components'],
  readState: ComponentReadState,
): number {
  return components.length - countUnreadComponentsOnPage(components, readState);
}

export function formatPageComponentCount(
  total: number,
  unreadCount?: number | null,
): string {
  if (unreadCount != null) return `${unreadCount}/${total}`;
  return String(total);
}

export function mergeReadStates(
  ...states: ComponentReadState[]
): ComponentReadState {
  const merged: ComponentReadState = {};
  for (const state of states) {
    for (const [componentId, version] of Object.entries(state)) {
      merged[componentId] = Math.max(merged[componentId] ?? -1, version);
    }
  }
  return merged;
}

export function markAllComponentsReadOnPage(
  components: PageData['components'],
  readState: ComponentReadState,
): ComponentReadState {
  const next = { ...readState };
  for (const component of components) {
    next[component.id] = getComponentVersion(component);
  }
  return next;
}

export function markAllComponentsUnreadOnPage(
  components: PageData['components'],
  readState: ComponentReadState,
): ComponentReadState {
  const next = { ...readState };
  for (const component of components) {
    delete next[component.id];
  }
  return next;
}

export function toggleAllComponentsReadOnPage(
  components: PageData['components'],
  readState: ComponentReadState,
): ComponentReadState {
  if (countUnreadComponentsOnPage(components, readState) > 0) {
    return markAllComponentsReadOnPage(components, readState);
  }
  return markAllComponentsUnreadOnPage(components, readState);
}

export function resolveProjectReadKey(project: LoadedProject): string {
  if (project.remoteDocId) return project.remoteDocId;
  const pageKey = project.pages
    .map((page) => page.fileName)
    .sort()
    .join('|');
  return pageKey || 'draft';
}

export function readStateStorageKey(projectKey: string, username: string): string {
  return `doc-viewer-reads-${projectKey}-${username}`;
}
