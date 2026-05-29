import type { Component, ComponentType, ComponentStatus, ResolvedComponent } from '../types';

export function resolveComponentForDisplay(
  component: Component,
  mdFiles?: Map<string, string>,
): ResolvedComponent {
  const content =
    component.type === 'md'
      ? (mdFiles?.get(component.id) ?? '')
      : component.content;

  return {
    id: component.id,
    type: component.type,
    status: component.status,
    content,
  };
}

export function isTextType(
  type: ComponentType,
): type is Exclude<ComponentType, 'img' | 'md'> {
  return type !== 'img' && type !== 'md';
}

export function isValidStatus(status: string): status is ComponentStatus {
  return ['pending', 'working', 'done', 'blocked', 'undefined'].includes(status);
}

export function isValidType(type: string): type is ComponentType {
  return ['header', 'title', 'body', 'listItem', 'img', 'md'].includes(type);
}
