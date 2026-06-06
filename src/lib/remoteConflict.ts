/** True when the server copy is newer than the version this session loaded. */
export function isRemoteVersionStale(
  loadedUpdatedAt: string | null | undefined,
  serverUpdatedAt: string | null | undefined,
): boolean {
  if (!loadedUpdatedAt || !serverUpdatedAt) return false;
  const loadedMs = Date.parse(loadedUpdatedAt);
  const serverMs = Date.parse(serverUpdatedAt);
  if (Number.isNaN(loadedMs) || Number.isNaN(serverMs)) return false;
  return serverMs > loadedMs;
}

export function formatRemoteUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return 'unknown time';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}
