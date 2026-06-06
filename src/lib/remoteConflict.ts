/** Keep the later of two server timestamps (ISO strings from documents.updated_at). */
export function pickNewerRemoteUpdatedAt(
  a: string | null | undefined,
  b: string | null | undefined,
): string | null | undefined {
  if (!a) return b ?? null;
  if (!b) return a;
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (Number.isNaN(aMs)) return b;
  if (Number.isNaN(bMs)) return a;
  return bMs > aMs ? b : a;
}

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
