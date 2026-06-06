import type { LoadedProject, RelationsFile, RemoteSyncState } from '../types';
import { componentIdFromMdFileName, MD_FILE_EXT } from './mdFiles';
import { getSupabaseClient } from './supabaseClient';
import { mapWithConcurrency, runWithConcurrency, DEFAULT_CONCURRENCY } from './concurrency';
import { fingerprintBlob } from './fileFingerprint';
import {
  assembleLoadedProject,
  BUNDLE_FILE_NAME,
  bundleStoragePath,
  commentsStoragePath,
  defaultRemoteTitle,
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
  unpackProjectBundle,
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

export type { RemoteDocumentMeta };

/** Apply a comment-only pull onto the latest in-memory project (avoids stale snapshot races). */
export function applyRemoteCommentSync(
  latest: LoadedProject,
  synced: LoadedProject,
): LoadedProject {
  const syncedComments = synced.relations.comments ?? [];
  const latestComments = latest.relations.comments ?? [];
  const commentsChanged = !commentsEqual(latestComments, syncedComments);

  return {
    ...latest,
    relations: {
      ...latest.relations,
      comments: commentsChanged ? syncedComments : latestComments,
    },
    remoteSync: synced.remoteSync ?? latest.remoteSync,
    remoteUpdatedAt:
      pickNewerRemoteUpdatedAt(latest.remoteUpdatedAt, synced.remoteUpdatedAt) ??
      latest.remoteUpdatedAt,
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
  /** Reserved for future per-file conditional fetch. */
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

export async function fetchRemoteRelations(docId: string): Promise<RelationsFile> {
  try {
    // Fetch all three relation files in parallel — fall back gracefully when absent
    const [relBlob, groupsBlob, commentsBlob] = await Promise.all([
      downloadStorageFile(relationsStoragePath(docId)),
      downloadStorageFile(groupsStoragePath(docId)).catch(() => null),
      downloadStorageFile(commentsStoragePath(docId)).catch(() => null),
    ]);

    const meta = relationsFromRaw(JSON.parse(await relBlob.text()));

    // New format: groups and comments are in separate files
    // Old format: groups and comments are embedded in relations.json (backward compat)
    const groups: string[][] = groupsBlob
      ? (JSON.parse(await groupsBlob.text()) as string[][])
      : ((meta as RelationsFile).groups ?? []);

    const comments = commentsBlob
      ? (JSON.parse(await commentsBlob.text()) as RelationsFile['comments'])
      : ((meta as RelationsFile).comments ?? []);

    return normalizeRelations({ ...meta, groups, comments });
  } catch {
    const bundle = await downloadStorageFile(bundleStoragePath(docId));
    const input = await unpackProjectBundle(bundle);
    return normalizeRelations(input.relations);
  }
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

async function listAllStoragePaths(docId: string): Promise<string[]> {
  const supabase = getSupabaseClient();
  const paths: string[] = [];

  const listFolder = async (folder: string) => {
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).list(folder, {
      limit: 1000,
    });
    if (error) throw new Error(error.message);
    for (const entry of data ?? []) {
      const path = folder ? `${folder}/${entry.name}` : entry.name;
      if (entry.id === null) {
        await listFolder(path);
      } else {
        paths.push(path);
      }
    }
  };

  await listFolder(docId);
  return paths;
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

function filterDocumentPaths(docId: string, paths: string[]): string[] {
  return paths.filter(
    (path) => path !== bundleStoragePath(docId) && !path.endsWith(`/${BUNDLE_FILE_NAME}`),
  );
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

async function hashFileBlobs(fileBlobs: Map<string, Blob>): Promise<Map<string, string>> {
  const fileHashes = new Map<string, string>();
  const hashEntries = await mapWithConcurrency(
    [...fileBlobs.entries()],
    async ([path, blob]) => [path, await fingerprintBlob(blob)] as const,
    DEFAULT_CONCURRENCY,
  );
  for (const [path, hash] of hashEntries) {
    fileHashes.set(path, hash);
  }
  return fileHashes;
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
      remoteSync: { format: 'files', fileHashes: new Map(), bundleHash: null },
      remoteUpdatedAt: meta.updated_at ?? null,
    },
  );
}

async function loadRemoteDocumentFromFiles(
  meta: { id: string; title: string; updated_at?: string | null },
  paths: string[],
  fileBlobs: Map<string, Blob>,
): Promise<LoadedProject> {
  const docId = meta.id;
  const parsed = await parseRemoteFileBlobs(docId, paths, fileBlobs);
  if (parsed.pageFiles.length === 0) {
    return createStarterRemoteProject(meta, parsed.relations);
  }
  const fileHashes = await hashFileBlobs(fileBlobs);

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
      remoteSync: { format: 'files', fileHashes, bundleHash: null },
      remoteUpdatedAt: meta.updated_at ?? null,
    },
  );
}

async function downloadRemotePaths(paths: string[]): Promise<Map<string, Blob>> {
  const fileBlobs = new Map<string, Blob>();
  await mapWithConcurrency(
    paths,
    async (path) => {
      fileBlobs.set(path, await downloadStorageFile(path));
    },
    DEFAULT_CONCURRENCY,
  );
  return fileBlobs;
}

async function loadRemoteDocumentFromBundle(
  meta: { id: string; title: string; updated_at?: string | null },
  bundle: Blob,
): Promise<LoadedProject> {
  const input = await unpackProjectBundle(bundle);
  const bundleHash = await fingerprintBlob(bundle);
  return assembleLoadedProject(input, {
    source: 'remote',
    remoteDocId: meta.id,
    remoteTitle: meta.title,
    folderHandle: null,
    remoteSync: { format: 'bundle', bundleHash, fileHashes: undefined },
    remoteUpdatedAt: meta.updated_at ?? null,
  });
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

  const allPaths = await listAllStoragePaths(docId);
  const docPaths = filterDocumentPaths(docId, allPaths);
  const hasMultiFile = docPaths.some((path) => isRelationsPath(path, docId));

  if (hasMultiFile) {
    const fileBlobs = await downloadRemotePaths(docPaths);
    return loadRemoteDocumentFromFiles(meta, docPaths, fileBlobs);
  }

  const bundlePath = bundleStoragePath(docId);
  try {
    const bundle = await downloadStorageFile(bundlePath);
    return loadRemoteDocumentFromBundle(meta, bundle);
  } catch {
    if (docPaths.length === 0) {
      return createStarterRemoteProject(meta);
    }
    const fileBlobs = await downloadRemotePaths(docPaths);
    return loadRemoteDocumentFromFiles(meta, docPaths, fileBlobs);
  }
}

async function mergeRemoteCommentsIntoProject(
  project: LoadedProject,
  docId: string,
): Promise<LoadedProject> {
  const remoteRelations = await fetchRemoteRelations(docId);
  const localComments = project.relations.comments ?? [];
  const mergedComments = mergeCommentsFromServer(
    remoteRelations.comments ?? [],
    localComments,
  );
  if (commentsEqual(localComments, mergedComments)) {
    return project;
  }
  return rebuildProject({
    ...project,
    relations: { ...project.relations, comments: mergedComments },
  });
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
      remoteSync: project.remoteSync ?? { format: 'files', fileHashes: new Map() },
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
      format: 'files',
      fileHashes: nextHashes,
      bundleHash: null,
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
    // Fetch only comments.json; fall back to full relations if it doesn't exist yet
    let remoteComments: RelationsFile['comments'];
    let commentsHash: string;
    try {
      const blob = await downloadStorageFile(commentsStoragePath(docId));
      remoteComments = JSON.parse(await blob.text()) as RelationsFile['comments'];
      commentsHash = await fingerprintBlob(blob);
    } catch {
      // comments.json not yet created — fetch full relations (old format)
      const remoteRelations = await fetchRemoteRelations(docId);
      remoteComments = remoteRelations.comments ?? [];
      const blob = jsonBlob(remoteComments);
      commentsHash = await fingerprintBlob(blob);
    }

    const commentsPath = commentsStoragePath(docId);
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
          ...(project.remoteSync ?? { format: 'files' as const }),
          format: 'files' as const,
          fileHashes: nextHashes,
          bundleHash: null,
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

    const merged = rebuildProject({
      ...project,
      relations: { ...project.relations, comments: mergedComments },
    });

    return {
      ...merged,
      remoteUpdatedAt,
      remoteSync: {
        ...(project.remoteSync ?? { format: 'files' as const }),
        format: 'files' as const,
        fileHashes: nextHashes,
        bundleHash: null,
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

    // Fetch all three relation files in parallel
    const [relBlob, groupsBlob, commentsBlob] = await Promise.all([
      downloadStorageFile(relationsStoragePath(docId)).catch(() => null),
      downloadStorageFile(groupsStoragePath(docId)).catch(() => null),
      downloadStorageFile(commentsStoragePath(docId)).catch(() => null),
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
      remoteSync: { format: 'files', fileHashes: nextHashes, bundleHash: null },
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
    ...(await listAllStoragePaths(docId)).filter(
      (path) => path === bundleStoragePath(docId) || path.endsWith(`/${BUNDLE_FILE_NAME}`),
    ),
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
  }

  if (removePaths.length > 0) {
    await removeStoragePaths(removePaths);
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
      format: 'files',
      fileHashes: nextHashes,
      bundleHash: null,
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
  const paths = await listAllStoragePaths(docId);
  await removeStoragePaths(paths);
  const { error } = await supabase.from('documents').delete().eq('id', docId);
  if (error) throw new Error(error.message);
}
