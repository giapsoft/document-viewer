import type { LoadedProject } from '../types';
import type { CommentReadState } from './commentReadState';
import type { ComponentReadState } from './readState';
import { normalizeRelations } from './groupRelations';
import { mdSidecarFileName } from './mdFiles';
import { type RawProjectInput } from './loadProject';
import { encryptDocumentWithPassword, decryptDocumentWithPassword } from './documentPassword';
import {
  collectReferencedImageNames,
  projectToRawInput,
} from './projectBundle';

const PAGE_EXT = /\.p$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif)$/i;

export type DocumentPayloadFile = {
  path: string;
  kind: 'text' | 'binary';
  content: string;
};

export type DocumentPayload = {
  version: 1;
  files: DocumentPayloadFile[];
};

export type BuildDocumentPayloadOptions = {
  readStatesByUsername?: Record<string, ComponentReadState>;
  commentReadStatesByUsername?: Record<string, CommentReadState>;
};

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBlob(base64: string, type: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type });
}

export async function buildDocumentPayload(
  project: LoadedProject,
  options: BuildDocumentPayloadOptions = {},
): Promise<DocumentPayload> {
  const raw = projectToRawInput(project);
  const { groups, comments, ...relationsMeta } = normalizeRelations(raw.relations);
  const files: DocumentPayloadFile[] = [
    {
      path: 'relations.json',
      kind: 'text',
      content: `${JSON.stringify(relationsMeta, null, 2)}\n`,
    },
    {
      path: 'groups.json',
      kind: 'text',
      content: `${JSON.stringify(groups ?? [], null, 2)}\n`,
    },
    {
      path: 'comments.json',
      kind: 'text',
      content: `${JSON.stringify(comments ?? [], null, 2)}\n`,
    },
  ];

  for (const page of raw.pageFiles) {
    files.push({
      path: `docs/${page.name}`,
      kind: 'text',
      content: `${JSON.stringify(page.content, null, 2)}\n`,
    });
  }

  for (const { componentId, content } of raw.mdFiles ?? []) {
    files.push({
      path: `docs/${mdSidecarFileName(componentId)}`,
      kind: 'text',
      content,
    });
  }

  for (const name of collectReferencedImageNames(project)) {
    const blob = project.imageBlobs.get(name);
    if (!blob) continue;
    files.push({
      path: `docs/${name}`,
      kind: 'binary',
      content: await blobToBase64(blob),
    });
  }

  for (const [username, readState] of Object.entries(options.readStatesByUsername ?? {})) {
    files.push({
      path: `${username}.reads.json`,
      kind: 'text',
      content: `${JSON.stringify(readState, null, 2)}\n`,
    });
  }

  for (const [username, readState] of Object.entries(options.commentReadStatesByUsername ?? {})) {
    files.push({
      path: `${username}.comment-reads.json`,
      kind: 'text',
      content: `${JSON.stringify(readState, null, 2)}\n`,
    });
  }

  return { version: 1, files };
}

export function serializeDocumentPayload(payload: DocumentPayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function parseDocumentPayload(bytes: Uint8Array): DocumentPayload {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as DocumentPayload;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.files)) {
    throw new Error('Document payload is invalid.');
  }
  return parsed;
}

export function payloadToRawProjectInput(payload: DocumentPayload): RawProjectInput {
  const pageFiles: { name: string; content: unknown }[] = [];
  const imageFiles: { name: string; blob: Blob }[] = [];
  const mdFiles: { componentId: string; content: string }[] = [];

  let relationsMeta: Record<string, unknown> = {};
  let groups: string[][] = [];
  let comments: import('../types').RelationsFile['comments'] = [];

  for (const file of payload.files) {
    if (file.path === 'relations.json') {
      relationsMeta = JSON.parse(file.content) as Record<string, unknown>;
      continue;
    }
    if (file.path === 'groups.json') {
      groups = JSON.parse(file.content) as string[][];
      continue;
    }
    if (file.path === 'comments.json') {
      comments = JSON.parse(file.content) as import('../types').RelationsFile['comments'];
      continue;
    }
    if (!file.path.startsWith('docs/')) continue;

    const name = file.path.slice('docs/'.length);
    if (PAGE_EXT.test(name)) {
      pageFiles.push({ name, content: JSON.parse(file.content) });
    } else if (IMAGE_EXT.test(name)) {
      imageFiles.push({
        name,
        blob: base64ToBlob(file.content, 'application/octet-stream'),
      });
    } else if (/\.md$/i.test(name)) {
      const componentId = name.replace(/\.md$/i, '');
      mdFiles.push({ componentId, content: file.content });
    }
  }

  return {
    pageFiles,
    relations: normalizeRelations({
      ...(relationsMeta as unknown as import('../types').RelationsFile),
      groups,
      comments,
    }),
    stylesPartial: null,
    imageFiles,
    mdFiles,
  };
}

export async function buildEncryptedDocumentExport(
  project: LoadedProject,
  password: string,
  options: BuildDocumentPayloadOptions = {},
): Promise<{ lock: import('./documentPassword').DocumentLockFile; encrypted: Uint8Array }> {
  const payload = await buildDocumentPayload(project, options);
  const bytes = serializeDocumentPayload(payload);
  return encryptDocumentWithPassword(password, bytes);
}

export async function decryptDocumentPayloadToRawInput(
  password: string,
  lock: import('./documentPassword').DocumentLockFile,
  encrypted: Uint8Array,
): Promise<RawProjectInput> {
  const bytes = await decryptDocumentWithPassword(password, lock, encrypted);
  return payloadToRawProjectInput(parseDocumentPayload(bytes));
}
