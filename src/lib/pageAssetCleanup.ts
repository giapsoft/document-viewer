import type { PageData } from '../types';

function collectImageFilenames(pages: PageData[]): Set<string> {
  const names = new Set<string>();
  for (const page of pages) {
    for (const component of page.components) {
      if (component.type !== 'img') continue;
      const name = component.content.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

function collectMdComponentIds(pages: PageData[]): Set<string> {
  const ids = new Set<string>();
  for (const page of pages) {
    for (const component of page.components) {
      if (component.type === 'md') ids.add(component.id);
    }
  }
  return ids;
}

/** Assets on `deletedPage` not referenced by any component on `remainingPages`. */
export function getOrphanedPageAssets(
  deletedPage: PageData,
  remainingPages: PageData[],
): { imageFilenames: string[]; mdComponentIds: string[] } {
  const imagesInUse = collectImageFilenames(remainingPages);
  const mdInUse = collectMdComponentIds(remainingPages);

  const imageFilenames: string[] = [];
  const mdComponentIds: string[] = [];

  for (const component of deletedPage.components) {
    if (component.type === 'img') {
      const name = component.content.trim();
      if (name && !imagesInUse.has(name)) imageFilenames.push(name);
    }
    if (component.type === 'md' && !mdInUse.has(component.id)) {
      mdComponentIds.push(component.id);
    }
  }

  return { imageFilenames, mdComponentIds };
}
