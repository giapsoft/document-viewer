import type { LoadedProject } from '../types';
import { toGlobalComponentId } from './pageIds';

function isExternalHref(href: string): boolean {
  return (
    /^https?:\/\//i.test(href) ||
    /^mailto:/i.test(href) ||
    href.startsWith('#') ||
    href.startsWith('/')
  );
}

/** Resolve markdown link target to a global component id when it exists in the project. */
export function resolveMarkdownComponentLink(
  href: string,
  sourcePageFile: string,
  project: LoadedProject,
): string | null {
  const trimmed = href.trim();
  if (!trimmed || isExternalHref(trimmed)) return null;

  const { componentData, pageIdByFile } = project.index;
  if (componentData.has(trimmed)) return trimmed;

  const pageId = pageIdByFile.get(sourcePageFile);
  if (!pageId) return null;

  const globalId = toGlobalComponentId(pageId, trimmed);
  return componentData.has(globalId) ? globalId : null;
}

export function createMarkdownComponentLinkResolver(
  sourcePageFile: string,
  project: LoadedProject,
): (href: string) => string | null {
  return (href) => resolveMarkdownComponentLink(href, sourcePageFile, project);
}
