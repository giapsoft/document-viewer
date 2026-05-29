import type { Component, PageData } from '../types';

/**
 * Id terminology: pageId (file stem), local id (in .p), global id (pageId.localId in app).
 */

/** Fixed from file name — stem without .p; never user-editable. */
export function resolvePageId(fileName: string): string {
  return fileName.replace(/\.p$/i, '');
}

/** Display label from relations.pageNames[fileName], default = pageId. */
export function resolvePageName(
  fileName: string,
  pageNames: Record<string, string> | undefined,
): string {
  const mapped = pageNames?.[fileName]?.trim();
  if (mapped) return mapped;
  return resolvePageId(fileName);
}

export function fileStemFromPageFile(fileName: string): string {
  return fileName.replace(/\.p$/i, '');
}

export function normalizePageName(input: string): string | null {
  const name = input.trim();
  if (!name) return null;
  return name;
}

/** True if id is already a global id (contains `.`). */
export function isGlobalComponentId(id: string): boolean {
  return id.includes('.');
}

/** Build global id from pageId and raw id from disk (local or already global). */
export function toGlobalComponentId(pageId: string, rawId: string): string {
  const trimmed = rawId.trim();
  if (!trimmed) return `${pageId}.c1`;
  if (isGlobalComponentId(trimmed)) return trimmed;
  return `${pageId}.${trimmed}`;
}

export function toLocalComponentId(pageId: string, globalId: string): string {
  const prefix = `${pageId}.`;
  if (globalId.startsWith(prefix)) return globalId.slice(prefix.length);
  return globalId;
}

/** Next auto id: c1, c2, … (skips taken local parts on this page). */
export function generateLocalComponentId(
  components: Component[],
  pageId: string,
): string {
  const taken = new Set<string>();
  for (const component of components) {
    taken.add(toLocalComponentId(pageId, component.id));
  }

  let n = 1;
  while (taken.has(`c${n}`)) n += 1;
  return `c${n}`;
}

export function createComponentId(pageId: string, components: Component[]): string {
  const local = generateLocalComponentId(components, pageId);
  return `${pageId}.${local}`;
}

export function normalizeRefContent(
  content: string,
  fromPageId: string,
): string {
  const target = content.trim();
  if (!target) return target;
  if (isGlobalComponentId(target)) return target;
  return `${fromPageId}.${target}`;
}

export function normalizePageComponents(
  components: Component[],
  pageId: string,
  fileName: string,
  warnings: string[],
): Component[] {
  return components.map((component, index) => {
    const rawId = component.id.trim();
    const globalId = toGlobalComponentId(pageId, rawId);

    if (rawId && isGlobalComponentId(rawId)) {
      const expectedPrefix = `${pageId}.`;
      if (!rawId.startsWith(expectedPrefix)) {
        warnings.push(
          `${fileName}[${index}]: global id "${rawId}" does not match pageId "${pageId}"`,
        );
      }
    }

    let content = component.content;
    if (component.type === 'ref') {
      content = normalizeRefContent(content, pageId);
    } else if (component.type === 'md') {
      content = '';
    }

    return {
      ...component,
      id: globalId,
      content,
    };
  });
}

export function serializePageComponents(
  components: Component[],
  pageId: string,
): Component[] {
  return components.map((component) => ({
    ...component,
    id: toLocalComponentId(pageId, component.id),
    content: component.type === 'md' ? '' : component.content,
  }));
}

export function buildPageIdByFile(pages: PageData[]): Map<string, string> {
  return new Map(pages.map((page) => [page.fileName, page.pageId]));
}
