import type { LoadedProject, RelationsFile } from '../types';
import { collectActionImageFilenamesFromProject } from './actionComponent';
import { serializePageComponents } from './pageIds';
import { mdSidecarFileName } from './mdFiles';
import { assembleProject, type RawProjectInput } from './loadProject';

const PAGE_EXT = /\.p$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif)$/i;

export const STORAGE_BUCKET = 'docs';

export function relationsStoragePath(docId: string): string {
  return `${docId}/relations.json`;
}

export function groupsStoragePath(docId: string): string {
  return `${docId}/groups.json`;
}

export function commentsStoragePath(docId: string): string {
  return `${docId}/comments.json`;
}

export function docsStoragePath(docId: string, fileName: string): string {
  return `${docId}/docs/${fileName}`;
}

export function isGroupsPath(path: string, docId: string): boolean {
  return path === groupsStoragePath(docId);
}

export function isCommentsPath(path: string, docId: string): boolean {
  return path === commentsStoragePath(docId);
}

export function projectToRawInput(project: LoadedProject): RawProjectInput {
  const pageFiles = project.pages.map((page) => ({
    name: page.fileName,
    content: serializePageComponents(page.components, page.pageId),
  }));

  const mdFiles = [...project.mdFiles.entries()].map(([componentId, content]) => ({
    componentId,
    content,
  }));

  const referencedImages = collectReferencedImageNames(project);
  const imageFiles = [...referencedImages]
    .map((name) => {
      const blob = project.imageBlobs.get(name);
      return blob ? { name, blob } : null;
    })
    .filter((entry): entry is { name: string; blob: Blob } => entry !== null);

  return {
    pageFiles,
    relations: project.relations,
    stylesPartial: null,
    imageFiles,
    mdFiles,
  };
}

export function assembleLoadedProject(
  input: RawProjectInput,
  meta: {
    source: LoadedProject['source'];
    remoteDocId?: string | null;
    remoteTitle?: string | null;
    folderHandle?: FileSystemDirectoryHandle | null;
    remoteSync?: LoadedProject['remoteSync'];
    remoteUpdatedAt?: string | null;
  },
): LoadedProject {
  const project = assembleProject(input);
  return {
    ...project,
    source: meta.source,
    remoteDocId: meta.remoteDocId ?? null,
    remoteTitle: meta.remoteTitle ?? null,
    folderHandle: meta.folderHandle ?? null,
    remoteSync: meta.remoteSync ?? null,
    remoteUpdatedAt: meta.remoteUpdatedAt ?? null,
  };
}

export function collectReferencedImageNames(project: LoadedProject): Set<string> {
  const names = new Set<string>();
  for (const page of project.pages) {
    for (const component of page.components) {
      if (component.type === 'img') {
        const name = component.content.trim();
        if (name) names.add(name);
      }
    }
  }
  for (const name of collectActionImageFilenamesFromProject(project.pages)) {
    names.add(name);
  }
  return names;
}

export function collectReferencedMdComponentIds(project: LoadedProject): Set<string> {
  const ids = new Set<string>();
  for (const page of project.pages) {
    for (const component of page.components) {
      if (component.type === 'md') ids.add(component.id);
    }
  }
  return ids;
}

export function collectReferencedMdFiles(project: LoadedProject): Map<string, string> {
  const files = new Map<string, string>();
  for (const page of project.pages) {
    for (const component of page.components) {
      if (component.type !== 'md') continue;
      files.set(component.id, project.mdFiles.get(component.id) ?? '');
    }
  }
  return files;
}

export function parseStorageFileName(path: string, docId: string): string | null {
  const prefix = `${docId}/docs/`;
  if (!path.startsWith(prefix)) return null;
  return path.slice(prefix.length);
}

export function isPageFileName(name: string): boolean {
  return PAGE_EXT.test(name);
}

export function isImageFileName(name: string): boolean {
  return IMAGE_EXT.test(name);
}

export function isRelationsPath(path: string, docId: string): boolean {
  return path === relationsStoragePath(docId);
}

export type RemoteImageHandler = (name: string, blob: Blob) => void;

export { mdSidecarFileName, PAGE_EXT, IMAGE_EXT };

export type RemoteDocumentMeta = {
  id: string;
  title: string;
  updated_at: string;
};

export function defaultRemoteTitle(project: LoadedProject): string {
  if (project.remoteTitle?.trim()) return project.remoteTitle.trim();
  const firstPage = project.pages[0];
  if (firstPage?.pageName) return firstPage.pageName;
  if (firstPage?.pageId) return firstPage.pageId;
  return 'Untitled document';
}

export function normalizeDocumentTitle(title: string): string {
  return title.trim();
}

export function relationsFromRaw(raw: unknown): RelationsFile {
  return raw as RelationsFile;
}
