import type {
  Component,
  LoadedProject,
  PageData,
  RelationsFile,
} from '../types';
import { buildIndex } from './index';
import { mergeStyles } from './styles';
import { isValidStatus, isValidType } from './resolveRef';

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
    let type = typeRaw;
    let content = String(c.content ?? '');

    // Legacy: field `ref` → type `ref`, content = target id
    const legacyRef = c.ref != null ? String(c.ref).trim() : '';
    if (legacyRef && type !== 'ref') {
      type = 'ref';
      content = legacyRef;
    }

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
}

export function assembleProject(input: RawProjectInput): LoadedProject {
  const warnings: string[] = [];
  const pages: PageData[] = [];

  for (const { name, content } of input.pageFiles) {
    try {
      const components = parseComponents(content, name);
      pages.push({ fileName: name, components });
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

  const { index, warnings: indexWarnings } = buildIndex(pages, input.relations);
  warnings.push(...indexWarnings);

  return {
    pages,
    relations: input.relations,
    styles: mergeStyles(input.stylesPartial),
    imageUrls,
    index,
    warnings,
  };
}

export async function loadFromDirectoryHandle(
  root: FileSystemDirectoryHandle,
): Promise<LoadedProject> {
  let docsHandle: FileSystemDirectoryHandle;
  try {
    docsHandle = await root.getDirectoryHandle('docs');
  } catch {
    throw new Error('Missing /docs folder');
  }

  let relations: RelationsFile;
  try {
    const relHandle = await root.getFileHandle('relations.json');
    const relFile = await relHandle.getFile();
    relations = await readJsonFile<RelationsFile>(relFile);
    if (!relations.connectors || typeof relations.connectors !== 'object') {
      throw new Error('relations.json: missing connectors');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('connectors')) throw err;
    throw new Error('Missing or invalid relations.json');
  }

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
    }
  }

  if (pageFiles.length === 0) {
    throw new Error('No *.p files found in /docs');
  }

  return assembleProject({ pageFiles, relations, stylesPartial, imageFiles });
}

export async function loadSampleProject(): Promise<LoadedProject> {
  const relationsRes = await fetch('/sample-data/relations.json');
  if (!relationsRes.ok) throw new Error('Cannot load sample relations.json');
  const relations = (await relationsRes.json()) as RelationsFile;

  let stylesPartial: Partial<import('../types').AppStyles> | null = null;
  try {
    const stylesRes = await fetch('/sample-data/styles.json');
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
    const res = await fetch(`/sample-data/docs/${name}`);
    if (res.ok) pageFiles.push({ name, content: await res.json() });
  }

  const imageNames = ['diagram.png', 'architecture.jpg', 'overview.png'];
  const imageFiles: { name: string; blob: Blob }[] = [];
  for (const name of imageNames) {
    const res = await fetch(`/sample-data/docs/${name}`);
    if (res.ok) imageFiles.push({ name, blob: await res.blob() });
  }

  return assembleProject({ pageFiles, relations, stylesPartial, imageFiles });
}

export async function pickProjectFolder(): Promise<LoadedProject | null> {
  if (!window.showDirectoryPicker) return null;
  const root = await window.showDirectoryPicker({ mode: 'read' });
  return loadFromDirectoryHandle(root);
}
