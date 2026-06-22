import type { Component, LoadedProject } from '../types';
import { resolveComponentForDisplay } from './componentDisplay';
import { resolveMarkdownComponentLink } from './mdComponentLinks';
import { findComponent } from './projectMutations';

export type ExportGroupResult =
  | { ok: true; folderName: string; fileName: string }
  | { ok: false; cancelled: true }
  | { ok: false; error: string };

function isExternalAssetRef(ref: string): boolean {
  return (
    /^https?:\/\//i.test(ref) ||
    /^mailto:/i.test(ref) ||
    ref.startsWith('#') ||
    ref.startsWith('/') ||
    ref.includes('/')
  );
}

async function writeFileWithRetry(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  contents: string | Blob,
  maxAttempts = 5,
): Promise<void> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 300 * (1 << (attempt - 1))));
    }
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    if (!fileHandle.createWritable) {
      throw new Error('This browser does not support saving files to the selected folder');
    }
    let writable: FileSystemWritableFileStream | null = null;
    try {
      writable = await fileHandle.createWritable();
      await writable.write(contents);
      await writable.close();
      return;
    } catch (err) {
      lastErr = err;
      if (writable) {
        try {
          await writable.abort();
        } catch {
          /* ignore */
        }
      }
    }
  }
  throw lastErr;
}

async function ensureWritePermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const options = { mode: 'readwrite' as const };
  if (handle.queryPermission && handle.requestPermission) {
    if ((await handle.queryPermission(options)) === 'granted') return true;
    if ((await handle.requestPermission(options)) === 'granted') return true;
    return false;
  }
  return true;
}

function stripComponentLinksFromMd(
  mdSource: string,
  pageFile: string,
  project: LoadedProject,
): string {
  return mdSource.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text: string, href: string) => {
    const componentId = resolveMarkdownComponentLink(href, pageFile, project);
    if (componentId) return text;
    return match;
  });
}

function collectLocalImageNamesFromMd(mdSource: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const pattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(mdSource)) !== null) {
    const src = match[2].trim();
    if (!src || isExternalAssetRef(src) || seen.has(src)) continue;
    seen.add(src);
    names.push(src);
  }
  return names;
}

function componentToMarkdownBlock(
  component: Component,
  project: LoadedProject,
  pageFile: string,
): { markdown: string; imageNames: string[] } | null {
  if (component.type === 'action') return null;

  const resolved = resolveComponentForDisplay(component, project.mdFiles);
  const text = resolved.content.trim();

  switch (resolved.type) {
    case 'header':
      return { markdown: `## ${text}`, imageNames: [] };
    case 'title':
      return { markdown: `# ${text}`, imageNames: [] };
    case 'body':
      return { markdown: text, imageNames: [] };
    case 'listItem':
      return { markdown: `- ${text}`, imageNames: [] };
    case 'img': {
      if (!text) return { markdown: '', imageNames: [] };
      return { markdown: `![${text}](${text})`, imageNames: [text] };
    }
    case 'md': {
      const body = stripComponentLinksFromMd(resolved.content, pageFile, project).trimEnd();
      return { markdown: body, imageNames: collectLocalImageNamesFromMd(body) };
    }
    default:
      return null;
  }
}

export function buildGroupMarkdownExport(
  project: LoadedProject,
  memberIds: string[],
): { content: string; imageNames: string[] } {
  const lines: string[] = [];
  const imageNames = new Set<string>();

  for (const componentId of memberIds) {
    const found = findComponent(project, componentId);
    if (!found) continue;

    const block = componentToMarkdownBlock(found.component, project, found.pageFile);
    if (!block) continue;

    if (block.markdown) {
      lines.push(block.markdown);
      lines.push('');
    }
    for (const name of block.imageNames) {
      imageNames.add(name);
    }
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return {
    content: lines.length > 0 ? `${lines.join('\n')}\n` : '',
    imageNames: [...imageNames],
  };
}

export async function exportGroupToFolder(
  project: LoadedProject,
  memberIds: string[],
  groupIndex: number,
): Promise<ExportGroupResult> {
  if (!window.showDirectoryPicker) {
    return {
      ok: false,
      error: 'Folder selection is not supported in this browser. Please use Chrome or Edge.',
    };
  }

  let folderHandle: FileSystemDirectoryHandle;
  try {
    folderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, cancelled: true };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not open the selected folder.',
    };
  }

  const allowed = await ensureWritePermission(folderHandle);
  if (!allowed) {
    return { ok: false, error: 'Write permission was not granted for the selected folder.' };
  }

  const { content, imageNames } = buildGroupMarkdownExport(project, memberIds);
  const fileName = `list-${groupIndex + 1}.md`;

  try {
    await writeFileWithRetry(folderHandle, fileName, content);

    for (const name of imageNames) {
      const blob = project.imageBlobs.get(name);
      if (!blob) {
        return { ok: false, error: `Missing image data for "${name}".` };
      }
      await writeFileWithRetry(folderHandle, name, blob);
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not write the export files.',
    };
  }

  return { ok: true, folderName: folderHandle.name, fileName };
}
