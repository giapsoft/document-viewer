import type { Component } from '../types';
import { getComponentVersion } from './componentVersion';
import { isComponentRead, type ComponentReadState } from './readState';

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
