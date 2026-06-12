const panelSlots = new Map<string, HTMLDivElement>();
let pagePanelsTrack: HTMLDivElement | null = null;

export function setPagePanelsTrack(el: HTMLDivElement | null): void {
  pagePanelsTrack = el;
}

export function measurePagePanelsTrackWidth(): number | undefined {
  const width = pagePanelsTrack?.clientWidth ?? 0;
  return width > 0 ? width : undefined;
}

export function setPanelSlotElement(pageFile: string, el: HTMLDivElement | null): void {
  if (el) panelSlots.set(pageFile, el);
  else panelSlots.delete(pageFile);
}

/** Live rendered width of an open panel slot (before it is swapped out). */
export function measurePanelSlotWidth(pageFile: string): number | undefined {
  const el = panelSlots.get(pageFile);
  if (!el) return undefined;
  const width = el.getBoundingClientRect().width;
  return width > 0 ? Math.round(width) : undefined;
}
