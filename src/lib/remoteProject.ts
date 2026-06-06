import type { LoadedProject, RelationsFile, RemoteSyncState } from '../types';
import { componentIdFromMdFileName, MD_FILE_EXT } from './mdFiles';
import { getSupabaseClient } from './supabaseClient';
import { mapWithConcurrency, runWithConcurrency, DEFAULT_CONCURRENCY } from './concurrency';
import { fingerprintBlob } from './fileFingerprint';
import {
  assembleLoadedProject,
  BUNDLE_FILE_NAME,
  bundleStoragePath,
  defaultRemoteTitle,
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
import { normalizeRelations } from './groupRelations';
import { rebuildProject } from './projectMutations';

export type { RemoteDocumentMeta };

export type SaveRemoteResult = {
  remoteSync: RemoteSyncState;
  skippedUpload: boolean;
  remoteUpdatedAt: string | null;
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
  const blob = await downloadStorageFile(relationsStoragePath(docId));
  return relationsFromRaw(JSON.parse(await blob.text()));
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
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(path);
  if (error || !data) {
    throw new Error(error?.message ?? `Could not download ${path}`);
  }
  return data;
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
  let relations: RelationsFile = { groups: [] };
  const pageFiles: { name: string; content: unknown }[] = [];
  const imageFiles: { name: string; blob: Blob }[] = [];
  const mdFiles: { componentId: string; content: string }[] = [];

  for (const path of paths) {
    const blob = fileBlobs.get(path);
    if (!blob) continue;

    if (isRelationsPath(path, docId)) {
      relations = relationsFromRaw(JSON.parse(await blob.text()));
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

  if (pageFiles.length === 0) {
    throw new Error('Remote document has no pages');
  }

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

async function loadRemoteDocumentFromFiles(
  meta: { id: string; title: string; updated_at?: string | null },
  paths: string[],
  fileBlobs: Map<string, Blob>,
): Promise<LoadedProject> {
  const docId = meta.id;
  const parsed = await parseRemoteFileBlobs(docId, paths, fileBlobs);
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
      throw new Error('Remote document has no saved files');
    }
    const fileBlobs = await downloadRemotePaths(docPaths);
    return loadRemoteDocumentFromFiles(meta, docPaths, fileBlobs);
  }
}

/** Pull latest relations.json into an open project (when not dirty). */
export async function syncRemoteRelations(
  project: LoadedProject,
): Promise<LoadedProject | null> {
  const docId = project.remoteDocId;
  if (!docId) return null;

  const relations = await fetchRemoteRelations(docId);
  const relationsPath = relationsStoragePath(docId);
  const relationsBlob = new Blob([`${JSON.stringify(normalizeRelations(relations), null, 2)}\n`], {
    type: 'application/json',
  });
  const relationsHash = await fingerprintBlob(relationsBlob);
  const prevHash = project.remoteSync?.fileHashes?.get(relationsPath);
  if (prevHash === relationsHash) return null;

  const remoteUpdatedAt = await fetchRemoteDocumentUpdatedAt(docId);
  const nextHashes = new Map(project.remoteSync?.fileHashes ?? []);
  nextHashes.set(relationsPath, relationsHash);

  const merged = rebuildProject({
    ...project,
    relations: normalizeRelations(relations),
  });

  return {
    ...merged,
    remoteUpdatedAt,
    remoteSync: {
      format: 'files',
      fileHashes: nextHashes,
      bundleHash: null,
    },
  };
}

export async function saveRemoteDocument(
  docId: string,
  project: LoadedProject,
  title?: string,
): Promise<SaveRemoteResult> {
  const supabase = getSupabaseClient();
  const nextTitle = normalizeDocumentTitle(title ?? defaultRemoteTitle(project));
  const fileMap = await buildRemoteFileMap(project, docId);
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
