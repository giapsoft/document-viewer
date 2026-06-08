import type { Component, PageData } from '../types';
import { getComponentVersion } from './componentVersion';
import { isComponentRead, type ComponentReadState } from './readState';

export interface ComponentLocation {
  pageFile: string;
  componentId: string;
}

export function getAdjacentComponentId(
  components: Component[],
  currentId: string,
  direction: 'up' | 'down',
): string | null {
  const index = components.findIndex((component) => component.id === currentId);
  if (index < 0) return null;
  const nextIndex = direction === 'down' ? index + 1 : index - 1;
  if (nextIndex < 0 || nextIndex >= components.length) return null;
  return components[nextIndex]?.id ?? null;
}

export function findNextUnreadComponentId(
  components: Component[],
  currentId: string,
  readState: ComponentReadState,
): string | null {
  const currentIndex = components.findIndex((component) => component.id === currentId);
  const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;

  for (let index = startIndex; index < components.length; index += 1) {
    const component = components[index]!;
    if (!isComponentRead(component.id, getComponentVersion(component), readState)) {
      return component.id;
    }
  }

  const wrapEnd = currentIndex >= 0 ? currentIndex : components.length;
  for (let index = 0; index < wrapEnd; index += 1) {
    const component = components[index]!;
    if (!isComponentRead(component.id, getComponentVersion(component), readState)) {
      return component.id;
    }
  }

  return null;
}

export function buildGlobalComponentOrder(
  pages: PageData[],
  pageOrder: string[],
): ComponentLocation[] {
  const pageByFile = new Map(pages.map((page) => [page.fileName, page]));
  const seenPages = new Set<string>();
  const order: ComponentLocation[] = [];

  const orderedFiles =
    pageOrder.length > 0 ? pageOrder : pages.map((page) => page.fileName);

  for (const pageFile of orderedFiles) {
    const page = pageByFile.get(pageFile);
    if (!page) continue;
    seenPages.add(pageFile);
    for (const component of page.components) {
      order.push({ pageFile, componentId: component.id });
    }
  }

  for (const page of pages) {
    if (seenPages.has(page.fileName)) continue;
    for (const component of page.components) {
      order.push({ pageFile: page.fileName, componentId: component.id });
    }
  }

  return order;
}

function isLocationUnread(
  location: ComponentLocation,
  pages: PageData[],
  readState: ComponentReadState,
): boolean {
  const page = pages.find((entry) => entry.fileName === location.pageFile);
  const component = page?.components.find((entry) => entry.id === location.componentId);
  if (!component) return false;
  return !isComponentRead(component.id, getComponentVersion(component), readState);
}

export function findUnreadComponentGlobally(
  pages: PageData[],
  pageOrder: string[],
  readState: ComponentReadState,
  anchorComponentId: string | null,
  direction: 'forward' | 'backward',
): ComponentLocation | null {
  const order = buildGlobalComponentOrder(pages, pageOrder);
  const unreadLocations = order.filter((location) =>
    isLocationUnread(location, pages, readState),
  );

  if (unreadLocations.length === 0) return null;

  const anchorIndex =
    anchorComponentId != null
      ? order.findIndex((location) => location.componentId === anchorComponentId)
      : -1;

  if (direction === 'forward') {
    for (const location of order) {
      if (!isLocationUnread(location, pages, readState)) continue;
      const index = order.indexOf(location);
      if (index > anchorIndex) return location;
    }
    return unreadLocations[0] ?? null;
  }

  for (let index = order.length - 1; index >= 0; index -= 1) {
    const location = order[index]!;
    if (!isLocationUnread(location, pages, readState)) continue;
    if (index < anchorIndex) return location;
  }
  return unreadLocations[unreadLocations.length - 1] ?? null;
}
