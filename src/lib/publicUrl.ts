/** Resolve a path under Vite `public/` for both local dev and GitHub Pages subpaths. */
export function publicUrl(path: string): string {
  const normalized = path.replace(/^\//, '');
  return `${import.meta.env.BASE_URL}${normalized}`;
}
