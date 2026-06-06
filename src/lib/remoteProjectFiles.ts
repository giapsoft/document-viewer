import type { LoadedProject } from '../types';
import { normalizeRelations } from './groupRelations';
import { mdSidecarFileName } from './mdFiles';
import { fingerprintBlob } from './fileFingerprint';
import {
  collectReferencedImageNames,
  collectReferencedMdFiles,
  docsStoragePath,
  projectToRawInput,
  relationsStoragePath,
} from './projectBundle';

/** Build storage path → blob map for a remote document. */
export async function buildRemoteFileMap(
  project: LoadedProject,
  docId: string,
): Promise<Map<string, Blob>> {
  const raw = projectToRawInput(project);
  const map = new Map<string, Blob>();

  map.set(
    relationsStoragePath(docId),
    new Blob([`${JSON.stringify(normalizeRelations(raw.relations), null, 2)}\n`], {
      type: 'application/json',
    }),
  );

  for (const page of raw.pageFiles) {
    map.set(
      docsStoragePath(docId, page.name),
      new Blob([`${JSON.stringify(page.content, null, 2)}\n`], { type: 'application/json' }),
    );
  }

  for (const [componentId, content] of collectReferencedMdFiles(project).entries()) {
    map.set(docsStoragePath(docId, mdSidecarFileName(componentId)), new Blob([content], { type: 'text/plain' }));
  }

  for (const name of collectReferencedImageNames(project)) {
    const blob = project.imageBlobs.get(name);
    if (blob) {
      map.set(docsStoragePath(docId, name), blob);
    }
  }

  return map;
}

export async function fingerprintFileMap(
  files: Map<string, Blob>,
): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  for (const [path, blob] of files) {
    hashes.set(path, await fingerprintBlob(blob));
  }
  return hashes;
}

export function listRemovedRemotePaths(
  previousHashes: Map<string, string> | undefined,
  nextPaths: Set<string>,
): string[] {
  if (!previousHashes) return [];
  return [...previousHashes.keys()].filter((path) => !nextPaths.has(path));
}
