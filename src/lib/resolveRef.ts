import type { Component, ComponentType, ComponentStatus, ResolvedComponent } from '../types';

export function getRefTargetId(component: Component): string | null {
  if (component.type !== 'ref') return null;
  const targetId = component.content.trim();
  return targetId || null;
}

export function resolveRefTarget(
  component: Component,
  componentData: Map<string, Component>,
  visited = new Set<string>(),
): Component | null {
  if (component.type !== 'ref') return component;

  const targetId = component.content.trim();
  if (!targetId) return null;
  if (visited.has(component.id)) return null;

  visited.add(component.id);
  const target = componentData.get(targetId);
  if (!target) return null;

  if (target.type === 'ref') {
    return resolveRefTarget(target, componentData, visited);
  }
  return target;
}

export function resolveComponentForDisplay(
  component: Component,
  componentData: Map<string, Component>,
  mdFiles?: Map<string, string>,
  visited = new Set<string>(),
): ResolvedComponent {
  if (component.type !== 'ref') {
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

  if (visited.has(component.id)) {
    return {
      id: component.id,
      type: 'body',
      status: component.status,
      content: component.content,
      refError: '[circular ref]',
    };
  }

  const targetId = component.content.trim();
  if (!targetId) {
    return {
      id: component.id,
      type: 'body',
      status: component.status,
      content: '',
      refError: '[ref: empty target id]',
    };
  }

  const target = componentData.get(targetId);
  if (!target) {
    return {
      id: component.id,
      type: 'body',
      status: component.status,
      content: targetId,
      refError: `[ref not found: ${targetId}]`,
    };
  }

  visited.add(component.id);

  if (target.type === 'ref') {
    const resolved = resolveComponentForDisplay(target, componentData, mdFiles, visited);
    return {
      id: component.id,
      type: resolved.type,
      status: resolved.status,
      content: resolved.content,
      refError: resolved.refError,
    };
  }

  const content =
    target.type === 'md' ? (mdFiles?.get(target.id) ?? '') : target.content;

  return {
    id: component.id,
    type: target.type,
    status: target.status,
    content,
  };
}

export function getConnectorTraceId(
  component: Component,
  componentData: Map<string, Component>,
): string {
  const resolved = resolveRefTarget(component, componentData);
  return resolved?.id ?? component.content.trim() ?? component.id;
}

export function isTextType(type: ComponentType): type is Exclude<ComponentType, 'img' | 'md' | 'ref'> {
  return type !== 'img' && type !== 'md' && type !== 'ref';
}

export function isValidStatus(status: string): status is ComponentStatus {
  return ['pending', 'working', 'done', 'blocked', 'undefined'].includes(status);
}

export function isValidType(type: string): type is ComponentType {
  return ['header', 'title', 'body', 'listItem', 'img', 'md', 'ref'].includes(type);
}
