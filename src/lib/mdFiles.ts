/**
 * Markdown sidecar files live in docs/ next to .p pages.
 * Filename = global id + ".md" (pageId is not repeated).
 * Example: global id `intro.p1` → `intro.p1.md` (not `intro.intro.p1.md`).
 */
export function mdSidecarFileName(componentId: string): string {
  return `${componentId}.md`;
}

export function componentIdFromMdFileName(fileName: string): string | null {
  if (!fileName.toLowerCase().endsWith('.md')) return null;
  return fileName.slice(0, -3);
}

export const MD_FILE_EXT = /\.md$/i;
