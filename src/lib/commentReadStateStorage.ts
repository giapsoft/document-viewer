import type { LoadedProject } from '../types';
import { commentReadsStoragePath, STORAGE_BUCKET } from './projectBundle';
import { resolveProjectReadKey } from './readState';
import {
  commentReadStateFileName,
  commentReadStateStorageKey,
  mergeCommentReadStates,
  parseCommentReadStateFile,
  type CommentReadState,
} from './commentReadState';
import { getSupabaseClient, isSupabaseConfigured } from './supabaseClient';

async function readCommentReadStateFromFolder(
  folderHandle: FileSystemDirectoryHandle,
  username: string,
): Promise<CommentReadState> {
  try {
    const handle = await folderHandle.getFileHandle(commentReadStateFileName(username));
    const file = await handle.getFile();
    const raw = JSON.parse(await file.text()) as unknown;
    return parseCommentReadStateFile(raw);
  } catch {
    return {};
  }
}

async function writeCommentReadStateToFolder(
  folderHandle: FileSystemDirectoryHandle,
  username: string,
  readState: CommentReadState,
): Promise<void> {
  const contents = `${JSON.stringify(readState, null, 2)}\n`;
  const fileHandle = await folderHandle.getFileHandle(commentReadStateFileName(username), {
    create: true,
  });
  if (!fileHandle.createWritable) {
    throw new Error('This browser does not support saving comment read state to the selected folder');
  }
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
}

function readCommentReadStateFromLocalStorage(
  project: LoadedProject,
  username: string,
): CommentReadState {
  try {
    const key = commentReadStateStorageKey(resolveProjectReadKey(project), username);
    const raw = localStorage.getItem(key);
    if (raw) return parseCommentReadStateFile(JSON.parse(raw) as unknown);

    if (project.remoteDocId) {
      const draftKey = commentReadStateStorageKey('draft', username);
      const draftRaw = localStorage.getItem(draftKey);
      if (draftRaw) return parseCommentReadStateFile(JSON.parse(draftRaw) as unknown);
    }

    return {};
  } catch {
    return {};
  }
}

function writeCommentReadStateToLocalStorage(
  project: LoadedProject,
  username: string,
  readState: CommentReadState,
): void {
  const key = commentReadStateStorageKey(resolveProjectReadKey(project), username);
  localStorage.setItem(key, `${JSON.stringify(readState, null, 2)}\n`);
}

async function loadLocalCommentReadState(
  project: LoadedProject,
  username: string,
): Promise<CommentReadState> {
  if (project.remoteDocId) {
    return readCommentReadStateFromLocalStorage(project, username);
  }
  if (project.folderHandle) {
    return readCommentReadStateFromFolder(project.folderHandle, username);
  }
  return readCommentReadStateFromLocalStorage(project, username);
}

async function saveLocalCommentReadState(
  project: LoadedProject,
  username: string,
  readState: CommentReadState,
): Promise<void> {
  if (project.remoteDocId) {
    writeCommentReadStateToLocalStorage(project, username, readState);
    return;
  }
  if (project.folderHandle) {
    await writeCommentReadStateToFolder(project.folderHandle, username, readState);
    return;
  }
  writeCommentReadStateToLocalStorage(project, username, readState);
}

export async function fetchRemoteCommentReadState(
  docId: string,
  username: string,
): Promise<CommentReadState> {
  if (!isSupabaseConfigured()) return {};
  const path = commentReadsStoragePath(docId, username);
  try {
    const { data, error } = await getSupabaseClient().storage.from(STORAGE_BUCKET).download(path);
    if (error || !data) return {};
    const raw = JSON.parse(await data.text()) as unknown;
    return parseCommentReadStateFile(raw);
  } catch {
    return {};
  }
}

export async function uploadRemoteCommentReadState(
  docId: string,
  username: string,
  readState: CommentReadState,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const path = commentReadsStoragePath(docId, username);
  const body = `${JSON.stringify(readState, null, 2)}\n`;
  const { error } = await getSupabaseClient().storage.from(STORAGE_BUCKET).upload(path, body, {
    upsert: true,
    contentType: 'application/json',
  });
  if (error) throw new Error(error.message);
}

export async function loadCommentReadStateForUser(
  project: LoadedProject,
  username: string,
): Promise<CommentReadState> {
  const local = await loadLocalCommentReadState(project, username);
  if (!project.remoteDocId) {
    return local;
  }
  const remote = await fetchRemoteCommentReadState(project.remoteDocId, username);
  return mergeCommentReadStates(local, remote);
}

export async function saveCommentReadStateForUser(
  project: LoadedProject,
  username: string,
  readState: CommentReadState,
): Promise<void> {
  await saveLocalCommentReadState(project, username, readState);
}

function listStoredCommentReadUsernames(projectKey: string): string[] {
  const prefix = `${commentReadStateStorageKey(projectKey, '')}`;
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

export function collectCommentReadStatesForExport(
  project: LoadedProject,
  activeUsername: string | null,
  activeReadState: CommentReadState,
): Record<string, CommentReadState> {
  const projectKey = resolveProjectReadKey(project);
  const collected: Record<string, CommentReadState> = {};

  const addFromKey = (key: string) => {
    for (const username of listStoredCommentReadUsernames(key)) {
      try {
        const raw = localStorage.getItem(commentReadStateStorageKey(key, username));
        if (!raw) continue;
        collected[username] = mergeCommentReadStates(
          collected[username] ?? {},
          parseCommentReadStateFile(JSON.parse(raw) as unknown),
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
    collected[activeUsername] = mergeCommentReadStates(
      collected[activeUsername] ?? {},
      activeReadState,
    );
  }

  return collected;
}

export async function saveCommentReadStatesToFolder(
  folderHandle: FileSystemDirectoryHandle,
  readStatesByUsername: Record<string, CommentReadState>,
): Promise<void> {
  for (const [username, readState] of Object.entries(readStatesByUsername)) {
    if (Object.keys(readState).length === 0) continue;
    await writeCommentReadStateToFolder(folderHandle, username, readState);
  }
}
