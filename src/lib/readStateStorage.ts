import type { LoadedProject } from '../types';
import { readsStoragePath, STORAGE_BUCKET } from './projectBundle';
import {
  mergeReadStates,
  parseReadStateFile,
  readStateFileName,
  readStateStorageKey,
  resolveProjectReadKey,
  type ComponentReadState,
} from './readState';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

async function readStateFromFolder(
  folderHandle: FileSystemDirectoryHandle,
  username: string,
): Promise<ComponentReadState> {
  try {
    const handle = await folderHandle.getFileHandle(readStateFileName(username));
    const file = await handle.getFile();
    const raw = JSON.parse(await file.text()) as unknown;
    return parseReadStateFile(raw);
  } catch {
    return {};
  }
}

async function writeReadStateToFolder(
  folderHandle: FileSystemDirectoryHandle,
  username: string,
  readState: ComponentReadState,
): Promise<void> {
  const contents = `${JSON.stringify(readState, null, 2)}\n`;
  const fileHandle = await folderHandle.getFileHandle(readStateFileName(username), {
    create: true,
  });
  if (!fileHandle.createWritable) {
    throw new Error('This browser does not support saving read state to the selected folder');
  }
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

function readStateFromLocalStorage(project: LoadedProject, username: string): ComponentReadState {
  try {
    const key = readStateStorageKey(resolveProjectReadKey(project), username);
    const raw = localStorage.getItem(key);
    if (raw) return parseReadStateFile(JSON.parse(raw) as unknown);

    if (project.remoteDocId) {
      const draftKey = readStateStorageKey('draft', username);
      const draftRaw = localStorage.getItem(draftKey);
      if (draftRaw) return parseReadStateFile(JSON.parse(draftRaw) as unknown);
    }

    return {};
  } catch {
    return {};
  }
}

function writeReadStateToLocalStorage(
  project: LoadedProject,
  username: string,
  readState: ComponentReadState,
): void {
  const key = readStateStorageKey(resolveProjectReadKey(project), username);
  localStorage.setItem(key, `${JSON.stringify(readState, null, 2)}\n`);
}

async function loadLocalReadState(
  project: LoadedProject,
  username: string,
): Promise<ComponentReadState> {
  if (project.remoteDocId) {
    return readStateFromLocalStorage(project, username);
  }
  if (project.folderHandle) {
    return readStateFromFolder(project.folderHandle, username);
  }
  return readStateFromLocalStorage(project, username);
}

async function saveLocalReadState(
  project: LoadedProject,
  username: string,
  readState: ComponentReadState,
): Promise<void> {
  if (project.remoteDocId) {
    writeReadStateToLocalStorage(project, username, readState);
    return;
  }
  if (project.folderHandle) {
    await writeReadStateToFolder(project.folderHandle, username, readState);
    return;
  }
  writeReadStateToLocalStorage(project, username, readState);
}

export async function fetchRemoteReadState(
  docId: string,
  username: string,
): Promise<ComponentReadState> {
  if (!isSupabaseConfigured()) return {};
  const path = readsStoragePath(docId, username);
  try {
    const { data, error } = await getSupabaseClient().storage.from(STORAGE_BUCKET).download(path);
    if (error || !data) return {};
    const raw = JSON.parse(await data.text()) as unknown;
    return parseReadStateFile(raw);
  } catch {
    return {};
  }
}

export async function uploadRemoteReadState(
  docId: string,
  username: string,
  readState: ComponentReadState,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const path = readsStoragePath(docId, username);
  const body = `${JSON.stringify(readState, null, 2)}\n`;
  const { error } = await getSupabaseClient().storage.from(STORAGE_BUCKET).upload(path, body, {
    upsert: true,
    contentType: 'application/json',
  });
  if (error) throw new Error(`Storage upload failed (${path}): ${error.message}`);
}

export async function loadReadStateForUser(
  project: LoadedProject,
  username: string,
): Promise<ComponentReadState> {
  const local = await loadLocalReadState(project, username);
  if (!project.remoteDocId) {
    return local;
  }
  const remote = await fetchRemoteReadState(project.remoteDocId, username);
  return mergeReadStates(local, remote);
}

export async function saveReadStateForUser(
  project: LoadedProject,
  username: string,
  readState: ComponentReadState,
): Promise<void> {
  await saveLocalReadState(project, username, readState);
}

function listStoredReadUsernames(projectKey: string): string[] {
  const prefix = `${readStateStorageKey(projectKey, '')}`;
  const usernames: string[] = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const username = key.slice(prefix.length);
      if (username) usernames.push(username);
    }
  } catch {
    // ignore private mode / quota
  }
  return usernames;
}

export function collectReadStatesForExport(
  project: LoadedProject,
  activeUsername: string | null,
  activeReadState: ComponentReadState,
): Record<string, ComponentReadState> {
  const projectKey = resolveProjectReadKey(project);
  const collected: Record<string, ComponentReadState> = {};

  const addFromKey = (key: string) => {
    for (const username of listStoredReadUsernames(key)) {
      try {
        const raw = localStorage.getItem(readStateStorageKey(key, username));
        if (!raw) continue;
        collected[username] = mergeReadStates(
          collected[username] ?? {},
          parseReadStateFile(JSON.parse(raw) as unknown),
        );
      } catch {
        // ignore malformed entries
      }
    }
  };

  addFromKey(projectKey);
  if (project.remoteDocId) {
    addFromKey('draft');
  }

  if (activeUsername) {
    collected[activeUsername] = mergeReadStates(
      collected[activeUsername] ?? {},
      activeReadState,
    );
  }

  return collected;
}

export async function saveReadStatesToFolder(
  folderHandle: FileSystemDirectoryHandle,
  readStatesByUsername: Record<string, ComponentReadState>,
): Promise<void> {
  for (const [username, readState] of Object.entries(readStatesByUsername)) {
    if (Object.keys(readState).length === 0) continue;
    await writeReadStateToFolder(folderHandle, username, readState);
  }
}
