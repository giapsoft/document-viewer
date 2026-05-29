import type { Component } from '../types';
import { serializePageComponents } from './pageIds';
import { mdSidecarFileName } from './mdFiles';
import { ensureDocsDirectory, getDocsDirectoryIfPresent } from './docsFolder';

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

export async function deletePageFileOnDisk(
  root: FileSystemDirectoryHandle,
  fileName: string,
  mdComponentIds: string[] = [],
): Promise<void> {
  const docsHandle = await getDocsDirectoryIfPresent(root);
  if (!docsHandle) return;
  await docsHandle.removeEntry(fileName);
  for (const componentId of mdComponentIds) {
    await deleteMdFileOnDisk(root, componentId);
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
