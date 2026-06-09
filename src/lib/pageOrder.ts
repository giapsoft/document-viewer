import type { PageData, RelationsFile } from '../types';

export function getStoredPageOrder(
  relations: RelationsFile,
  pageFileNames: string[],
): string[] {
  const valid = new Set(pageFileNames);
  const stored = Array.isArray(relations.pageOrder)
    ? relations.pageOrder.filter((f) => valid.has(f))
    : [];
  const seen = new Set(stored);
  const rest = [...pageFileNames].filter((f) => !seen.has(f)).sort((a, b) => a.localeCompare(b));
  return [...stored, ...rest];
}

export function sortPagesByOrder(
  pages: PageData[],
  pageOrder: string[],
): PageData[] {
  const order = getStoredPageOrder(
    { groups: [], pageOrder },
    pages.map((p) => p.fileName),
  );
  const byFile = new Map(pages.map((p) => [p.fileName, p]));
  return order.map((fileName) => byFile.get(fileName)).filter((p): p is PageData => !!p);
}

/** Sort page files by sidebar order; unknown files sort last (alphabetically). */
export function orderPageFilesBySidebar(
  pageFiles: Iterable<string>,
  sidebarOrder: string[],
): string[] {
  const want = [...new Set(pageFiles)];
  const rank = new Map(sidebarOrder.map((fileName, index) => [fileName, index]));
  return want.sort((a, b) => {
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.localeCompare(b);
  });
}

export function reorderPageFileList(
  pageOrder: string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= pageOrder.length ||
    toIndex >= pageOrder.length ||
    fromIndex === toIndex
  ) {
    return pageOrder;
  }
  const next = [...pageOrder];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function appendPageToOrder(pageOrder: string[], fileName: string): string[] {
  if (pageOrder.includes(fileName)) return pageOrder;
  return [...pageOrder, fileName];
}

export function removePageFromOrder(pageOrder: string[], fileName: string): string[] {
  return pageOrder.filter((f) => f !== fileName);
}
