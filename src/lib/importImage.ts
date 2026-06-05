import type { LoadedProject } from '../types';
import { compressImageIfNeeded } from './imageCompress';

const IMAGE_EXT = /\.(jpg|jpeg|png|gif)$/i;

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
};

export function canImportImages(project: LoadedProject | null | undefined): boolean {
  return Boolean(project);
}

export function canReadClipboardImages(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.read === 'function';
}

export function canReadClipboardForImageImport(): boolean {
  return (
    canReadClipboardImages() ||
    (typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function')
  );
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

export type ImportImageResult =
  | { ok: true; filename: string; objectUrl: string; blob: Blob }
  | { ok: false; error: string; cancelled?: boolean };

async function importImageBlob(
  project: LoadedProject,
  blob: Blob,
  stem: string,
  ext: string,
): Promise<ImportImageResult> {
  if (!IMAGE_EXT.test(`.${ext}`)) {
    return { ok: false, error: 'Please choose a JPEG, PNG, or GIF image.' };
  }

  const filename = resolveUniqueImageFilename(project.imageUrls.keys(), stem, ext);
  const compressed = await compressImageIfNeeded(blob, filename);
  const objectUrl = URL.createObjectURL(compressed.blob);
  return { ok: true, filename: compressed.filename, objectUrl, blob: compressed.blob };
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
  return importImageFromClipboardSource(project);
}

function normalizeClipboardPathText(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '').trim();
}

function basenameFromPath(text: string): string {
  return text.replace(/^.*[/\\]/, '').trim();
}

function extFromBasename(name: string): string | null {
  const match = name.match(/\.(jpe?g|png|gif)$/i);
  if (!match) return null;
  return match[1].toLowerCase().replace('jpeg', 'jpg');
}

async function importImageFromUrl(
  project: LoadedProject,
  url: string,
): Promise<ImportImageResult> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, error: `Could not fetch image (${response.status}).` };
    }
    const blob = await response.blob();
    const mimeExt = extensionFromMime(blob.type);
    const urlExt = extFromBasename(url);
    const ext = mimeExt ?? urlExt;
    if (!ext || !IMAGE_EXT.test(`.${ext}`)) {
      return { ok: false, error: 'URL does not point to a JPEG, PNG, or GIF image.' };
    }
    const stem = sanitizeBasename(basenameFromPath(url)).replace(/\.(jpe?g|png|gif)$/i, '') || 'image';
    return importImageBlob(project, blob, stem, ext);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not fetch image from URL.',
    };
  }
}

async function importExistingDocsImage(
  project: LoadedProject,
  fileName: string,
): Promise<ImportImageResult> {
  const existingUrl = project.imageUrls.get(fileName);
  const existingBlob = project.imageBlobs.get(fileName);
  if (existingUrl && existingBlob) {
    return { ok: true, filename: fileName, objectUrl: existingUrl, blob: existingBlob };
  }

  if (project.folderHandle) {
    try {
      const { ensureDocsDirectory } = await import('./docsFolder');
      const docsHandle = await ensureDocsDirectory(project.folderHandle);
      const fileHandle = await docsHandle.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const ext = extensionFromFile(file);
      if (!ext || !IMAGE_EXT.test(`.${ext}`)) {
        return { ok: false, error: 'File in docs/ is not a supported image type.' };
      }
      const objectUrl = URL.createObjectURL(file);
      return { ok: true, filename: fileName, objectUrl, blob: file };
    } catch {
      // fall through
    }
  }

  return {
    ok: false,
    error: `Image "${fileName}" was not found in this project.`,
  };
}

async function readImagePathFromClipboard(
  project: LoadedProject,
): Promise<ImportImageResult | null> {
  if (!navigator.clipboard?.readText) return null;

  let text: string;
  try {
    text = normalizeClipboardPathText(await navigator.clipboard.readText());
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotAllowedError') {
      return { ok: false, error: 'Clipboard access was denied. Allow clipboard permission and try again.' };
    }
    return null;
  }

  if (!text) return null;

  if (/^https?:\/\//i.test(text)) {
    return importImageFromUrl(project, text);
  }

  if (/^file:\/\//i.test(text)) {
    try {
      const response = await fetch(text);
      if (!response.ok) {
        return { ok: false, error: 'Could not read image from file URL on clipboard.' };
      }
      const blob = await response.blob();
      const ext = extensionFromMime(blob.type) ?? extFromBasename(text);
      if (!ext || !IMAGE_EXT.test(`.${ext}`)) {
        return { ok: false, error: 'File URL on clipboard is not a supported image.' };
      }
      const stem =
        sanitizeBasename(basenameFromPath(text)).replace(/\.(jpe?g|png|gif)$/i, '') || 'image';
      return importImageBlob(project, blob, stem, ext);
    } catch {
      return {
        ok: false,
        error: 'Browser blocked reading the file path on clipboard. Copy the image itself instead.',
      };
    }
  }

  const fileName = basenameFromPath(text);
  if (!IMAGE_EXT.test(fileName)) {
    return null;
  }

  return importExistingDocsImage(project, fileName);
}

/** Clipboard image bytes first, then image path / URL in plain text. */
export async function importImageFromClipboardSource(
  project: LoadedProject,
): Promise<ImportImageResult> {
  const imageRead = await readImageBlobFromClipboard();
  if (!('error' in imageRead)) {
    return importImageBlob(project, imageRead.blob, imageRead.stem, imageRead.ext);
  }

  const pathRead = await readImagePathFromClipboard(project);
  if (pathRead) return pathRead;

  return { ok: false, error: imageRead.error };
}

export async function importImageFromComputer(
  project: LoadedProject,
): Promise<ImportImageResult> {
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
