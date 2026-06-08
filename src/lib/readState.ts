import type { LoadedProject, PageData } from '../types';
import { getComponentVersion } from './componentVersion';

export const READ_USERNAME_PATTERN = /^[A-Za-z0-9]{1,20}$/;

export type ComponentReadState = Record<string, number>;

export function normalizeReadUsername(input: string): string | null {
  const trimmed = input.trim();
  if (!READ_USERNAME_PATTERN.test(trimmed)) return null;
  return trimmed;
}

export function readStateFileName(username: string): string {
  return `${username}.reads.json`;
}

export function parseReadStateFile(raw: unknown): ComponentReadState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: ComponentReadState = {};
  for (const [componentId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
      result[componentId] = value;
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

export function formatPageComponentCount(
  total: number,
  unreadCount?: number | null,
): string {
  if (unreadCount != null) return `${unreadCount}/${total}`;
  return String(total);
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
