import type { LoadedProject, RelationsFile, Component } from '../types';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const SAVE_DEBOUNCE_MS = 600;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let statusListener: ((status: SaveStatus, message?: string) => void) | null = null;

export function setSaveStatusListener(
  listener: ((status: SaveStatus, message?: string) => void) | null,
) {
  statusListener = listener;
}

function notify(status: SaveStatus, message?: string) {
  statusListener?.(status, message);
}

async function writeJsonFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  data: unknown,
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  if (!fileHandle.createWritable) {
    throw new Error('This browser does not support saving files to the selected folder');
  }
  const writable = await fileHandle.createWritable();
  await writable.write(`${JSON.stringify(data, null, 2)}\n`);
  await writable.close();
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

export async function saveProjectToFolder(project: LoadedProject): Promise<void> {
  const root = project.folderHandle;
  if (!root) return;

  const allowed = await ensureWritePermission(root);
  if (!allowed) {
    throw new Error('Write permission was not granted for the selected folder');
  }

  const docsHandle = await root.getDirectoryHandle('docs');
  for (const page of project.pages) {
    await writeJsonFile(docsHandle, page.fileName, page.components as Component[]);
  }
  await writeJsonFile(root, 'relations.json', project.relations as RelationsFile);
}

export function scheduleAutoSave(getProject: () => LoadedProject | null): void {
  if (saveTimer) clearTimeout(saveTimer);
  notify('pending');

  saveTimer = setTimeout(() => {
    saveTimer = null;
    const project = getProject();
    if (!project?.folderHandle) {
      notify('idle');
      return;
    }

    notify('saving');
    void saveProjectToFolder(project)
      .then(() => notify('saved'))
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Could not save project';
        notify('error', message);
      });
  }, SAVE_DEBOUNCE_MS);
}

export function cancelAutoSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}
