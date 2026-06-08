import type { Component } from '../types';

export function parseComponentVersion(raw: unknown): number {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) {
    return raw;
  }
  return 0;
}

export function getComponentVersion(component: Pick<Component, 'version'>): number {
  return parseComponentVersion(component.version);
}

export function bumpComponentVersion(component: Component): Component {
  return {
    ...component,
    version: getComponentVersion(component) + 1,
  };
}

function patchesComponentData(
  component: Component,
  patch: Partial<Omit<Component, 'id'>>,
): boolean {
  if (patch.status !== undefined && patch.status !== component.status) return true;
  if (patch.type !== undefined && patch.type !== component.type) return true;
  if (patch.content !== undefined && patch.content !== component.content) return true;
  return false;
}

export function applyComponentPatchWithVersion(
  component: Component,
  patch: Partial<Omit<Component, 'id'>>,
): Component {
  const next: Component = { ...component, ...patch };
  if (next.type === 'md') {
    next.content = '';
  }

  if (patch.version !== undefined) {
    next.version = parseComponentVersion(patch.version);
    return next;
  }

  if (patchesComponentData(component, patch)) {
    next.version = getComponentVersion(component) + 1;
  }

  return next;
}
