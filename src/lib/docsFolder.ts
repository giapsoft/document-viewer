/** Ensure `docs/` exists under the project root (created on first page / save). */
export async function ensureDocsDirectory(
  root: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  return root.getDirectoryHandle('docs', { create: true });
}

/** Return `docs/` if it exists, otherwise null. */
export async function getDocsDirectoryIfPresent(
  root: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await root.getDirectoryHandle('docs');
  } catch {
    return null;
  }
}
