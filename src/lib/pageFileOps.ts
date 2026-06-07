import type { Component, PageData } from '../types';
import { collectActionImageFilenames } from './actionComponent';
import { serializePageComponents } from './pageIds';
import { mdSidecarFileName } from './mdFiles';
import { ensureDocsDirectory, getDocsDirectoryIfPresent } from './docsFolder';

function collectImageFilenames(pages: PageData[]): Set<string> {
  const names = new Set<string>();
  for (const page of pages) {
    for (const component of page.components) {
      if (component.type === 'img') {
        const name = component.content.trim();
        if (name) names.add(name);
        continue;
      }
      if (component.type === 'action') {
        for (const name of collectActionImageFilenames(component.content)) {
          names.add(name);
        }
      }
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
    if (component.type === 'action') {
      for (const name of collectActionImageFilenames(component.content)) {
        if (!imagesInUse.has(name)) imageFilenames.push(name);
      }
    }
    if (component.type === 'md' && !mdInUse.has(component.id)) {
      mdComponentIds.push(component.id);
    }
  }

  return { imageFilenames, mdComponentIds };
}

async function writeRawFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  contents: string,
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  if (!fileHandle.createWritable) {
    throw new Error('This browser does not support saving files to the selected folder');
  }
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

export async function renamePageFileOnDisk(
  root: FileSystemDirectoryHandle,
  oldFileName: string,
  newFileName: string,
): Promise<void> {
  const docsHandle = await getDocsDirectoryIfPresent(root);
  if (!docsHandle) return;
  const oldHandle = await docsHandle.getFileHandle(oldFileName);
  const file = await oldHandle.getFile();
  const text = await file.text();
  await writeRawFile(docsHandle, newFileName, text);
  await docsHandle.removeEntry(oldFileName);
}

export async function deleteImageFileOnDisk(
  root: FileSystemDirectoryHandle,
  fileName: string,
): Promise<void> {
  const docsHandle = await getDocsDirectoryIfPresent(root);
  if (!docsHandle) return;
  try {
    await docsHandle.removeEntry(fileName);
  } catch {
    // file may not exist
  }
}

export async function deletePageFileOnDisk(
  root: FileSystemDirectoryHandle,
  fileName: string,
  orphaned: { imageFilenames: string[]; mdComponentIds: string[] } = {
    imageFilenames: [],
    mdComponentIds: [],
  },
): Promise<void> {
  const docsHandle = await getDocsDirectoryIfPresent(root);
  if (!docsHandle) return;
  await docsHandle.removeEntry(fileName);
  for (const componentId of orphaned.mdComponentIds) {
    await deleteMdFileOnDisk(root, componentId);
  }
  for (const imageName of orphaned.imageFilenames) {
    await deleteImageFileOnDisk(root, imageName);
  }
}

export async function deleteMdFileOnDisk(
  root: FileSystemDirectoryHandle,
  componentId: string,
): Promise<void> {
  const docsHandle = await getDocsDirectoryIfPresent(root);
  if (!docsHandle) return;
  try {
    await docsHandle.removeEntry(mdSidecarFileName(componentId));
  } catch {
    // file may not exist yet
  }
}

export async function createPageFileOnDisk(
  root: FileSystemDirectoryHandle,
  fileName: string,
  components: Component[],
  pageId: string,
): Promise<void> {
  const docsHandle = await ensureDocsDirectory(root);
  const serialized = serializePageComponents(components, pageId);
  await writeRawFile(docsHandle, fileName, `${JSON.stringify(serialized, null, 2)}\n`);
}
