import type { LoadedProject } from '../types';
import { normalizeRelations } from './groupRelations';
import { mdSidecarFileName } from './mdFiles';
import { fingerprintBlob } from './fileFingerprint';
import {
  collectReferencedImageNames,
  collectReferencedMdFiles,
  commentsStoragePath,
  docsStoragePath,
  groupsStoragePath,
  projectToRawInput,
  relationsStoragePath,
} from './projectBundle';

function jsonBlob(value: unknown): Blob {
  return new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' });
}

/** Build storage path → blob map for a remote document. */
export async function buildRemoteFileMap(
  project: LoadedProject,
  docId: string,
): Promise<Map<string, Blob>> {
  const raw = projectToRawInput(project);
  const { groups, comments, ...relationsMeta } = normalizeRelations(raw.relations);
  const map = new Map<string, Blob>();

  // Three separate files instead of one monolithic relations.json
  map.set(relationsStoragePath(docId), jsonBlob(relationsMeta));
  map.set(groupsStoragePath(docId), jsonBlob(groups ?? []));
  map.set(commentsStoragePath(docId), jsonBlob(comments ?? []));

  for (const page of raw.pageFiles) {
    map.set(docsStoragePath(docId, page.name), jsonBlob(page.content));
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
