import type { LoadedProject } from '../types';
import type { CommentReadState } from './commentReadState';
import {
  saveCommentReadStateForUser,
  uploadRemoteCommentReadState,
} from './commentReadStateStorage';
import type { SaveStatus } from './saveProject';
import { isSupabaseConfigured } from './supabaseClient';
import type { ComponentReadState } from './readState';
import { saveReadStateForUser, uploadRemoteReadState } from './readStateStorage';

const REMOTE_READ_SAVE_DEBOUNCE_MS = 3000;

let remoteSaveTimer: ReturnType<typeof setTimeout> | null = null;
let remoteSaveInFlight = false;
let pendingRemoteSave: {
  docId: string;
  username: string;
  componentReadState: ComponentReadState;
  commentReadState: CommentReadState;
} | null = null;
let statusListener: ((status: SaveStatus, message?: string) => void) | null = null;

export function isReadStateRemoteSaveBusy(): boolean {
  return remoteSaveTimer !== null || remoteSaveInFlight;
}

export function setReadStateSaveStatusListener(
  listener: ((status: SaveStatus, message?: string) => void) | null,
): void {
  statusListener = listener;
}

function notify(status: SaveStatus, message?: string): void {
  statusListener?.(status, message);
}

export function cancelReadStateRemoteSave(): void {
  if (remoteSaveTimer) {
    clearTimeout(remoteSaveTimer);
    remoteSaveTimer = null;
  }
  pendingRemoteSave = null;
}

function flushRemoteReadStateSave(): void {
  const pending = pendingRemoteSave;
  remoteSaveTimer = null;
  pendingRemoteSave = null;
  if (!pending || !isSupabaseConfigured()) return;

  remoteSaveInFlight = true;
  notify('saving');
  void Promise.all([
    uploadRemoteReadState(pending.docId, pending.username, pending.componentReadState),
    uploadRemoteCommentReadState(pending.docId, pending.username, pending.commentReadState),
  ])
    .then(() => {
      notify('saved');
      window.setTimeout(() => notify('idle'), 2000);
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : 'Could not save read state';
      notify('error', message);
    })
    .finally(() => {
      remoteSaveInFlight = false;
    });
}

function scheduleRemoteReadStateSave(
  docId: string,
  username: string,
  componentReadState: ComponentReadState,
  commentReadState: CommentReadState,
): void {
  const wasQueued = remoteSaveTimer !== null;
  pendingRemoteSave = { docId, username, componentReadState, commentReadState };
  if (remoteSaveTimer) clearTimeout(remoteSaveTimer);
  if (!wasQueued && !remoteSaveInFlight) {
    notify('pending');
  }
  remoteSaveTimer = setTimeout(flushRemoteReadStateSave, REMOTE_READ_SAVE_DEBOUNCE_MS);
}

/** Persist component + comment read state locally immediately; debounce remote upload when applicable. */
export function persistUserReadStates(
  project: LoadedProject,
  username: string,
  componentReadState: ComponentReadState,
  commentReadState: CommentReadState,
): void {
  void saveReadStateForUser(project, username, componentReadState).catch(() => {});
  void saveCommentReadStateForUser(project, username, commentReadState).catch(() => {});
  if (project.remoteDocId && isSupabaseConfigured()) {
    scheduleRemoteReadStateSave(project.remoteDocId, username, componentReadState, commentReadState);
  }
}

/** @deprecated Use persistUserReadStates */
export function persistReadState(
  project: LoadedProject,
  username: string,
  readState: ComponentReadState,
): void {
  persistUserReadStates(project, username, readState, {});
}
