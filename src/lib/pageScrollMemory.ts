/** Session-only scroll positions keyed by page file name. */
const scrollTops = new Map<string, number>();

export function getPageScrollTop(pageFile: string): number | undefined {
  return scrollTops.get(pageFile);
}

export function setPageScrollTop(pageFile: string, top: number): void {
  if (!Number.isFinite(top) || top < 0) return;
  scrollTops.set(pageFile, top);
}

export function clearPageScrollMemory(): void {
  scrollTops.clear();
}
