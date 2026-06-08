import type { LoadedProject } from '../types';
import {
  parseReadStateFile,
  readStateFileName,
  readStateStorageKey,
  resolveProjectReadKey,
  type ComponentReadState,
} from './readState';

export async function loadReadStateForUser(
  project: LoadedProject,
  username: string,
): Promise<ComponentReadState> {
  if (project.folderHandle) {
    try {
      const handle = await project.folderHandle.getFileHandle(readStateFileName(username));
      const file = await handle.getFile();
      const raw = JSON.parse(await file.text()) as unknown;
      return parseReadStateFile(raw);
    } catch {
      return {};
    }
  }

  try {
    const key = readStateStorageKey(resolveProjectReadKey(project), username);
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return parseReadStateFile(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

export async function saveReadStateForUser(
  project: LoadedProject,
  username: string,
  readState: ComponentReadState,
): Promise<void> {
  const contents = `${JSON.stringify(readState, null, 2)}\n`;

  if (project.folderHandle) {
    const fileHandle = await project.folderHandle.getFileHandle(readStateFileName(username), {
      create: true,
    });
    if (!fileHandle.createWritable) {
      throw new Error('This browser does not support saving read state to the selected folder');
    }
    const writable = await fileHandle.createWritable();
    await writable.write(contents);
    await writable.close();
    return;
  }

  const key = readStateStorageKey(resolveProjectReadKey(project), username);
  localStorage.setItem(key, contents);
}
