import type { LoadedProject } from '../types';
import { ensureDocsDirectory } from './docsFolder';

const IMAGE_EXT = /\.(jpg|jpeg|png|gif)$/i;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
};

export function canImportImages(project: LoadedProject): boolean {
  return Boolean(project.folderHandle);
}

export function canReadClipboardImages(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function';
}

export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/gif,.jpg,.jpeg,.png,.gif';

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      resolve(file);
    };

    const onFocus = () => {
      window.setTimeout(() => finish(input.files?.[0] ?? null), 300);
    };

    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    window.addEventListener('focus', onFocus);
    input.click();
  });
}

function sanitizeBasename(name: string): string {
  const base = name.replace(/^.*[/\\]/, '').trim();
  if (!base) return 'image';
  return base.replace(/[<>:"|?*\x00-\x1f]/g, '_');
}

function extensionFromMime(mime: string): string | null {
  return MIME_TO_EXT[mime] ?? null;
}

function extensionFromFile(file: File): string | null {
  const match = file.name.match(/\.(jpe?g|png|gif)$/i);
  if (match) return match[1].toLowerCase().replace('jpeg', 'jpg');
  return MIME_TO_EXT[file.type] ?? null;
}

export function resolveUniqueImageFilename(
  existingNames: Iterable<string>,
  stem: string,
  ext: string,
): string {
  const safeStem = sanitizeBasename(stem).replace(/\.(jpe?g|png|gif)$/i, '') || 'image';
  const safeExt = ext.toLowerCase().replace('jpeg', 'jpg');
  const existing = new Set(existingNames);

  let candidate = `${safeStem}.${safeExt}`;
  if (!existing.has(candidate)) return candidate;

  let n = 2;
  while (existing.has(`${safeStem}-${n}.${safeExt}`)) n += 1;
  return `${safeStem}-${n}.${safeExt}`;
}

async function ensureWritePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const options = { mode: 'readwrite' as const };
  if (handle.queryPermission && handle.requestPermission) {
    if ((await handle.queryPermission(options)) === 'granted') return true;
    if ((await handle.requestPermission(options)) === 'granted') return true;
    return false;
  }
  return true;
}

async function writeBlobFile(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  blob: Blob,
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  if (!fileHandle.createWritable) {
    throw new Error('This browser does not support saving files to the selected folder');
  }
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export type ImportImageResult =
  | { ok: true; filename: string; objectUrl: string }
  | { ok: false; error: string; cancelled?: boolean };

async function importImageBlob(
  project: LoadedProject,
  blob: Blob,
  stem: string,
  ext: string,
): Promise<ImportImageResult> {
  if (!project.folderHandle) {
    return {
      ok: false,
      error:
        'Import is only available when a local project folder is open. Use “Open project folder” instead of sample mode.',
    };
  }

  if (!IMAGE_EXT.test(`.${ext}`)) {
    return { ok: false, error: 'Please choose a JPEG, PNG, or GIF image.' };
  }

  const allowed = await ensureWritePermission(project.folderHandle);
  if (!allowed) {
    return {
      ok: false,
      error: 'Write permission was not granted for the selected folder.',
    };
  }

  const filename = resolveUniqueImageFilename(project.imageUrls.keys(), stem, ext);

  try {
    const docsHandle = await ensureDocsDirectory(project.folderHandle);
    await writeBlobFile(docsHandle, filename, blob);
    const objectUrl = URL.createObjectURL(blob);
    return { ok: true, filename, objectUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not copy image into docs/',
    };
  }
}

const CLIPBOARD_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif'] as const;

export async function readImageBlobFromClipboard(): Promise<
  | { blob: Blob; ext: string; stem: string }
  | { error: string }
> {
  if (!canReadClipboardImages()) {
    return {
      error: 'Your browser does not support reading images from the clipboard.',
    };
  }

  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = CLIPBOARD_IMAGE_TYPES.find((type) => item.types.includes(type));
      if (!imageType) continue;

      const ext = extensionFromMime(imageType);
      if (!ext) continue;

      const blob = await item.getType(imageType);
      return { blob, ext, stem: 'clipboard' };
    }

    return {
      error: 'No image found on the clipboard. Copy an image first, then try again.',
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      return {
        error: 'Clipboard access was denied. Allow clipboard permission and try again.',
      };
    }
    return {
      error: err instanceof Error ? err.message : 'Could not read image from the clipboard.',
    };
  }
}

export async function importImageFromClipboard(
  project: LoadedProject,
): Promise<ImportImageResult> {
  const read = await readImageBlobFromClipboard();
  if ('error' in read) {
    return { ok: false, error: read.error };
  }

  return importImageBlob(project, read.blob, read.stem, read.ext);
}

export async function importImageFromComputer(
  project: LoadedProject,
): Promise<ImportImageResult> {
  if (!project.folderHandle) {
    return {
      ok: false,
      error:
        'Import is only available when a local project folder is open. Use “Open project folder” instead of sample mode.',
    };
  }

  const file = await pickImageFile();
  if (!file) return { ok: false, error: '', cancelled: true };

  const ext = extensionFromFile(file);
  if (!ext || !IMAGE_EXT.test(`.${ext}`)) {
    return { ok: false, error: 'Please choose a JPEG, PNG, or GIF image.' };
  }

  const dot = file.name.lastIndexOf('.');
  const stem = dot > 0 ? file.name.slice(0, dot) : file.name || 'image';
  return importImageBlob(project, file, stem, ext);
}
