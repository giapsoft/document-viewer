import type { LoadedProject, PublishMode, RelationsFile, RemoteSyncState } from '../types';
import { componentIdFromMdFileName, mdSidecarFileName, MD_FILE_EXT } from './mdFiles';
import { getSupabaseClient } from './supabaseClient';
import {
  mapWithConcurrency,
  runWithConcurrency,
  DEFAULT_CONCURRENCY,
  REMOTE_IMAGE_LOAD_CONCURRENCY,
  REMOTE_MD_LOAD_CONCURRENCY,
} from './concurrency';
import { assembleProject } from './loadProject';
import { isDuplicateDocumentIdError, resolveNewDocumentId } from './documentId';
import { fingerprintBlob } from './fileFingerprint';
import {
  assembleLoadedProject,
  collectReferencedImageNames,
  commentsStoragePath,
  defaultRemoteTitle,
  docsStoragePath,
  groupsStoragePath,
  isCommentsPath,
  isGroupsPath,
  isImageFileName,
  isPageFileName,
  isRelationsPath,
  normalizeDocumentTitle,
  parseStorageFileName,
  relationsFromRaw,
  relationsStoragePath,
  STORAGE_BUCKET,
  projectToRawInput,
  type RemoteImageHandler,
  type RemoteDocumentMeta,
} from './projectBundle';
import {
  buildRemoteFileMap,
  fingerprintFileMap,
  listRemovedRemotePaths,
} from './remoteProjectFiles';
import { EMPTY_RELATIONS, normalizeRelations } from './groupRelations';
import { createDefaultPageData } from './pageMutations';
import { rebuildProject } from './projectMutations';
import { serializePageComponents } from './pageIds';
import {
  commentsEqual,
  mergeCommentsFromServer,
} from './comments';
import { pickNewerRemoteUpdatedAt } from './remoteConflict';
import {
  allowsReadonlyPasswordAccess,
  DEFAULT_PUBLISH_MODE,
  publishModeFromRow,
  requiresPasswordToOpen,
  usesFullEncryptionStorage,
  usesReadonlyPlaintextStorage,
} from './publishMode';
import {
  clearRemoteDocCache,
  deleteRemoteCachedPaths,
  getRemoteCachedFile,
  putRemoteCachedFile,
} from './remoteFileCache';
import {
  createDocumentLock,
  isDocumentLockFile,
  lockStoragePath,
  payloadStoragePath,
  lockFileToBlob,
  encryptedPayloadToBlob,
  unlockDocumentKey,
  publicSnapshotStoragePath,
  type DocumentLockFile,
} from './documentPassword';
import {
  buildEncryptedDocumentExport,
  buildDocumentPayload,
  decryptDocumentPayloadToRawInput,
  parseDocumentPayload,
  payloadToRawProjectInput,
  serializeDocumentPayload,
} from './documentPayload';
import type { ExportProtection } from './saveProject';
import type { CommentReadState } from './commentReadState';
import type { ComponentReadState } from './readState';

export type { RemoteDocumentMeta };

export type RemoteStorageEntry = {
  path: string;
  updatedAt: string | null;
};

function emptyRemoteSync(): RemoteSyncState {
  return { fileHashes: new Map() };
}

function legacyBundlePath(docId: string): string {
  return `${docId}/bundle.zip`;
}

function remoteSyncEqual(
  a: LoadedProject['remoteSync'],
  b: LoadedProject['remoteSync'],
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const aHashes = a.fileHashes;
  const bHashes = b.fileHashes;
  if (aHashes.size !== bHashes.size) return false;
  for (const [path, hash] of aHashes) {
    if (bHashes.get(path) !== hash) return false;
  }
  return true;
}

/** Apply a comment-only pull onto the latest in-memory project (avoids stale snapshot races). */
export function applyRemoteCommentSync(
  latest: LoadedProject,
  synced: LoadedProject,
): LoadedProject {
  const syncedComments = synced.relations.comments ?? [];
  const latestComments = latest.relations.comments ?? [];
  const commentsChanged = !commentsEqual(latestComments, syncedComments);
  const remoteUpdatedAt =
    pickNewerRemoteUpdatedAt(latest.remoteUpdatedAt, synced.remoteUpdatedAt) ??
    latest.remoteUpdatedAt;
  const remoteSync = synced.remoteSync ?? latest.remoteSync;

  if (
    !commentsChanged &&
    remoteUpdatedAt === latest.remoteUpdatedAt &&
    remoteSyncEqual(remoteSync, latest.remoteSync)
  ) {
    return latest;
  }

  return {
    ...latest,
    relations: {
      ...latest.relations,
      comments: commentsChanged ? syncedComments : latestComments,
    },
    remoteSync,
    remoteUpdatedAt,
  };
}

export type SaveRemoteResult = {
  remoteSync: RemoteSyncState;
  skippedUpload: boolean;
  remoteUpdatedAt: string | null;
  /** Project with merged remote comments applied before save. */
  mergedProject: LoadedProject;
  /** Per-file conflicts detected — paths changed by someone else since last load. */
  conflictPaths?: string[];
};

export type RemoteDocumentLoadResult =
  | { status: 'ready'; load: DeferredRemoteLoad }
  | {
      status: 'password';
      docId: string;
      title: string;
      lock: DocumentLockFile;
      publishMode: PublishMode;
    };

export type SaveRemoteOptions = {
  docId?: string;
  publishMode?: PublishMode;
  protection?: ExportProtection;
  sessionPassword?: string | null;
  readStatesByUsername?: Record<string, ComponentReadState>;
  commentReadStatesByUsername?: Record<string, CommentReadState>;
};

function resolveRemoteExportProtection(
  project: LoadedProject,
  options?: SaveRemoteOptions,
): ExportProtection {
  if (options?.protection) return options.protection;
  if (project.passwordProtected && options?.sessionPassword) {
    return { mode: 'protect', password: options.sessionPassword };
  }
  return null;
}

async function readRemoteDocumentLock(docId: string): Promise<DocumentLockFile | null> {
  const entriesByPath = await remoteStorageEntryMap(docId);
  const lockBlob = await downloadKnownStorageFile(entriesByPath, lockStoragePath(docId));
  if (!lockBlob) return null;
  const parsed = JSON.parse(await lockBlob.text()) as unknown;
  return isDocumentLockFile(parsed) ? parsed : null;
}

export async function fetchRemoteDocumentLock(docId: string): Promise<DocumentLockFile | null> {
  return readRemoteDocumentLock(docId);
}

export async function verifyRemoteDocumentPassword(
  docId: string,
  password: string,
): Promise<boolean> {
  const lock = await readRemoteDocumentLock(docId);
  if (!lock) return false;
  const key = await unlockDocumentKey(password, lock);
  return key != null;
}

function hasPlaintextRemoteContent(entries: RemoteStorageEntry[], docId: string): boolean {
  return entries.some((entry) => {
    if (entry.path === lockStoragePath(docId) || entry.path === payloadStoragePath(docId)) {
      return false;
    }
    if (entry.path === publicSnapshotStoragePath(docId)) return false;
    if (isRelationsPath(entry.path, docId)) return true;
    if (isGroupsPath(entry.path, docId)) return true;
    if (isCommentsPath(entry.path, docId)) return true;
    const fileName = parseStorageFileName(entry.path, docId);
    return fileName != null;
  });
}

function hasReadonlyRemoteContent(entries: RemoteStorageEntry[], docId: string): boolean {
  return (
    entries.some((entry) => entry.path === publicSnapshotStoragePath(docId)) ||
    hasPlaintextRemoteContent(entries, docId)
  );
}

async function fetchRemoteDocumentMeta(docId: string): Promise<RemoteDocumentRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, updated_at, publish_mode, password_protected')
    .eq('id', docId)
    .maybeSingle();

  if (!error && data) return data as RemoteDocumentRow;

  const withLegacyPublished = await supabase
    .from('documents')
    .select('id, title, updated_at, is_published, password_protected')
    .eq('id', docId)
    .maybeSingle();
  if (!withLegacyPublished.error && withLegacyPublished.data) {
    return withLegacyPublished.data as RemoteDocumentRow;
  }

  const fallback = await supabase
    .from('documents')
    .select('id, title, updated_at, is_published')
    .eq('id', docId)
    .maybeSingle();
  if (fallback.error) throw new Error(fallback.error.message);
  if (!fallback.data) throw new Error('Document not found');
  return fallback.data as RemoteDocumentRow;
}

async function loadFromPublicSnapshotDeferred(
  meta: RemoteDocumentRow,
  entry: RemoteStorageEntry,
): Promise<DeferredRemoteLoad> {
  const { blob } = await fetchRemoteStorageBlob(entry.path, entry.updatedAt);
  const raw = payloadToRawProjectInput(
    parseDocumentPayload(new Uint8Array(await blob.arrayBuffer())),
  );
  const project = assembleLoadedProject(raw, {
    source: 'remote',
    remoteDocId: meta.id,
    remoteTitle: meta.title,
    folderHandle: null,
    remoteSync: { fileHashes: new Map([[entry.path, await fingerprintBlob(blob)]]) },
    remoteUpdatedAt: meta.updated_at ?? null,
    remotePublishMode: publishModeFromRow(meta),
  });
  return emptyDeferredLoad({
    ...project,
    passwordProtected: true,
  });
}

async function loadReadonlyPasswordDeferred(
  meta: RemoteDocumentRow,
  entries: RemoteStorageEntry[],
): Promise<DeferredRemoteLoad> {
  const docId = meta.id;
  const publishMode = publishModeFromRow(meta);
  const snapshotEntry = entries.find((entry) => entry.path === publicSnapshotStoragePath(docId));
  if (snapshotEntry) {
    return loadFromPublicSnapshotDeferred(meta, snapshotEntry);
  }

  if (hasPlaintextRemoteContent(entries, docId)) {
    const load = await loadRemoteDocumentFromFilesDeferred(meta, entries);
    return {
      ...load,
      project: {
        ...load.project,
        passwordProtected: true,
        remotePublishMode: publishMode,
      },
    };
  }

  const load = await loadRemoteDocumentFromFilesDeferred(meta, entries);
  return {
    ...load,
    project: {
      ...load.project,
      passwordProtected: true,
      remotePublishMode: publishMode,
      warnings: [
        ...load.project.warnings,
        'This document is stored in encrypted format. Ask the owner to re-export it for link viewing.',
      ],
    },
  };
}

export async function unlockRemoteDocumentDeferred(
  docId: string,
  password: string,
  meta: RemoteDocumentRow,
): Promise<DeferredRemoteLoad> {
  const entriesByPath = await remoteStorageEntryMap(docId);
  const lockPath = lockStoragePath(docId);
  const payloadPath = payloadStoragePath(docId);
  const lockBlob = await downloadKnownStorageFile(entriesByPath, lockPath);
  const payloadBlob = await downloadKnownStorageFile(entriesByPath, payloadPath);
  if (!lockBlob || !payloadBlob) {
    throw new Error('Encrypted document files are missing.');
  }

  const parsed = JSON.parse(await lockBlob.text()) as unknown;
  if (!isDocumentLockFile(parsed)) {
    throw new Error('Lock file is invalid.');
  }

  const encrypted = new Uint8Array(await payloadBlob.arrayBuffer());
  const raw = await decryptDocumentPayloadToRawInput(password, parsed, encrypted);
  const fileHashes = new Map<string, string>([
    [lockPath, await fingerprintBlob(lockBlob)],
    [payloadPath, await fingerprintBlob(payloadBlob)],
  ]);

  const project = {
    ...assembleLoadedProject(raw, {
      source: 'remote',
      remoteDocId: docId,
      remoteTitle: meta.title,
      folderHandle: null,
      remoteSync: { fileHashes },
      remoteUpdatedAt: meta.updated_at ?? null,
      remotePublishMode: publishModeFromRow(meta),
    }),
    passwordProtected: true,
    remoteHasEditLock: true,
  };

  return emptyDeferredLoad(project);
}

export type LoadRemoteOptions = {
  /** @deprecated Cache is handled automatically via IndexedDB. */
  cached?: LoadedProject;
};

async function setRemotePasswordProtected(docId: string, protectedDoc: boolean): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('documents')
    .update({ password_protected: protectedDoc })
    .eq('id', docId);
  if (error && !error.message.includes('password_protected')) {
    throw new Error(error.message);
  }
}

type RemoteDocumentRow = {
  id: string;
  title: string;
  updated_at?: string | null;
  publish_mode?: string | null;
  is_published?: boolean | null;
  password_protected?: boolean | null;
};

function remotePasswordProtectedFromRow(
  row: Pick<RemoteDocumentRow, 'password_protected'>,
  lock: DocumentLockFile | null,
): boolean {
  return row.password_protected === true || lock != null;
}

type RemoteDocumentRowPatch = {
  title?: string;
  publishMode?: PublishMode;
};

async function patchRemoteDocumentRow(
  docId: string,
  patch: RemoteDocumentRowPatch,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.publishMode !== undefined) row.publish_mode = patch.publishMode;
  if (Object.keys(row).length === 0) return;

  const supabase = getSupabaseClient();
  const { error } = await supabase.from('documents').update(row).eq('id', docId);
  if (!error) return;

  if (patch.publishMode !== undefined && error.message.includes('publish_mode')) {
    const legacyPublished = patch.publishMode === 'public';
    const { error: legacyError } = await supabase
      .from('documents')
      .update({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        is_published: legacyPublished,
      })
      .eq('id', docId);
    if (legacyError) {
      if (patch.title !== undefined && legacyError.message.includes('is_published')) {
        const { error: titleError } = await supabase
          .from('documents')
          .update({ title: patch.title })
          .eq('id', docId);
        if (titleError) throw new Error(titleError.message);
        return;
      }
      throw new Error(legacyError.message);
    }
    return;
  }

  throw new Error(error.message);
}

function resolveRemotePublishMode(project: LoadedProject, options?: SaveRemoteOptions): PublishMode {
  if (options?.publishMode !== undefined) return options.publishMode;
  return project.remotePublishMode ?? DEFAULT_PUBLISH_MODE;
}

function remotePublishModeChanged(project: LoadedProject, options?: SaveRemoteOptions): boolean {
  if (options?.publishMode === undefined) return false;
  return options.publishMode !== (project.remotePublishMode ?? DEFAULT_PUBLISH_MODE);
}

export async function fetchRemoteDocumentUpdatedAt(docId: string): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('documents')
    .select('updated_at')
    .eq('id', docId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.updated_at ?? null;
}

async function remoteStorageEntryMap(docId: string): Promise<Map<string, RemoteStorageEntry>> {
  const entries = await listRemoteDocEntries(docId);
  return new Map(entries.map((entry) => [entry.path, entry]));
}

async function downloadKnownStorageFile(
  entriesByPath: Map<string, RemoteStorageEntry>,
  path: string,
): Promise<Blob | null> {
  const entry = entriesByPath.get(path);
  if (!entry) return null;
  const { blob } = await fetchRemoteStorageBlob(path, entry.updatedAt);
  return blob;
}

export async function fetchRemoteRelations(docId: string): Promise<RelationsFile> {
  const entriesByPath = await remoteStorageEntryMap(docId);
  if (entriesByPath.size === 0) return EMPTY_RELATIONS;

  const relPath = relationsStoragePath(docId);
  const groupsPath = groupsStoragePath(docId);
  const commentsPath = commentsStoragePath(docId);

  const [relBlob, groupsBlob, commentsBlob] = await Promise.all([
    downloadKnownStorageFile(entriesByPath, relPath),
    downloadKnownStorageFile(entriesByPath, groupsPath),
    downloadKnownStorageFile(entriesByPath, commentsPath),
  ]);

  if (!relBlob && !groupsBlob && !commentsBlob) {
    return EMPTY_RELATIONS;
  }

  const meta = relBlob
    ? relationsFromRaw(JSON.parse(await relBlob.text()))
    : { groups: [] as string[][] };

  // New format: groups and comments are in separate files
  // Old format: groups and comments are embedded in relations.json (backward compat)
  const groups: string[][] = groupsBlob
    ? (JSON.parse(await groupsBlob.text()) as string[][])
    : ((meta as RelationsFile).groups ?? []);

  const comments = commentsBlob
    ? (JSON.parse(await commentsBlob.text()) as RelationsFile['comments'])
    : ((meta as RelationsFile).comments ?? []);

  return normalizeRelations({ ...meta, groups, comments });
}

function normalizeRemoteDocumentListRow(
  entry: RemoteDocumentMeta & { password_protected?: boolean | null },
): RemoteDocumentMeta {
  return {
    id: entry.id,
    title: entry.title,
    updated_at: entry.updated_at,
    password_protected: Boolean(entry.password_protected),
  };
}

/** Public remote docs shown on the welcome screen. */
function publicSavedRemoteDocuments(
  entries: Array<RemoteDocumentMeta & { password_protected?: boolean | null }>,
): RemoteDocumentMeta[] {
  return entries.map(normalizeRemoteDocumentListRow);
}

export async function listRemoteDocuments(): Promise<RemoteDocumentMeta[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, updated_at, password_protected')
    .eq('publish_mode', 'public')
    .order('updated_at', { ascending: false });

  if (error) {
    if (error.message.includes('publish_mode')) {
      const legacyPublished = await supabase
        .from('documents')
        .select('id, title, updated_at, password_protected')
        .eq('is_published', true)
        .order('updated_at', { ascending: false });
      if (legacyPublished.error) {
        if (legacyPublished.error.message.includes('is_published')) {
          const fallback = await supabase
            .from('documents')
            .select('id, title, updated_at, password_protected')
            .order('updated_at', { ascending: false });
          if (fallback.error) {
            if (fallback.error.message.includes('password_protected')) {
              const legacy = await supabase
                .from('documents')
                .select('id, title, updated_at')
                .order('updated_at', { ascending: false });
              if (legacy.error) throw new Error(legacy.error.message);
              return ((legacy.data ?? []) as RemoteDocumentMeta[]).map((entry) => ({
                ...entry,
                password_protected: false,
              }));
            }
            throw new Error(fallback.error.message);
          }
          return publicSavedRemoteDocuments(
            (fallback.data ?? []) as Array<
              RemoteDocumentMeta & { password_protected?: boolean | null }
            >,
          );
        }
        throw new Error(legacyPublished.error.message);
      }
      return publicSavedRemoteDocuments(
        (legacyPublished.data ?? []) as Array<
          RemoteDocumentMeta & { password_protected?: boolean | null }
        >,
      );
    }
    if (error.message.includes('password_protected')) {
      const fallback = await supabase
        .from('documents')
        .select('id, title, updated_at')
        .eq('publish_mode', 'public')
        .order('updated_at', { ascending: false });
      if (fallback.error) {
        if (fallback.error.message.includes('publish_mode')) {
          const legacy = await supabase
            .from('documents')
            .select('id, title, updated_at')
            .eq('is_published', true)
            .order('updated_at', { ascending: false });
          if (legacy.error) {
            if (legacy.error.message.includes('is_published')) {
              const all = await supabase
                .from('documents')
                .select('id, title, updated_at')
                .order('updated_at', { ascending: false });
              if (all.error) throw new Error(all.error.message);
              return ((all.data ?? []) as RemoteDocumentMeta[]).map((entry) => ({
                ...entry,
                password_protected: false,
              }));
            }
            throw new Error(legacy.error.message);
          }
          return ((legacy.data ?? []) as RemoteDocumentMeta[]).map((entry) => ({
            ...entry,
            password_protected: false,
          }));
        }
        throw new Error(fallback.error.message);
      }
      return ((fallback.data ?? []) as RemoteDocumentMeta[]).map((entry) => ({
        ...entry,
        password_protected: false,
      }));
    }
    throw new Error(error.message);
  }
  return publicSavedRemoteDocuments(
    (data ?? []) as Array<RemoteDocumentMeta & { password_protected?: boolean | null }>,
  );
}

async function listRemoteDocEntries(docId: string): Promise<RemoteStorageEntry[]> {
  const supabase = getSupabaseClient();
  const entries: RemoteStorageEntry[] = [];

  const { data: rootData, error: rootError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(docId, { limit: 1000 });
  if (rootError) {
    if (!rootError.message.toLowerCase().includes('not found')) {
      throw new Error(rootError.message);
    }
  } else {
    for (const entry of rootData ?? []) {
      if (entry.id === null) continue;
      if (entry.name === 'bundle.zip') continue;
      entries.push({
        path: `${docId}/${entry.name}`,
        updatedAt: entry.updated_at ?? null,
      });
    }
  }

  const docsPrefix = `${docId}/docs`;
  const { data: docsData, error: docsError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .list(docsPrefix, { limit: 1000 });
  if (docsError) {
    if (!docsError.message.toLowerCase().includes('not found')) {
      throw new Error(docsError.message);
    }
  } else {
    for (const entry of docsData ?? []) {
      if (entry.id === null) continue;
      entries.push({
        path: `${docsPrefix}/${entry.name}`,
        updatedAt: entry.updated_at ?? null,
      });
    }
  }

  return entries.filter((entry) => entry.path !== legacyBundlePath(docId));
}

let remoteTextLoadDone: Promise<void> = Promise.resolve();
let finishRemoteTextLoad: (() => void) | null = null;
let remoteTextLoadGeneration = 0;

function beginRemoteTextLoad(): number {
  const generation = ++remoteTextLoadGeneration;
  remoteTextLoadDone = new Promise((resolve) => {
    finishRemoteTextLoad = () => {
      if (generation === remoteTextLoadGeneration) {
        resolve();
      }
    };
  });
  return generation;
}

function endRemoteTextLoad(generation: number): void {
  if (generation !== remoteTextLoadGeneration) return;
  finishRemoteTextLoad?.();
  finishRemoteTextLoad = null;
}

function partitionRemoteTextEntries(
  entries: RemoteStorageEntry[],
  docId: string,
): {
  meta: RemoteStorageEntry[];
  pages: RemoteStorageEntry[];
  mds: RemoteStorageEntry[];
} {
  const meta: RemoteStorageEntry[] = [];
  const pages: RemoteStorageEntry[] = [];
  const mds: RemoteStorageEntry[] = [];

  for (const entry of entries) {
    if (isRemoteImageStoragePath(entry.path, docId)) continue;
    if (
      isRelationsPath(entry.path, docId) ||
      isGroupsPath(entry.path, docId) ||
      isCommentsPath(entry.path, docId)
    ) {
      meta.push(entry);
      continue;
    }
    const fileName = parseStorageFileName(entry.path, docId);
    if (!fileName) continue;
    if (isPageFileName(fileName)) pages.push(entry);
    else if (MD_FILE_EXT.test(fileName)) mds.push(entry);
  }

  return { meta, pages, mds };
}

function mergeDownloadResults(
  ...results: Array<{ blobs: Map<string, Blob>; hashes: Map<string, string> }>
): { blobs: Map<string, Blob>; hashes: Map<string, string> } {
  const blobs = new Map<string, Blob>();
  const hashes = new Map<string, string>();
  for (const result of results) {
    for (const [path, blob] of result.blobs) blobs.set(path, blob);
    for (const [path, hash] of result.hashes) hashes.set(path, hash);
  }
  return { blobs, hashes };
}

function referencedMdFileNamesFromPages(
  pages: ReturnType<typeof assembleProject>['pages'],
): Set<string> {
  const names = new Set<string>();
  for (const page of pages) {
    for (const component of page.components) {
      if (component.type === 'md') names.add(mdSidecarFileName(component.id));
    }
  }
  return names;
}

async function fetchRemoteStorageBlob(
  path: string,
  storageUpdatedAt: string | null,
  options?: { afterText?: boolean },
): Promise<{ blob: Blob; hash: string }> {
  if (options?.afterText) {
    await remoteTextLoadDone;
  }
  if (storageUpdatedAt) {
    const cached = await getRemoteCachedFile(path);
    if (cached && cached.storageUpdatedAt === storageUpdatedAt) {
      return { blob: cached.blob, hash: cached.hash };
    }
  }

  const blob = await downloadStorageFile(path);
  const hash = await fingerprintBlob(blob);
  await putRemoteCachedFile({ path, blob, hash, storageUpdatedAt });
  return { blob, hash };
}

async function refreshRemoteCacheAfterSave(
  docId: string,
  uploadPaths: string[],
  fileMap: Map<string, Blob>,
  fileHashes: Map<string, string>,
): Promise<void> {
  if (uploadPaths.length === 0) return;
  const entries = await listRemoteDocEntries(docId);
  const updatedAtByPath = new Map(entries.map((entry) => [entry.path, entry.updatedAt]));
  await mapWithConcurrency(
    uploadPaths,
    async (path) => {
      const blob = fileMap.get(path);
      const hash = fileHashes.get(path);
      if (!blob || !hash) return;
      await putRemoteCachedFile({
        path,
        blob,
        hash,
        storageUpdatedAt: updatedAtByPath.get(path) ?? null,
      });
    },
    DEFAULT_CONCURRENCY,
  );
}

async function downloadStorageFile(path: string): Promise<Blob> {
  const supabase = getSupabaseClient();
  // Use a signed URL + no-store fetch to bypass browser HTTP cache.
  // Two tabs sharing the same origin would otherwise serve stale cached blobs.
  const { data: urlData, error: urlError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 60);
  if (urlError || !urlData?.signedUrl) {
    // Fall back to SDK download if signing fails
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
    if (error || !data) throw new Error(error?.message ?? `Could not download ${path}`);
    return data;
  }
  const response = await fetch(urlData.signedUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not download ${path}: ${response.status}`);
  return response.blob();
}

async function removeStoragePaths(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const supabase = getSupabaseClient();
  const batches: string[][] = [];
  for (let i = 0; i < paths.length; i += 100) {
    batches.push(paths.slice(i, i + 100));
  }
  await runWithConcurrency(
    batches.map((batch) => async () => {
      const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(batch);
      if (error) throw new Error(error.message);
    }),
    DEFAULT_CONCURRENCY,
  );
}

async function uploadStorageFile(path: string, body: Blob | string): Promise<void> {
  const supabase = getSupabaseClient();
  const payload = typeof body === 'string' ? new Blob([body], { type: 'application/json' }) : body;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, payload, {
    upsert: true,
    contentType: payload.type || undefined,
  });
  if (error) throw new Error(`Storage upload failed (${path}): ${error.message}`);
}

function isRemoteImageStoragePath(path: string, docId: string): boolean {
  if (!path.startsWith(`${docId}/`)) return false;
  const baseName = path.slice(path.lastIndexOf('/') + 1);
  return isImageFileName(baseName);
}

function imageFileNameFromStoragePath(path: string, docId: string): string | null {
  const name = parseStorageFileName(path, docId) ?? path.slice(path.lastIndexOf('/') + 1);
  return name || null;
}

async function parseRemoteFileBlobs(
  docId: string,
  paths: string[],
  fileBlobs: Map<string, Blob>,
): Promise<{
  relations: RelationsFile;
  pageFiles: { name: string; content: unknown }[];
  imageFiles: { name: string; blob: Blob }[];
  mdFiles: { componentId: string; content: string }[];
}> {
  let relationsMeta: RelationsFile = { groups: [] };
  let groups: string[][] | null = null;
  let comments: RelationsFile['comments'] | null = null;
  const pageFiles: { name: string; content: unknown }[] = [];
  const imageFiles: { name: string; blob: Blob }[] = [];
  const mdFiles: { componentId: string; content: string }[] = [];

  for (const path of paths) {
    const blob = fileBlobs.get(path);
    if (!blob) continue;

    if (isRelationsPath(path, docId)) {
      relationsMeta = relationsFromRaw(JSON.parse(await blob.text()));
      continue;
    }
    if (isGroupsPath(path, docId)) {
      groups = JSON.parse(await blob.text()) as string[][];
      continue;
    }
    if (isCommentsPath(path, docId)) {
      comments = JSON.parse(await blob.text()) as RelationsFile['comments'];
      continue;
    }

    const fileName = parseStorageFileName(path, docId);
    if (!fileName) continue;

    if (isPageFileName(fileName)) {
      pageFiles.push({ name: fileName, content: JSON.parse(await blob.text()) });
    } else if (isImageFileName(fileName)) {
      imageFiles.push({ name: fileName, blob });
    } else if (MD_FILE_EXT.test(fileName)) {
      const componentId = componentIdFromMdFileName(fileName);
      if (componentId) {
        mdFiles.push({ componentId, content: await blob.text() });
      }
    }
  }

  // Merge: new-format files win; fall back to values embedded in relations.json
  const relations: RelationsFile = {
    ...relationsMeta,
    groups: groups ?? (relationsMeta as RelationsFile).groups ?? [],
    comments: comments ?? (relationsMeta as RelationsFile).comments ?? [],
  };

  return { relations, pageFiles, imageFiles, mdFiles };
}

function createStarterRemoteProject(
  meta: RemoteDocumentRow,
  relations: RelationsFile = EMPTY_RELATIONS,
): LoadedProject {
  const normalized = normalizeRelations(relations);
  const page = createDefaultPageData('page.p', normalized.pageNames);
  return assembleLoadedProject(
    {
      pageFiles: [
        {
          name: page.fileName,
          content: serializePageComponents(page.components, page.pageId),
        },
      ],
      relations: normalized,
      stylesPartial: null,
      imageFiles: [],
      mdFiles: [],
    },
    {
      source: 'remote',
      remoteDocId: meta.id,
      remoteTitle: meta.title,
      folderHandle: null,
      remoteSync: emptyRemoteSync(),
      remoteUpdatedAt: meta.updated_at ?? null,
      remotePublishMode: publishModeFromRow(meta),
    },
  );
}

async function loadRemoteDocumentFromFiles(
  meta: RemoteDocumentRow,
  entries: RemoteStorageEntry[],
  fileBlobs: Map<string, Blob>,
  fileHashes: Map<string, string>,
): Promise<LoadedProject> {
  const docId = meta.id;
  const paths = entries.map((entry) => entry.path);
  const parsed = await parseRemoteFileBlobs(docId, paths, fileBlobs);
  if (parsed.pageFiles.length === 0) {
    return createStarterRemoteProject(meta, parsed.relations);
  }

  return assembleLoadedProject(
    {
      pageFiles: parsed.pageFiles,
      relations: parsed.relations,
      stylesPartial: null,
      imageFiles: parsed.imageFiles,
      mdFiles: parsed.mdFiles,
    },
    {
      source: 'remote',
      remoteDocId: docId,
      remoteTitle: meta.title,
      folderHandle: null,
      remoteSync: { fileHashes },
      remoteUpdatedAt: meta.updated_at ?? null,
      remotePublishMode: publishModeFromRow(meta),
    },
  );
}

async function downloadRemoteEntries(
  entries: RemoteStorageEntry[],
  options?: { afterText?: boolean },
): Promise<{ blobs: Map<string, Blob>; hashes: Map<string, string> }> {
  if (entries.length === 0) {
    return { blobs: new Map(), hashes: new Map() };
  }
  const blobs = new Map<string, Blob>();
  const hashes = new Map<string, string>();
  await mapWithConcurrency(
    entries,
    async (entry) => {
      const { blob, hash } = await fetchRemoteStorageBlob(entry.path, entry.updatedAt, {
        afterText: options?.afterText,
      });
      blobs.set(entry.path, blob);
      hashes.set(entry.path, hash);
    },
    DEFAULT_CONCURRENCY,
  );
  return { blobs, hashes };
}

export type RemoteMdHandler = (
  componentId: string,
  content: string,
  storagePath: string,
  fileHash: string,
) => void;

export type DeferredRemoteLoad = {
  project: LoadedProject;
  /** Call after the project is in app state — loads referenced markdown sidecars. */
  startMd: (onMd: RemoteMdHandler) => void;
  /** Call after the project is in app state — loads referenced images only. */
  startImages: (onImage: RemoteImageHandler) => void;
  whenMdReady: Promise<void>;
  whenImagesReady: Promise<void>;
  cancelBackgroundLoad: () => void;
};

function emptyDeferredLoad(project: LoadedProject): DeferredRemoteLoad {
  return {
    project,
    startMd: () => {},
    startImages: () => {},
    whenMdReady: Promise.resolve(),
    whenImagesReady: Promise.resolve(),
    cancelBackgroundLoad: () => {},
  };
}

async function loadRemoteDocumentFromFilesDeferred(
  meta: RemoteDocumentRow,
  entries: RemoteStorageEntry[],
): Promise<DeferredRemoteLoad> {
  const docId = meta.id;
  const textLoadGeneration = beginRemoteTextLoad();
  try {
    return await loadRemoteDocumentFromFilesDeferredInner(meta, entries, docId);
  } finally {
    endRemoteTextLoad(textLoadGeneration);
  }
}

async function loadRemoteDocumentFromFilesDeferredInner(
  meta: RemoteDocumentRow,
  entries: RemoteStorageEntry[],
  docId: string,
): Promise<DeferredRemoteLoad> {
  const textEntries = entries.filter((entry) => !isRemoteImageStoragePath(entry.path, docId));
  const { meta: metaEntries, pages: pageEntries, mds: mdEntries } =
    partitionRemoteTextEntries(textEntries, docId);

  const metaResult = await downloadRemoteEntries(metaEntries);
  const pageResult = await downloadRemoteEntries(pageEntries);
  const metaPageBlobs = mergeDownloadResults(metaResult, pageResult);
  const metaPagePaths = [...metaPageBlobs.blobs.keys()];
  const parsed = await parseRemoteFileBlobs(docId, metaPagePaths, metaPageBlobs.blobs);

  if (parsed.pageFiles.length === 0) {
    return emptyDeferredLoad(createStarterRemoteProject(meta, parsed.relations));
  }

  const assembledPages = assembleProject({
    pageFiles: parsed.pageFiles,
    relations: parsed.relations,
    stylesPartial: null,
    imageFiles: [],
    mdFiles: [],
  }).pages;
  const referencedMdNames = referencedMdFileNamesFromPages(assembledPages);
  const mdToFetch = mdEntries.filter((entry) => {
    const fileName = parseStorageFileName(entry.path, docId);
    return fileName ? referencedMdNames.has(fileName) : false;
  });

  const project = assembleLoadedProject(
    {
      pageFiles: parsed.pageFiles,
      relations: parsed.relations,
      stylesPartial: null,
      imageFiles: [],
      mdFiles: [],
      deferMdWarnings: true,
    },
    {
      source: 'remote',
      remoteDocId: docId,
      remoteTitle: meta.title,
      folderHandle: null,
      remoteSync: { fileHashes: new Map(metaPageBlobs.hashes) },
      remoteUpdatedAt: meta.updated_at ?? null,
      remotePublishMode: publishModeFromRow(meta),
    },
  );

  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const imageEntries = [...collectReferencedImageNames(project)]
    .map((name) => entryByPath.get(docsStoragePath(docId, name)))
    .filter((entry): entry is RemoteStorageEntry => entry !== undefined);

  const abortController = new AbortController();
  let resolveMdDone!: () => void;
  let resolveImagesDone!: () => void;
  const whenMdReady = new Promise<void>((resolve) => {
    resolveMdDone = resolve;
  });
  const whenImagesReady = new Promise<void>((resolve) => {
    resolveImagesDone = resolve;
  });

  const startMd = (onMd: RemoteMdHandler) => {
    if (mdToFetch.length === 0 || abortController.signal.aborted) {
      resolveMdDone();
      return;
    }
    void mapWithConcurrency(
      mdToFetch,
      async (entry) => {
        if (abortController.signal.aborted) return;
        try {
          const { blob, hash } = await fetchRemoteStorageBlob(entry.path, entry.updatedAt, {
            afterText: true,
          });
          const fileName = parseStorageFileName(entry.path, docId);
          const componentId = fileName ? componentIdFromMdFileName(fileName) : null;
          if (!componentId) return;
          onMd(componentId, await blob.text(), entry.path, hash);
        } catch {
          // Skip missing or failed markdown; others can still load.
        }
      },
      REMOTE_MD_LOAD_CONCURRENCY,
    ).finally(() => {
      resolveMdDone();
    });
  };

  const startImages = (onImage: RemoteImageHandler) => {
    if (imageEntries.length === 0 || abortController.signal.aborted) {
      resolveImagesDone();
      return;
    }
    void mapWithConcurrency(
      imageEntries,
      async (entry) => {
        if (abortController.signal.aborted) return;
        try {
          const { blob } = await fetchRemoteStorageBlob(entry.path, entry.updatedAt, {
            afterText: true,
          });
          const fileName = imageFileNameFromStoragePath(entry.path, docId);
          if (fileName) onImage(fileName, blob);
        } catch {
          // Skip missing or failed images; others can still load.
        }
      },
      REMOTE_IMAGE_LOAD_CONCURRENCY,
    ).finally(() => {
      resolveImagesDone();
    });
  };

  return {
    project,
    startMd,
    startImages,
    whenMdReady,
    whenImagesReady,
    cancelBackgroundLoad: () => abortController.abort(),
  };
}

/**
 * Smart reload: fetch server file list, download only files newer on the server,
 * and preserve in-memory data for files that haven't changed. This way local
 * unsaved changes to files the server hasn't touched are kept.
 */
export async function smartReloadRemoteDocument(
  current: LoadedProject,
): Promise<DeferredRemoteLoad> {
  const docId = current.remoteDocId;
  if (!docId) throw new Error('No remote document ID');

  const meta = await fetchRemoteDocumentMeta(docId);
  const serverEntries = await listRemoteDocEntries(docId);

  if (serverEntries.length === 0) {
    return emptyDeferredLoad(createStarterRemoteProject(meta, current.relations));
  }

  // Partition entries into changed (need download) vs unchanged (use in-memory)
  const changedEntries: RemoteStorageEntry[] = [];
  const unchangedEntries: RemoteStorageEntry[] = [];

  await mapWithConcurrency(
    serverEntries,
    async (entry) => {
      if (!entry.updatedAt) {
        // No timestamp — must download
        changedEntries.push(entry);
        return;
      }
      const cached = await getRemoteCachedFile(entry.path);
      if (!cached || cached.storageUpdatedAt !== entry.updatedAt) {
        changedEntries.push(entry);
      } else {
        unchangedEntries.push(entry);
      }
    },
    DEFAULT_CONCURRENCY,
  );

  // Build blobs+hashes: start with unchanged files sourced from IndexedDB cache
  const allBlobs = new Map<string, Blob>();
  const allHashes = new Map<string, string>();

  // Load unchanged files from IndexedDB (they're already cached there)
  await mapWithConcurrency(
    unchangedEntries,
    async (entry) => {
      const cached = await getRemoteCachedFile(entry.path);
      if (cached) {
        allBlobs.set(entry.path, cached.blob);
        allHashes.set(entry.path, cached.hash);
      } else {
        // Cache miss despite passing — download as fallback
        changedEntries.push(entry);
      }
    },
    DEFAULT_CONCURRENCY,
  );

  // Download changed files (text first, images deferred)
  const changedText = changedEntries.filter(
    (entry) => !isRemoteImageStoragePath(entry.path, docId),
  );
  const changedImages = changedEntries.filter((entry) =>
    isRemoteImageStoragePath(entry.path, docId),
  );

  const textLoadGeneration = beginRemoteTextLoad();
  try {
    const { meta: metaEntries, pages: pageEntries } =
      partitionRemoteTextEntries(changedText, docId);

    const metaResult = await downloadRemoteEntries(metaEntries);
    const pageResult = await downloadRemoteEntries(pageEntries);
    for (const [p, b] of metaResult.blobs) allBlobs.set(p, b);
    for (const [p, h] of metaResult.hashes) allHashes.set(p, h);
    for (const [p, b] of pageResult.blobs) allBlobs.set(p, b);
    for (const [p, h] of pageResult.hashes) allHashes.set(p, h);

    // --- Build relations from merged data ---
    // Server-changed meta files win; else fall back to current in-memory relations
    const relPath = relationsStoragePath(docId);
    const groupsPath = groupsStoragePath(docId);
    const commentsPath = commentsStoragePath(docId);

    let relationsMeta: RelationsFile = current.relations;
    let groups: string[][] | null = null;
    let comments: RelationsFile['comments'] | null = null;

    if (allBlobs.has(relPath)) {
      relationsMeta = relationsFromRaw(JSON.parse(await allBlobs.get(relPath)!.text()));
    }
    if (allBlobs.has(groupsPath)) {
      groups = JSON.parse(await allBlobs.get(groupsPath)!.text()) as string[][];
    }
    if (allBlobs.has(commentsPath)) {
      comments = JSON.parse(await allBlobs.get(commentsPath)!.text()) as RelationsFile['comments'];
    }

    const mergedRelations: RelationsFile = normalizeRelations({
      ...relationsMeta,
      groups: groups ?? current.relations.groups ?? [],
      comments: comments ?? current.relations.comments ?? [],
    });

    // --- Build page files: server-changed pages win; else extract from current project ---
    const currentRaw = projectToRawInput(current);
    const currentPageMap = new Map(
      currentRaw.pageFiles.map((pf) => [pf.name, pf]),
    );

    // All page entries from server (both changed and unchanged)
    const allPageEntries = serverEntries.filter((entry) => {
      const fileName = parseStorageFileName(entry.path, docId);
      return fileName != null && isPageFileName(fileName);
    });

    const pageFiles: { name: string; content: unknown }[] = [];
    for (const entry of allPageEntries) {
      const fileName = parseStorageFileName(entry.path, docId)!;
      if (allBlobs.has(entry.path)) {
        // Downloaded from server (changed)
        pageFiles.push({ name: fileName, content: JSON.parse(await allBlobs.get(entry.path)!.text()) });
      } else {
        // Unchanged — use current in-memory page
        const existing = currentPageMap.get(fileName);
        if (existing) pageFiles.push(existing);
      }
    }
    // Also keep any in-memory pages not on server at all (new pages not yet saved)
    const serverPageFileNames = new Set(
      allPageEntries.map((e) => parseStorageFileName(e.path, docId)).filter(Boolean),
    );
    for (const pf of currentRaw.pageFiles) {
      if (!serverPageFileNames.has(pf.name)) pageFiles.push(pf);
    }

    if (pageFiles.length === 0) {
      return emptyDeferredLoad(createStarterRemoteProject(meta, mergedRelations));
    }

    // --- Build md files: server-changed md files win; else extract from current project ---
    const allMdEntries = serverEntries.filter((entry) => {
      const fileName = parseStorageFileName(entry.path, docId);
      return fileName != null && MD_FILE_EXT.test(fileName);
    });

    // Assemble pages to know which md files are referenced
    const assembledPages = assembleProject({
      pageFiles,
      relations: mergedRelations,
      stylesPartial: null,
      imageFiles: [],
      mdFiles: [],
    }).pages;
    const referencedMdNames = referencedMdFileNamesFromPages(assembledPages);

    // Split md entries into already-downloaded vs still-needed
    const mdToFetch: RemoteStorageEntry[] = [];
    const mdFiles: { componentId: string; content: string }[] = [];

    // Include unchanged md from current in-memory project
    for (const [componentId, content] of current.mdFiles.entries()) {
      const fileName = mdSidecarFileName(componentId);
      if (!referencedMdNames.has(fileName)) continue;
      const entry = allMdEntries.find(
        (e) => parseStorageFileName(e.path, docId) === fileName,
      );
      if (!entry) {
        // not on server — keep local
        mdFiles.push({ componentId, content });
      } else if (allBlobs.has(entry.path)) {
        // downloaded (changed on server)
        const blob = allBlobs.get(entry.path)!;
        mdFiles.push({ componentId, content: await blob.text() });
      } else {
        // unchanged on server — use in-memory
        mdFiles.push({ componentId, content });
      }
    }

    // Changed md entries that weren't in current project (new from server)
    for (const entry of allMdEntries) {
      const fileName = parseStorageFileName(entry.path, docId)!;
      if (!referencedMdNames.has(fileName)) continue;
      const componentId = componentIdFromMdFileName(fileName);
      if (!componentId) continue;
      if (current.mdFiles.has(componentId)) continue; // handled above
      if (allBlobs.has(entry.path)) {
        const blob = allBlobs.get(entry.path)!;
        mdFiles.push({ componentId, content: await blob.text() });
      } else {
        // unchanged on server but not in memory — need to fetch for deferred load
        mdToFetch.push(entry);
      }
    }

    // Build the initial project (no images or pending md yet)
    const project = assembleLoadedProject(
      {
        pageFiles,
        relations: mergedRelations,
        stylesPartial: null,
        imageFiles: [],
        mdFiles,
        deferMdWarnings: mdToFetch.length > 0,
      },
      {
        source: 'remote',
        remoteDocId: docId,
        remoteTitle: meta.title,
        folderHandle: null,
        remoteSync: { fileHashes: new Map(allHashes) },
        remoteUpdatedAt: meta.updated_at ?? null,
        remotePublishMode: publishModeFromRow(meta),
      },
    );

    // Determine which image entries need loading (changed or not yet in memory)
    const entryByPath = new Map(serverEntries.map((e) => [e.path, e]));
    const imageEntries = [...collectReferencedImageNames(project)]
      .map((name) => entryByPath.get(docsStoragePath(docId, name)))
      .filter((entry): entry is RemoteStorageEntry => entry !== undefined);

    // Changed images (need download) — include in background fetch
    // Unchanged images already in current.imageBlobs — inject synchronously via onImage
    const imagesToFetch: RemoteStorageEntry[] = [];
    const immediateImages: { name: string; blob: Blob }[] = [];
    for (const entry of imageEntries) {
      if (changedImages.some((ci) => ci.path === entry.path)) {
        imagesToFetch.push(entry);
      } else {
        const imgName = imageFileNameFromStoragePath(entry.path, docId);
        if (imgName) {
          const existingBlob = current.imageBlobs.get(imgName);
          if (existingBlob) {
            immediateImages.push({ name: imgName, blob: existingBlob });
          } else {
            imagesToFetch.push(entry);
          }
        }
      }
    }

    const abortController = new AbortController();
    let resolveMdDone!: () => void;
    let resolveImagesDone!: () => void;
    const whenMdReady = new Promise<void>((resolve) => { resolveMdDone = resolve; });
    const whenImagesReady = new Promise<void>((resolve) => { resolveImagesDone = resolve; });

    const startMd = (onMd: RemoteMdHandler) => {
      if (mdToFetch.length === 0 || abortController.signal.aborted) {
        resolveMdDone();
        return;
      }
      void mapWithConcurrency(
        mdToFetch,
        async (entry) => {
          if (abortController.signal.aborted) return;
          try {
            const { blob, hash } = await fetchRemoteStorageBlob(entry.path, entry.updatedAt, {
              afterText: true,
            });
            const fileName = parseStorageFileName(entry.path, docId);
            const componentId = fileName ? componentIdFromMdFileName(fileName) : null;
            if (!componentId) return;
            onMd(componentId, await blob.text(), entry.path, hash);
          } catch {
            // skip
          }
        },
        REMOTE_MD_LOAD_CONCURRENCY,
      ).finally(() => resolveMdDone());
    };

    const startImages = (onImage: RemoteImageHandler) => {
      // Inject already-in-memory images immediately
      for (const { name, blob } of immediateImages) {
        onImage(name, blob);
      }
      if ((imagesToFetch.length === 0) || abortController.signal.aborted) {
        resolveImagesDone();
        return;
      }
      void mapWithConcurrency(
        imagesToFetch,
        async (entry) => {
          if (abortController.signal.aborted) return;
          try {
            const { blob } = await fetchRemoteStorageBlob(entry.path, entry.updatedAt, {
              afterText: true,
            });
            const fileName = imageFileNameFromStoragePath(entry.path, docId);
            if (fileName) onImage(fileName, blob);
          } catch {
            // skip
          }
        },
        REMOTE_IMAGE_LOAD_CONCURRENCY,
      ).finally(() => resolveImagesDone());
    };

    return {
      project,
      startMd,
      startImages,
      whenMdReady,
      whenImagesReady,
      cancelBackgroundLoad: () => abortController.abort(),
    };
  } finally {
    endRemoteTextLoad(textLoadGeneration);
  }
}

/** Load remote doc: open after text; call `startImages` once project is in state. */
export async function loadRemoteDocumentDeferred(docId: string): Promise<RemoteDocumentLoadResult> {
  const meta = await fetchRemoteDocumentMeta(docId);

  const entries = await listRemoteDocEntries(docId);
  if (entries.length === 0) {
    return { status: 'ready', load: emptyDeferredLoad(createStarterRemoteProject(meta)) };
  }

  const lock = await readRemoteDocumentLock(docId);
  const publishMode = publishModeFromRow(meta);
  const passwordProtected = remotePasswordProtectedFromRow(meta, lock);
  const hasEditLock = lock != null;
  const readonlyAllowed = allowsReadonlyPasswordAccess(publishMode, passwordProtected);
  const hasReadonlyContent = hasReadonlyRemoteContent(entries, docId);

  if (readonlyAllowed && hasReadonlyContent) {
    const load = await loadReadonlyPasswordDeferred(meta, entries);
    return {
      status: 'ready',
      load: {
        ...load,
        project: { ...load.project, remoteHasEditLock: hasEditLock },
      },
    };
  }

  if (
    lock &&
    (requiresPasswordToOpen(publishMode, passwordProtected) ||
      (passwordProtected && (!readonlyAllowed || !hasReadonlyContent)))
  ) {
    return {
      status: 'password',
      docId,
      title: meta.title,
      lock,
      publishMode,
    };
  }

  const load = await loadRemoteDocumentFromFilesDeferred(meta, entries);
  return {
    status: 'ready',
    load: {
      ...load,
      project: { ...load.project, remoteHasEditLock: hasEditLock },
    },
  };
}

export async function loadRemoteDocument(
  docId: string,
  _options?: LoadRemoteOptions,
): Promise<LoadedProject> {
  const meta = await fetchRemoteDocumentMeta(docId);

  const entries = await listRemoteDocEntries(docId);
  if (entries.length === 0) {
    return createStarterRemoteProject(meta);
  }

  const { blobs: fileBlobs, hashes: fileHashes } = await downloadRemoteEntries(entries);
  return loadRemoteDocumentFromFiles(meta, entries, fileBlobs, fileHashes);
}

async function mergeRemoteCommentsIntoProject(
  project: LoadedProject,
  docId: string,
): Promise<LoadedProject> {
  // First publish: nothing exists on the server yet — skip remote probes.
  if (!project.remoteSync) {
    return project;
  }

  const remoteRelations = await fetchRemoteRelations(docId);
  const localComments = project.relations.comments ?? [];
  const mergedComments = mergeCommentsFromServer(
    remoteRelations.comments ?? [],
    localComments,
  );
  if (commentsEqual(localComments, mergedComments)) {
    return project;
  }
  return {
    ...project,
    relations: { ...project.relations, comments: mergedComments },
  };
}

export type SaveRemoteRelationsResult = {
  mergedProject: LoadedProject;
  remoteSync: RemoteSyncState;
  remoteUpdatedAt: string | null;
  skippedUpload: boolean;
};

/** Upload relations.json only — used to sync comments without page-level conflict gates. */
export async function saveRemoteRelationsFile(
  docId: string,
  project: LoadedProject,
): Promise<SaveRemoteRelationsResult> {
  const supabase = getSupabaseClient();
  const projectForSave = await mergeRemoteCommentsIntoProject(project, docId);
  const relationsPath = relationsStoragePath(docId);
  const relationsBlob = new Blob(
    [`${JSON.stringify(normalizeRelations(projectForSave.relations), null, 2)}\n`],
    { type: 'application/json' },
  );
  const nextHash = await fingerprintBlob(relationsBlob);
  const prevHash = project.remoteSync?.fileHashes?.get(relationsPath);

  if (prevHash === nextHash) {
    return {
      mergedProject: projectForSave,
      remoteSync: project.remoteSync ?? emptyRemoteSync(),
      remoteUpdatedAt: project.remoteUpdatedAt ?? null,
      skippedUpload: true,
    };
  }

  await uploadStorageFile(relationsPath, relationsBlob);

  const nextTitle = normalizeDocumentTitle(
    project.remoteTitle ?? defaultRemoteTitle(projectForSave),
  );
  const { error } = await supabase.from('documents').update({ title: nextTitle }).eq('id', docId);
  if (error) throw new Error(error.message);

  const remoteUpdatedAt = await fetchRemoteDocumentUpdatedAt(docId);
  const nextHashes = new Map(project.remoteSync?.fileHashes ?? []);
  nextHashes.set(relationsPath, nextHash);

  return {
    mergedProject: projectForSave,
    remoteSync: {
      fileHashes: nextHashes,
    },
    remoteUpdatedAt,
    skippedUpload: false,
  };
}

function jsonBlob(value: unknown): Blob {
  return new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
}

/**
 * Pull remote comments into an open project without touching page/group data.
 * Only fetches comments.json — much cheaper than a full relations fetch.
 */
export async function syncRemoteComments(
  project: LoadedProject,
): Promise<LoadedProject | null> {
  const docId = project.remoteDocId;
  if (!docId) return null;

  try {
    const entriesByPath = await remoteStorageEntryMap(docId);
    const commentsPath = commentsStoragePath(docId);

    // Fetch only comments.json; fall back to full relations if it doesn't exist yet
    let remoteComments: RelationsFile['comments'];
    let commentsHash: string;
    const commentsBlob = await downloadKnownStorageFile(entriesByPath, commentsPath);
    if (commentsBlob) {
      remoteComments = JSON.parse(await commentsBlob.text()) as RelationsFile['comments'];
      commentsHash = await fingerprintBlob(commentsBlob);
    } else {
      const remoteRelations = await fetchRemoteRelations(docId);
      remoteComments = remoteRelations.comments ?? [];
      commentsHash = await fingerprintBlob(jsonBlob(remoteComments));
    }
    const prevHash = project.remoteSync?.fileHashes?.get(commentsPath);
    // If hash matches, nothing changed on server
    if (prevHash === commentsHash) return null;

    const localComments = project.relations.comments ?? [];
    const mergedComments = mergeCommentsFromServer(remoteComments ?? [], localComments);
    if (commentsEqual(localComments, mergedComments)) {
      // Comments content same after merge — just update the hash so we stop polling
      const nextHashes = new Map(project.remoteSync?.fileHashes ?? []);
      nextHashes.set(commentsPath, commentsHash);
      let remoteUpdatedAt = project.remoteUpdatedAt;
      try {
        remoteUpdatedAt = await fetchRemoteDocumentUpdatedAt(docId);
      } catch {
        // keep previous timestamp
      }
      return {
        ...project,
        remoteUpdatedAt,
        remoteSync: {
          fileHashes: nextHashes,
        },
      };
    }

    const nextHashes = new Map(project.remoteSync?.fileHashes ?? []);
    nextHashes.set(commentsPath, commentsHash);

    let remoteUpdatedAt = project.remoteUpdatedAt;
    try {
      remoteUpdatedAt = await fetchRemoteDocumentUpdatedAt(docId);
    } catch {
      // keep previous timestamp
    }

    return {
      ...project,
      relations: { ...project.relations, comments: mergedComments },
      remoteUpdatedAt,
      remoteSync: {
        fileHashes: nextHashes,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Pull latest relations/groups/comments from server into an open project (when not dirty).
 * Each of the three files is checked independently — only changed files trigger a rebuild.
 */
export async function syncRemoteRelations(
  project: LoadedProject,
): Promise<LoadedProject | null> {
  const docId = project.remoteDocId;
  if (!docId) return null;

  try {
    const prevHashes = project.remoteSync?.fileHashes;
    const entriesByPath = await remoteStorageEntryMap(docId);
    if (entriesByPath.size === 0) return null;

    const relPath = relationsStoragePath(docId);
    const groupsPath = groupsStoragePath(docId);
    const commentsPath = commentsStoragePath(docId);

    // Fetch only relation files that already exist on the server
    const [relBlob, groupsBlob, commentsBlob] = await Promise.all([
      downloadKnownStorageFile(entriesByPath, relPath),
      downloadKnownStorageFile(entriesByPath, groupsPath),
      downloadKnownStorageFile(entriesByPath, commentsPath),
    ]);

    if (!relBlob && !groupsBlob && !commentsBlob) return null;

    // Compute hashes for changed-detection
    const [relHash, groupsHash, commentsHash] = await Promise.all([
      relBlob ? fingerprintBlob(relBlob) : Promise.resolve(null),
      groupsBlob ? fingerprintBlob(groupsBlob) : Promise.resolve(null),
      commentsBlob ? fingerprintBlob(commentsBlob) : Promise.resolve(null),
    ]);

    const relChanged = relBlob && relHash !== prevHashes?.get(relationsStoragePath(docId));
    const groupsChanged = groupsBlob && groupsHash !== prevHashes?.get(groupsStoragePath(docId));
    const commentsChanged = commentsBlob && commentsHash !== prevHashes?.get(commentsStoragePath(docId));

    if (!relChanged && !groupsChanged && !commentsChanged) return null;

    // Parse only the files that changed (or fall back to current project values)
    const meta = relChanged
      ? relationsFromRaw(JSON.parse(await relBlob!.text()))
      : project.relations;

    const groups: string[][] = groupsChanged
      ? (JSON.parse(await groupsBlob!.text()) as string[][])
      : (project.relations.groups ?? []);

    // Comments: merge server into local so unsaved local changes are not lost
    const remoteComments: RelationsFile['comments'] = commentsChanged
      ? (JSON.parse(await commentsBlob!.text()) as RelationsFile['comments'])
      : (project.relations.comments ?? []);
    const mergedComments = mergeCommentsFromServer(
      remoteComments ?? [],
      project.relations.comments ?? [],
    );

    const remoteUpdatedAt = await fetchRemoteDocumentUpdatedAt(docId);
    const nextHashes = new Map(prevHashes ?? []);
    if (relBlob && relHash) nextHashes.set(relationsStoragePath(docId), relHash);
    if (groupsBlob && groupsHash) nextHashes.set(groupsStoragePath(docId), groupsHash);
    if (commentsBlob && commentsHash) nextHashes.set(commentsStoragePath(docId), commentsHash);

    const rebuilt = rebuildProject({
      ...project,
      relations: normalizeRelations({ ...meta, groups, comments: mergedComments }),
    });

    return {
      ...rebuilt,
      remoteUpdatedAt,
      remoteSync: { fileHashes: nextHashes },
    };
  } catch {
    return null;
  }
}

/**
 * Detect which of the candidate upload paths have been modified on the server
 * since this session last saw them (by comparing server entry.updatedAt against
 * the locally-cached storageUpdatedAt). Returns conflicting paths and a
 * human-readable label for each (e.g. the page file name).
 */
async function detectPerFileConflicts(
  uploadPaths: string[],
  serverEntries: RemoteStorageEntry[],
): Promise<string[]> {
  if (uploadPaths.length === 0) return [];
  const serverUpdatedAt = new Map(serverEntries.map((e) => [e.path, e.updatedAt]));
  const conflicts: string[] = [];
  await mapWithConcurrency(
    uploadPaths,
    async (path) => {
      const serverAt = serverUpdatedAt.get(path);
      if (!serverAt) return; // file is new on our side — no conflict
      const cached = await getRemoteCachedFile(path);
      // If we have no cache record the file was never loaded — skip
      if (!cached) return;
      // If server timestamp differs from what we cached, someone else changed it
      if (cached.storageUpdatedAt !== serverAt) {
        conflicts.push(path);
      }
    },
    DEFAULT_CONCURRENCY,
  );
  return conflicts;
}

/** Turn a storage path like "docId/docs/intro.p" into a readable label. */
function conflictPathLabel(docId: string, path: string): string {
  const docsPrefix = `${docId}/docs/`;
  if (path.startsWith(docsPrefix)) return path.slice(docsPrefix.length);
  const rootPrefix = `${docId}/`;
  if (path.startsWith(rootPrefix)) return path.slice(rootPrefix.length);
  return path;
}

export async function saveRemoteDocument(
  docId: string,
  project: LoadedProject,
  title?: string,
  options?: SaveRemoteOptions,
): Promise<SaveRemoteResult> {
  const nextTitle = normalizeDocumentTitle(title ?? defaultRemoteTitle(project));
  const projectForSave = await mergeRemoteCommentsIntoProject(project, docId);
  const protection = resolveRemoteExportProtection(projectForSave, options);
  const prevHashes = project.remoteSync?.fileHashes;
  const nextPublishMode = resolveRemotePublishMode(project, options);
  const publishModeChanged = remotePublishModeChanged(project, options);
  const titleChanged =
    nextTitle !== normalizeDocumentTitle(project.remoteTitle ?? defaultRemoteTitle(project));
  const metadataPatch = (): RemoteDocumentRowPatch => ({
    title: nextTitle,
    ...(options?.publishMode !== undefined ? { publishMode: nextPublishMode } : {}),
  });

  if (protection?.mode === 'protect' && usesFullEncryptionStorage(nextPublishMode, true)) {
    const { lock, encrypted } = await buildEncryptedDocumentExport(
      projectForSave,
      protection.password,
      {
        readStatesByUsername: options?.readStatesByUsername,
        commentReadStatesByUsername: options?.commentReadStatesByUsername,
      },
    );
    const fileMap = new Map<string, Blob>([
      [lockStoragePath(docId), lockFileToBlob(lock)],
      [payloadStoragePath(docId), encryptedPayloadToBlob(encrypted)],
    ]);
    const nextHashes = await fingerprintFileMap(fileMap);
    const nextPaths = new Set(fileMap.keys());
    const removePaths = new Set<string>([
      ...listRemovedRemotePaths(prevHashes, nextPaths),
      legacyBundlePath(docId),
    ]);
    for (const path of prevHashes?.keys() ?? []) {
      if (path.startsWith(`${docId}/`) && !nextPaths.has(path)) {
        removePaths.add(path);
      }
    }

    await mapWithConcurrency(
      [...fileMap.keys()],
      async (path) => {
        const blob = fileMap.get(path);
        if (blob) await uploadStorageFile(path, blob);
      },
      DEFAULT_CONCURRENCY,
    );
    await refreshRemoteCacheAfterSave(docId, [...fileMap.keys()], fileMap, nextHashes);

    if (removePaths.size > 0) {
      await removeStoragePaths([...removePaths]);
      await deleteRemoteCachedPaths([...removePaths]);
    }

    await patchRemoteDocumentRow(docId, metadataPatch());
    await setRemotePasswordProtected(docId, true);

    const remoteUpdatedAt = await fetchRemoteDocumentUpdatedAt(docId);
    return {
      skippedUpload: false,
      remoteSync: { fileHashes: nextHashes },
      remoteUpdatedAt,
      mergedProject: {
        ...projectForSave,
        passwordProtected: true,
        remotePublishMode: nextPublishMode,
      },
    };
  }

  const fileMap = await buildRemoteFileMap(projectForSave, docId);
  if (protection?.mode === 'protect' && usesReadonlyPlaintextStorage(nextPublishMode, true)) {
    const { lock } = await createDocumentLock(protection.password);
    fileMap.set(lockStoragePath(docId), lockFileToBlob(lock));
    const payload = await buildDocumentPayload(projectForSave, {
      readStatesByUsername: options?.readStatesByUsername,
      commentReadStatesByUsername: options?.commentReadStatesByUsername,
    });
    const payloadBytes = serializeDocumentPayload(payload);
    fileMap.set(
      publicSnapshotStoragePath(docId),
      new Blob([new Uint8Array(payloadBytes)], { type: 'application/octet-stream' }),
    );
  }
  const nextHashes = await fingerprintFileMap(fileMap);
  const nextPaths = new Set(fileMap.keys());

  const uploadPaths: string[] = [];
  for (const [path] of fileMap) {
    const nextHash = nextHashes.get(path);
    if (!nextHash) continue;
    if (prevHashes?.get(path) !== nextHash) {
      uploadPaths.push(path);
    }
  }

  const removePaths = [
    ...listRemovedRemotePaths(prevHashes, nextPaths),
    legacyBundlePath(docId),
  ];
  if (protection?.mode === 'remove') {
    removePaths.push(
      lockStoragePath(docId),
      payloadStoragePath(docId),
      publicSnapshotStoragePath(docId),
    );
  } else if (!project.passwordProtected && protection?.mode !== 'protect') {
    removePaths.push(
      lockStoragePath(docId),
      payloadStoragePath(docId),
      publicSnapshotStoragePath(docId),
    );
  } else if (protection?.mode === 'protect' && usesReadonlyPlaintextStorage(nextPublishMode, true)) {
    removePaths.push(payloadStoragePath(docId));
  }

  const skippedUpload = uploadPaths.length === 0 && removePaths.length === 0;

  // Per-file conflict detection: fetch current server entries and check which
  // files we're about to overwrite have been changed by someone else since we
  // last loaded them.
  let conflictPaths: string[] | undefined;
  if (uploadPaths.length > 0) {
    const serverEntries = await listRemoteDocEntries(docId);
    const rawConflicts = await detectPerFileConflicts(uploadPaths, serverEntries);
    if (rawConflicts.length > 0) {
      conflictPaths = rawConflicts.map((p) => conflictPathLabel(docId, p));
    }
  }

  if (uploadPaths.length > 0) {
    await mapWithConcurrency(
      uploadPaths,
      async (path) => {
        const blob = fileMap.get(path);
        if (blob) await uploadStorageFile(path, blob);
      },
      DEFAULT_CONCURRENCY,
    );
    await refreshRemoteCacheAfterSave(docId, uploadPaths, fileMap, nextHashes);
  }

  if (removePaths.length > 0) {
    await removeStoragePaths(removePaths);
    await deleteRemoteCachedPaths(removePaths);
  }

  if (titleChanged || publishModeChanged || !skippedUpload) {
    await patchRemoteDocumentRow(docId, metadataPatch());
  }

  if (protection?.mode === 'remove') {
    await setRemotePasswordProtected(docId, false);
  } else if (protection?.mode === 'protect') {
    await setRemotePasswordProtected(docId, true);
  }

  const remoteUpdatedAt = await fetchRemoteDocumentUpdatedAt(docId);
  const mergedBase =
    protection?.mode === 'remove'
      ? { ...projectForSave, passwordProtected: false }
      : protection?.mode === 'protect'
        ? { ...projectForSave, passwordProtected: true }
        : projectForSave;

  return {
    skippedUpload,
    remoteSync: {
      fileHashes: nextHashes,
    },
    remoteUpdatedAt,
    mergedProject: {
      ...mergedBase,
      remotePublishMode: nextPublishMode,
    },
    conflictPaths,
  };
}

export async function createRemoteDocument(
  project: LoadedProject,
  title: string,
  options?: SaveRemoteOptions,
): Promise<{ docId: string; remoteSync: RemoteSyncState; remoteUpdatedAt: string | null }> {
  const supabase = getSupabaseClient();
  const nextTitle = normalizeDocumentTitle(title);
  if (!nextTitle) throw new Error('Document title is required');

  const docId = resolveNewDocumentId(options?.docId);
  const publishMode = options?.publishMode ?? DEFAULT_PUBLISH_MODE;

  const { data, error } = await supabase
    .from('documents')
    .insert({
      id: docId,
      title: nextTitle,
      password_protected: options?.protection?.mode === 'protect',
      publish_mode: publishMode,
    })
    .select('id')
    .single();

  if (error || !data?.id) {
    if (error && isDuplicateDocumentIdError(error.message)) {
      throw new Error('This link ID is already taken. Choose a different ID.');
    }
    if (
      error?.message.includes('password_protected') ||
      error?.message.includes('publish_mode') ||
      error?.message.includes('is_published')
    ) {
      const legacyPublished = publishMode === 'public';
      const fallbackInsert = await supabase
        .from('documents')
        .insert({
          id: docId,
          title: nextTitle,
          ...(error?.message.includes('publish_mode')
            ? { is_published: legacyPublished }
            : {}),
        })
        .select('id')
        .single();
      if (fallbackInsert.error || !fallbackInsert.data?.id) {
        const minimal = await supabase
          .from('documents')
          .insert({ id: docId, title: nextTitle })
          .select('id')
          .single();
        if (minimal.error || !minimal.data?.id) {
          if (minimal.error && isDuplicateDocumentIdError(minimal.error.message)) {
            throw new Error('This link ID is already taken. Choose a different ID.');
          }
          throw new Error(minimal.error?.message ?? fallbackInsert.error?.message ?? 'Could not create document');
        }
        const saveResult = await saveRemoteDocument(minimal.data.id, project, nextTitle, options);
        return {
          docId: minimal.data.id,
          remoteSync: saveResult.remoteSync,
          remoteUpdatedAt: saveResult.remoteUpdatedAt,
        };
      }
      const saveResult = await saveRemoteDocument(
        fallbackInsert.data.id,
        project,
        nextTitle,
        options,
      );
      return {
        docId: fallbackInsert.data.id,
        remoteSync: saveResult.remoteSync,
        remoteUpdatedAt: saveResult.remoteUpdatedAt,
      };
    }
    throw new Error(error?.message ?? 'Could not create document');
  }

  const saveResult = await saveRemoteDocument(data.id, project, nextTitle, options);
  return {
    docId: data.id,
    remoteSync: saveResult.remoteSync,
    remoteUpdatedAt: saveResult.remoteUpdatedAt,
  };
}

export async function deleteRemoteDocument(docId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const paths = (await listRemoteDocEntries(docId)).map((entry) => entry.path);
  if (!paths.includes(legacyBundlePath(docId))) {
    paths.push(legacyBundlePath(docId));
  }
  await removeStoragePaths(paths);
  await clearRemoteDocCache(docId);
  const { error } = await supabase.from('documents').delete().eq('id', docId);
  if (error) throw new Error(error.message);
}
