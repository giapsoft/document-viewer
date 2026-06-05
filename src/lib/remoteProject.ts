import type { LoadedProject, RemoteSyncState } from '../types';
import { componentIdFromMdFileName, MD_FILE_EXT } from './mdFiles';
import { getSupabaseClient } from './supabaseClient';
import { mapWithConcurrency, runWithConcurrency, DEFAULT_CONCURRENCY } from './concurrency';
import { fingerprintBlob } from './fileFingerprint';
import {
  assembleLoadedProject,
  BUNDLE_FILE_NAME,
  bundleStoragePath,
  createBundleSyncState,
  defaultRemoteTitle,
  isImageFileName,
  isPageFileName,
  isRelationsPath,
  normalizeDocumentTitle,
  packProjectBundle,
  parseStorageFileName,
  relationsFromRaw,
  STORAGE_BUCKET,
  unpackProjectBundle,
  type RemoteDocumentMeta,
} from './projectBundle';
import type { RelationsFile } from '../types';

export type { RemoteDocumentMeta };

export type SaveRemoteResult = {
  remoteSync: RemoteSyncState;
  skippedUpload: boolean;
};

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

async function loadRemoteDocumentFromBundle(
  meta: { id: string; title: string },
  bundle: Blob,
): Promise<LoadedProject> {
  const input = await unpackProjectBundle(bundle);
  const remoteSync = await createBundleSyncState(bundle);
  return assembleLoadedProject(input, {
    source: 'remote',
    remoteDocId: meta.id,
    remoteTitle: meta.title,
    folderHandle: null,
    remoteSync,
  });
}

async function loadRemoteDocumentLegacy(
  docId: string,
  meta: { id: string; title: string },
  paths: string[],
): Promise<LoadedProject> {
  const fileBlobs = new Map<string, Blob>();
  await mapWithConcurrency(
    paths,
    async (path) => {
      fileBlobs.set(path, await downloadStorageFile(path));
    },
    DEFAULT_CONCURRENCY,
  );

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

  const fileHashes = new Map<string, string>();
  const hashEntries = await mapWithConcurrency(
    [...fileBlobs.entries()],
    async ([path, blob]) => [path, await fingerprintBlob(blob)] as const,
    DEFAULT_CONCURRENCY,
  );
  for (const [path, hash] of hashEntries) {
    fileHashes.set(path, hash);
  }

  return assembleLoadedProject(
    { pageFiles, relations, stylesPartial: null, imageFiles, mdFiles },
    {
      source: 'remote',
      remoteDocId: meta.id,
      remoteTitle: meta.title,
      folderHandle: null,
      remoteSync: { format: 'legacy', fileHashes, bundleHash: null },
    },
  );
}

export async function loadRemoteDocument(docId: string): Promise<LoadedProject> {
  const supabase = getSupabaseClient();
  const { data: meta, error: metaError } = await supabase
    .from('documents')
    .select('id, title, updated_at')
    .eq('id', docId)
    .maybeSingle();

  if (metaError) throw new Error(metaError.message);
  if (!meta) throw new Error('Document not found');

  const bundlePath = bundleStoragePath(docId);
  try {
    const bundle = await downloadStorageFile(bundlePath);
    return loadRemoteDocumentFromBundle(meta, bundle);
  } catch {
    // Fall back to legacy multi-file layout.
  }

  const paths = (await listAllStoragePaths(docId)).filter(
    (path) => path !== bundlePath && !path.endsWith(`/${BUNDLE_FILE_NAME}`),
  );
  if (paths.length === 0) {
    throw new Error('Remote document has no saved files');
  }

  return loadRemoteDocumentLegacy(docId, meta, paths);
}

export async function saveRemoteDocument(
  docId: string,
  project: LoadedProject,
  title?: string,
): Promise<SaveRemoteResult> {
  const supabase = getSupabaseClient();
  const nextTitle = normalizeDocumentTitle(title ?? defaultRemoteTitle(project));
  const bundle = await packProjectBundle(project);
  const bundleHash = await fingerprintBlob(bundle);
  const bundlePath = bundleStoragePath(docId);
  const previousHash = project.remoteSync?.bundleHash;
  const titleChanged =
    nextTitle !== normalizeDocumentTitle(project.remoteTitle ?? defaultRemoteTitle(project));
  const skippedUpload = previousHash === bundleHash;

  if (!skippedUpload) {
    await uploadStorageFile(bundlePath, bundle);
    const existingPaths = await listAllStoragePaths(docId);
    const legacyPaths = existingPaths.filter((path) => path !== bundlePath);
    await removeStoragePaths(legacyPaths);
  }

  if (titleChanged || !skippedUpload) {
    const { error } = await supabase.from('documents').update({ title: nextTitle }).eq('id', docId);
    if (error) throw new Error(error.message);
  }

  return {
    skippedUpload,
    remoteSync: {
      format: 'bundle',
      bundleHash,
    },
  };
}

export async function createRemoteDocument(
  project: LoadedProject,
  title: string,
): Promise<{ docId: string; remoteSync: RemoteSyncState }> {
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
  return { docId: data.id, remoteSync: saveResult.remoteSync };
}
