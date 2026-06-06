import type {
  Component,
  LoadedProject,
  PageData,
  RelationsFile,
} from '../types';
import { buildIndex } from './index';
import { normalizePageComponents, resolvePageId, resolvePageName } from './pageIds';
import { EMPTY_RELATIONS, normalizeRelations } from './groupRelations';
import { getStoredPageOrder } from './pageOrder';
import { getDocsDirectoryIfPresent } from './docsFolder';
import { mergeStyles } from './styles';
import { isValidStatus, isValidType } from './componentDisplay';
import { MD_FILE_EXT, componentIdFromMdFileName } from './mdFiles';

const IMAGE_EXT = /\.(jpg|jpeg|png|gif)$/i;
const PAGE_EXT = /\.p$/i;

function parseComponents(raw: unknown, fileName: string): Component[] {
  if (!Array.isArray(raw)) {
    throw new Error(`${fileName}: expected JSON array`);
  }

  return raw.map((item, i) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`${fileName}[${i}]: invalid component`);
    }
    const c = item as Record<string, unknown>;
    const typeRaw = String(c.type ?? '');
    const status = String(c.status ?? '');
    const type = typeRaw;
    const content = String(c.content ?? '');

    if (!isValidType(type)) {
      throw new Error(`${fileName}[${i}]: invalid type "${type}"`);
    }
    if (!isValidStatus(status)) {
      throw new Error(`${fileName}[${i}]: invalid status "${status}"`);
    }
    return {
      id: String(c.id ?? ''),
      type,
      status,
      content,
    };
  });
}

async function readJsonFile<T>(file: File): Promise<T> {
  const text = await file.text();
  return JSON.parse(text) as T;
}

export interface RawProjectInput {
  pageFiles: { name: string; content: unknown }[];
  relations: RelationsFile;
  stylesPartial?: Partial<import('../types').AppStyles> | null;
  imageFiles: { name: string; blob: Blob }[];
  mdFiles?: { componentId: string; content: string }[];
}

export type AssembledProject = Omit<
  LoadedProject,
  'source' | 'remoteDocId' | 'remoteTitle' | 'folderHandle' | 'remoteSync'
>;

export function assembleProject(input: RawProjectInput): AssembledProject {
  const warnings: string[] = [];
  const pages: PageData[] = [];
  const relations = normalizeRelations(input.relations);

  for (const { name, content } of input.pageFiles) {
    try {
      const pageId = resolvePageId(name);
      const pageName = resolvePageName(name, relations.pageNames);
      const parsed = parseComponents(content, name);
      const components = normalizePageComponents(parsed, pageId, name, warnings);
      pages.push({ fileName: name, pageId, pageName, components });
    } catch (err) {
      warnings.push(
        err instanceof Error ? err.message : `Failed to parse ${name}`,
      );
    }
  }

  const pageOrder = getStoredPageOrder(
    relations,
    pages.map((p) => p.fileName),
  );
  pages.sort((a, b) => pageOrder.indexOf(a.fileName) - pageOrder.indexOf(b.fileName));

  const imageUrls = new Map<string, string>();
  const imageBlobs = new Map<string, Blob>();
  for (const { name, blob } of input.imageFiles) {
    imageUrls.set(name, URL.createObjectURL(blob));
    imageBlobs.set(name, blob);
  }

  const mdFiles = new Map<string, string>();
  for (const { componentId, content } of input.mdFiles ?? []) {
    mdFiles.set(componentId, content);
  }

  for (const page of pages) {
    for (const component of page.components) {
      if (component.type !== 'md') continue;
      if (!mdFiles.has(component.id)) {
        warnings.push(`Missing markdown file for ${component.id}`);
        mdFiles.set(component.id, '');
      }
    }
  }

  const { index, warnings: indexWarnings } = buildIndex(pages, relations);
  warnings.push(...indexWarnings);

  return {
    pages,
    relations,
    styles: mergeStyles(input.stylesPartial),
    imageUrls,
    imageBlobs,
    mdFiles,
    index,
    warnings,
  };
}

async function tryReadJsonFile<T>(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<T | null> {
  try {
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    return await readJsonFile<T>(file);
  } catch {
    return null;
  }
}

async function loadRelationsFromRoot(root: FileSystemDirectoryHandle): Promise<RelationsFile> {
  const meta = await tryReadJsonFile<RelationsFile>(root, 'relations.json');
  if (!meta) return EMPTY_RELATIONS;

  // New format: groups and comments in separate files
  // Old format: embedded in relations.json (backward compat)
  const groups = await tryReadJsonFile<string[][]>(root, 'groups.json')
    ?? (meta.groups ?? []);
  const comments = await tryReadJsonFile<RelationsFile['comments']>(root, 'comments.json')
    ?? (meta.comments ?? []);

  return normalizeRelations({ ...meta, groups, comments });
}

export async function loadFromDirectoryHandle(
  root: FileSystemDirectoryHandle,
): Promise<LoadedProject> {
  const relations = await loadRelationsFromRoot(root);
  const docsHandle = await getDocsDirectoryIfPresent(root);

  let stylesPartial: Partial<import('../types').AppStyles> | null = null;
  try {
    const stylesHandle = await root.getFileHandle('styles.json');
    const stylesFile = await stylesHandle.getFile();
    stylesPartial = await readJsonFile<Partial<import('../types').AppStyles>>(stylesFile);
  } catch {
    // optional — use hardcoded defaults
  }

  const pageFiles: { name: string; content: unknown }[] = [];
  const imageFiles: { name: string; blob: Blob }[] = [];
  const mdFiles: { componentId: string; content: string }[] = [];

  if (docsHandle) {
    for await (const entry of docsHandle.values()) {
      if (entry.kind !== 'file') continue;
      const name = entry.name;
      if (PAGE_EXT.test(name)) {
        const file = await (entry as FileSystemFileHandle).getFile();
        try {
          const content = JSON.parse(await file.text());
          pageFiles.push({ name, content });
        } catch {
          pageFiles.push({ name, content: null });
        }
      } else if (IMAGE_EXT.test(name)) {
        const file = await (entry as FileSystemFileHandle).getFile();
        imageFiles.push({ name, blob: file });
      } else if (MD_FILE_EXT.test(name)) {
        const componentId = componentIdFromMdFileName(name);
        if (!componentId) continue;
        const file = await (entry as FileSystemFileHandle).getFile();
        mdFiles.push({ componentId, content: await file.text() });
      }
    }
  }

  const project = assembleProject({ pageFiles, relations, stylesPartial, imageFiles, mdFiles });
  return {
    ...project,
    source: 'local' as const,
    remoteDocId: null,
    remoteTitle: null,
    folderHandle: root,
    remoteSync: null,
  };
}

export function revokeProjectImageUrls(project: LoadedProject | null | undefined): void {
  if (!project) return;
  for (const url of project.imageUrls.values()) {
    URL.revokeObjectURL(url);
  }
}

export async function pickProjectFolder(): Promise<LoadedProject | null> {
  if (!window.showDirectoryPicker) return null;
  const root = await window.showDirectoryPicker({ mode: 'readwrite' });
  return loadFromDirectoryHandle(root);
}
