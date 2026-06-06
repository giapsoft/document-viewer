import JSZip from 'jszip';
import type { LoadedProject, RelationsFile, RemoteSyncState } from '../types';
import { serializePageComponents } from './pageIds';
import { mdSidecarFileName, componentIdFromMdFileName, MD_FILE_EXT } from './mdFiles';
import { assembleProject, type RawProjectInput } from './loadProject';
import { fingerprintBlob } from './fileFingerprint';

const PAGE_EXT = /\.p$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif)$/i;

export const STORAGE_BUCKET = 'docs';
export const BUNDLE_FILE_NAME = 'bundle.zip';
const RELATIONS_ZIP_PATH = 'relations.json';
const DOCS_ZIP_PREFIX = 'docs/';

export function storagePrefix(docId: string): string {
  return docId;
}

export function bundleStoragePath(docId: string): string {
  return `${docId}/${BUNDLE_FILE_NAME}`;
}

export function relationsStoragePath(docId: string): string {
  return `${docId}/relations.json`;
}

export function docsStoragePath(docId: string, fileName: string): string {
  return `${docId}/docs/${fileName}`;
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

export async function packProjectBundle(project: LoadedProject): Promise<Blob> {
  const raw = projectToRawInput(project);
  const zip = new JSZip();
  zip.file(RELATIONS_ZIP_PATH, `${JSON.stringify(raw.relations, null, 2)}\n`);

  for (const page of raw.pageFiles) {
    zip.file(`${DOCS_ZIP_PREFIX}${page.name}`, `${JSON.stringify(page.content, null, 2)}\n`);
  }

  const referencedMd = collectReferencedMdFiles(project);
  for (const [componentId, content] of referencedMd.entries()) {
    zip.file(`${DOCS_ZIP_PREFIX}${mdSidecarFileName(componentId)}`, content);
  }

  for (const { name, blob } of raw.imageFiles) {
    zip.file(`${DOCS_ZIP_PREFIX}${name}`, blob);
  }

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export async function unpackProjectBundle(bundle: Blob): Promise<RawProjectInput> {
  const zip = await JSZip.loadAsync(bundle);
  const relationsEntry = zip.file(RELATIONS_ZIP_PATH);
  if (!relationsEntry) {
    throw new Error('Bundle is missing relations.json');
  }

  const relations = relationsFromRaw(JSON.parse(await relationsEntry.async('text')));
  const pageFiles: { name: string; content: unknown }[] = [];
  const imageFiles: { name: string; blob: Blob }[] = [];
  const mdFiles: { componentId: string; content: string }[] = [];

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || path === RELATIONS_ZIP_PATH) continue;
    if (!path.startsWith(DOCS_ZIP_PREFIX)) continue;

    const fileName = path.slice(DOCS_ZIP_PREFIX.length);
    if (!fileName) continue;

    if (isPageFileName(fileName)) {
      pageFiles.push({ name: fileName, content: JSON.parse(await entry.async('text')) });
    } else if (isImageFileName(fileName)) {
      imageFiles.push({ name: fileName, blob: await entry.async('blob') });
    } else if (MD_FILE_EXT.test(fileName)) {
      const componentId = componentIdFromMdFileName(fileName);
      if (componentId) {
        mdFiles.push({ componentId, content: await entry.async('text') });
      }
    }
  }

  if (pageFiles.length === 0) {
    throw new Error('Bundle has no page files');
  }

  return { pageFiles, relations, stylesPartial: null, imageFiles, mdFiles };
}

export async function createBundleSyncState(bundle: Blob): Promise<RemoteSyncState> {
  return {
    format: 'bundle',
    bundleHash: await fingerprintBlob(bundle),
  };
}

export function assembleLoadedProject(
  input: RawProjectInput,
  meta: {
    source: LoadedProject['source'];
    remoteDocId?: string | null;
    remoteTitle?: string | null;
    folderHandle?: FileSystemDirectoryHandle | null;
    remoteSync?: RemoteSyncState | null;
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
      if (component.type !== 'img') continue;
      const name = component.content.trim();
      if (name) names.add(name);
    }
  }
  return names;
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

export function isBundlePath(path: string, docId: string): boolean {
  return path === bundleStoragePath(docId);
}

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
