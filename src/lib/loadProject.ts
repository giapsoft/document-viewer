import type {
  Component,
  LoadedProject,
  PageData,
  RelationsFile,
} from '../types';
import { buildIndex } from './index';
import { normalizePageComponents, resolvePageId, resolvePageName } from './pageIds';
import { EMPTY_RELATIONS, normalizeRelations } from './groupRelations';
import { getDocsDirectoryIfPresent } from './docsFolder';
import { mergeStyles } from './styles';
import { isValidStatus, isValidType } from './resolveRef';
import { publicUrl } from './publicUrl';
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

export function assembleProject(input: RawProjectInput): LoadedProject {
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

  pages.sort((a, b) => a.fileName.localeCompare(b.fileName));

  const imageUrls = new Map<string, string>();
  for (const { name, blob } of input.imageFiles) {
    imageUrls.set(name, URL.createObjectURL(blob));
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
    mdFiles,
    index,
    warnings,
  };
}

async function loadRelationsFromRoot(root: FileSystemDirectoryHandle): Promise<RelationsFile> {
  try {
    const relHandle = await root.getFileHandle('relations.json');
    const relFile = await relHandle.getFile();
    const parsed = await readJsonFile<RelationsFile>(relFile);
    return normalizeRelations(parsed);
  } catch {
    return EMPTY_RELATIONS;
  }
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
  return { ...project, folderHandle: root };
}

export async function loadSampleProject(): Promise<LoadedProject> {
  const relationsRes = await fetch(publicUrl('sample-data/relations.json'));
  if (!relationsRes.ok) throw new Error('Cannot load sample relations.json');
  const relations = (await relationsRes.json()) as RelationsFile;

  let stylesPartial: Partial<import('../types').AppStyles> | null = null;
  try {
    const stylesRes = await fetch(publicUrl('sample-data/styles.json'));
    if (stylesRes.ok) stylesPartial = await stylesRes.json();
  } catch {
    // optional
  }

  const pageNames = [
    'intro.p',
    'detail.p',
    'appendix.p',
    'specs.p',
    'integration.p',
    'workflow.p',
    'reference.p',
    'changelog.p',
  ];
  const pageFiles: { name: string; content: unknown }[] = [];
  for (const name of pageNames) {
    const res = await fetch(publicUrl(`sample-data/docs/${name}`));
    if (res.ok) pageFiles.push({ name, content: await res.json() });
  }

  const imageNames = ['diagram.png', 'architecture.jpg', 'overview.png'];
  const imageFiles: { name: string; blob: Blob }[] = [];
  for (const name of imageNames) {
    const res = await fetch(publicUrl(`sample-data/docs/${name}`));
    if (res.ok) imageFiles.push({ name, blob: await res.blob() });
  }

  const mdNames = ['intro.notes.md'];
  const mdFiles: { componentId: string; content: string }[] = [];
  for (const name of mdNames) {
    const res = await fetch(publicUrl(`sample-data/docs/${name}`));
    if (res.ok) {
      const componentId = componentIdFromMdFileName(name);
      if (componentId) {
        mdFiles.push({ componentId, content: await res.text() });
      }
    }
  }

  if (pageFiles.length === 0) {
    throw new Error('Cannot load sample page data');
  }

  return assembleProject({ pageFiles, relations, stylesPartial, imageFiles, mdFiles });
}

export async function pickProjectFolder(): Promise<LoadedProject | null> {
  if (!window.showDirectoryPicker) return null;
  const root = await window.showDirectoryPicker({ mode: 'readwrite' });
  return loadFromDirectoryHandle(root);
}
