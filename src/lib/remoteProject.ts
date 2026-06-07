import type { LoadedProject, RelationsFile, RemoteSyncState } from '../types';
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
  clearRemoteDocCache,
  deleteRemoteCachedPaths,
  getRemoteCachedFile,
  putRemoteCachedFile,
} from './remoteFileCache';

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
};

export type LoadRemoteOptions = {
  /** @deprecated Cache is handled automatically via IndexedDB. */
  cached?: LoadedProject;
};

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

export async function listRemoteDocuments(): Promise<RemoteDocumentMeta[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, updated_at')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as RemoteDocumentMeta[];
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

function beginRemoteTextLoad(): void {
  remoteTextLoadDone = new Promise((resolve) => {
    finishRemoteTextLoad = resolve;
  });
}

function endRemoteTextLoad(): void {
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
  if (error) throw new Error(error.message);
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
  meta: { id: string; title: string; updated_at?: string | null },
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
    },
  );
}

async function loadRemoteDocumentFromFiles(
  meta: { id: string; title: string; updated_at?: string | null },
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
  meta: { id: string; title: string; updated_at?: string | null },
  entries: RemoteStorageEntry[],
): Promise<DeferredRemoteLoad> {
  const docId = meta.id;
  beginRemoteTextLoad();
  try {
    return await loadRemoteDocumentFromFilesDeferredInner(meta, entries, docId);
  } finally {
    endRemoteTextLoad();
  }
}

async function loadRemoteDocumentFromFilesDeferredInner(
  meta: { id: string; title: string; updated_at?: string | null },
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

/** Load remote doc: open after text; call `startImages` once project is in state. */
export async function loadRemoteDocumentDeferred(docId: string): Promise<DeferredRemoteLoad> {
  const supabase = getSupabaseClient();
  const { data: meta, error: metaError } = await supabase
    .from('documents')
    .select('id, title, updated_at')
    .eq('id', docId)
    .maybeSingle();

  if (metaError) throw new Error(metaError.message);
  if (!meta) throw new Error('Document not found');

  const entries = await listRemoteDocEntries(docId);
  if (entries.length === 0) {
    return emptyDeferredLoad(createStarterRemoteProject(meta));
  }

  return loadRemoteDocumentFromFilesDeferred(meta, entries);
}

export async function loadRemoteDocument(
  docId: string,
  _options?: LoadRemoteOptions,
): Promise<LoadedProject> {
  const supabase = getSupabaseClient();
  const { data: meta, error: metaError } = await supabase
    .from('documents')
    .select('id, title, updated_at')
    .eq('id', docId)
    .maybeSingle();

  if (metaError) throw new Error(metaError.message);
  if (!meta) throw new Error('Document not found');

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

export async function saveRemoteDocument(
  docId: string,
  project: LoadedProject,
  title?: string,
): Promise<SaveRemoteResult> {
  const supabase = getSupabaseClient();
  const nextTitle = normalizeDocumentTitle(title ?? defaultRemoteTitle(project));
  const projectForSave = await mergeRemoteCommentsIntoProject(project, docId);
  const fileMap = await buildRemoteFileMap(projectForSave, docId);
  const nextHashes = await fingerprintFileMap(fileMap);
  const prevHashes = project.remoteSync?.fileHashes;
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

  const skippedUpload = uploadPaths.length === 0 && removePaths.length === 0;

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

  const titleChanged =
    nextTitle !== normalizeDocumentTitle(project.remoteTitle ?? defaultRemoteTitle(project));

  if (titleChanged || !skippedUpload) {
    const { error } = await supabase.from('documents').update({ title: nextTitle }).eq('id', docId);
    if (error) throw new Error(error.message);
  }

  const remoteUpdatedAt = await fetchRemoteDocumentUpdatedAt(docId);

  return {
    skippedUpload,
    remoteSync: {
      fileHashes: nextHashes,
    },
    remoteUpdatedAt,
    mergedProject: projectForSave,
  };
}

export async function createRemoteDocument(
  project: LoadedProject,
  title: string,
): Promise<{ docId: string; remoteSync: RemoteSyncState; remoteUpdatedAt: string | null }> {
  const supabase = getSupabaseClient();
  const nextTitle = normalizeDocumentTitle(title);
  if (!nextTitle) throw new Error('Document title is required');

  const { data, error } = await supabase
    .from('documents')
    .insert({ title: nextTitle })
    .select('id')
    .single();

  if (error || !data?.id) {
    throw new Error(error?.message ?? 'Could not create document');
  }

  const saveResult = await saveRemoteDocument(data.id, project, nextTitle);
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
