import type { LoadedProject, Component } from '../types';
import { serializePageComponents } from './pageIds';
import { normalizeRelations } from './groupRelations';
import { mdSidecarFileName } from './mdFiles';
import { ensureDocsDirectory } from './docsFolder';
import { removeOrphanedDocsOnSave } from './pageFileOps';
import { collectReferencedImageNames } from './projectBundle';
import type { CommentReadState } from './commentReadState';
import { saveCommentReadStatesToFolder } from './commentReadStateStorage';
import type { ComponentReadState } from './readState';
import { saveReadStatesToFolder } from './readStateStorage';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function isSaveInProgress(status: SaveStatus): boolean {
  return status === 'pending' || status === 'saving';
}

const SAVE_DEBOUNCE_MS = 3000;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveInFlight = false;
let statusListener: ((status: SaveStatus, message?: string) => void) | null = null;

export function isLocalAutoSaveBusy(): boolean {
  return saveTimer !== null || saveInFlight;
}

export function setSaveStatusListener(
  listener: ((status: SaveStatus, message?: string) => void) | null,
) {
  statusListener = listener;
}

function notify(status: SaveStatus, message?: string) {
  statusListener?.(status, message);
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
      // Exponential back-off: 300ms, 600ms, 1200ms, 2400ms
      // Windows indexer / antivirus can hold a file for several hundred ms
      // after each write; short delays are not enough on slow machines.
      await new Promise((resolve) => setTimeout(resolve, 300 * (1 << (attempt - 1))));
    }
    // Re-acquire file handle every attempt — a handle from a previous cycle
    // can be stale on Windows (indexer / antivirus holds the file briefly
    // after each write, causing NotReadableError on the next createWritable).
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    if (!fileHandle.createWritable) {
      throw new Error('This browser does not support saving files to the selected folder');
    }
    let writable: FileSystemWritableFileStream | null = null;
    try {
      writable = await fileHandle.createWritable();
      await writable.write(contents);
      await writable.close();
      return; // success
    } catch (err) {
      lastErr = err;
      // Always abort the writable so the file lock is released before the
      // next attempt. Without this, a failed write keeps the lock open for
      // the lifetime of the tab and every subsequent save fails.
      if (writable) {
        try { await writable.abort(); } catch { /* ignore abort errors */ }
      }
    }
  }
  throw lastErr;
}

async function writeTextFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  contents: string,
): Promise<void> {
  await writeFileWithRetry(dirHandle, fileName, contents);
}

async function writeJsonFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  data: unknown,
): Promise<void> {
  await writeFileWithRetry(dirHandle, fileName, `${JSON.stringify(data, null, 2)}\n`);
}

async function ensureWritePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const options = { mode: 'readwrite' as const };
  if (handle.queryPermission && handle.requestPermission) {
    if ((await handle.queryPermission(options)) === 'granted') return true;
    if ((await handle.requestPermission(options)) === 'granted') return true;
    return false;
  }
  return true;
}

async function writeBlobFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  blob: Blob,
): Promise<void> {
  await writeFileWithRetry(dirHandle, fileName, blob);
}

export async function pickSaveFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) {
    throw new Error('Folder selection is not supported in this browser. Please use Chrome or Edge.');
  }
  return window.showDirectoryPicker({ mode: 'readwrite' });
}

export async function saveProjectToFolder(
  project: LoadedProject,
  readStatesByUsername?: Record<string, ComponentReadState>,
  commentReadStatesByUsername?: Record<string, CommentReadState>,
): Promise<void> {
  const root = project.folderHandle;
  if (!root) {
    throw new Error('No local folder is linked to this document.');
  }

  const allowed = await ensureWritePermission(root);
  if (!allowed) {
    throw new Error('Write permission was not granted for the selected folder');
  }

  if (project.pages.length > 0) {
    const docsHandle = await ensureDocsDirectory(root);
    for (const page of project.pages) {
      const serialized = serializePageComponents(page.components, page.pageId);
      await writeJsonFile(docsHandle, page.fileName, serialized as Component[]);
    }

    for (const page of project.pages) {
      for (const component of page.components) {
        if (component.type !== 'md') continue;
        const content = project.mdFiles.get(component.id) ?? '';
        await writeTextFile(docsHandle, mdSidecarFileName(component.id), content);
      }
    }

    for (const name of collectReferencedImageNames(project)) {
      const blob = project.imageBlobs.get(name);
      if (!blob) {
        throw new Error(`Missing image data for "${name}"`);
      }
      await writeBlobFile(docsHandle, name, blob);
    }

    await removeOrphanedDocsOnSave(root, project);
  }

  const { groups, comments, ...relationsMeta } = normalizeRelations(project.relations);
  await writeJsonFile(root, 'relations.json', relationsMeta);
  await writeJsonFile(root, 'groups.json', groups ?? []);
  await writeJsonFile(root, 'comments.json', comments ?? []);

  if (readStatesByUsername && Object.keys(readStatesByUsername).length > 0) {
    await saveReadStatesToFolder(root, readStatesByUsername);
  }
  if (commentReadStatesByUsername && Object.keys(commentReadStatesByUsername).length > 0) {
    await saveCommentReadStatesToFolder(root, commentReadStatesByUsername);
  }
}

export type LocalAutoSaveResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; error?: string };

export function scheduleAutoSave(save: () => Promise<LocalAutoSaveResult>): void {
  const wasQueued = saveTimer !== null;
  if (saveTimer) clearTimeout(saveTimer);
  if (!wasQueued && !saveInFlight) {
    notify('pending');
  }

  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveInFlight = true;
    notify('saving');
    void save()
      .then((result) => {
        if (result.ok) {
          notify(result.skipped ? 'idle' : 'saved');
          if (!result.skipped) {
            window.setTimeout(() => notify('idle'), 2000);
          }
          return;
        }
        notify('error', result.error ?? 'Could not save project');
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Could not save project';
        notify('error', message);
      })
      .finally(() => {
        saveInFlight = false;
      });
  }, SAVE_DEBOUNCE_MS);
}

export function cancelAutoSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}
