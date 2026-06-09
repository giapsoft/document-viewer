export const DOC_URL_ID_PARAM = 'id';

function copySelectionParams(from: URL, to: URL): void {
  const c = from.searchParams.get('c');
  const pages = from.searchParams.get('pages');
  if (c) to.searchParams.set('c', c);
  if (pages) to.searchParams.set('pages', pages);
}

function clearLegacyDocParams(url: URL): void {
  url.searchParams.delete('doc');
  url.searchParams.delete('page');
}

export function getDocIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(DOC_URL_ID_PARAM);
}

export function buildDocShareUrl(docId: string): string {
  const current = new URL(window.location.href);
  const url = new URL(window.location.href);
  url.search = '';
  clearLegacyDocParams(url);
  url.searchParams.set(DOC_URL_ID_PARAM, docId);
  copySelectionParams(current, url);
  return url.toString();
}

export function setDocIdInUrl(docId: string | null): void {
  const url = new URL(window.location.href);
  clearLegacyDocParams(url);
  url.searchParams.delete('help');
  url.searchParams.delete('helpPage');
  if (docId) {
    url.searchParams.set(DOC_URL_ID_PARAM, docId);
  } else {
    url.searchParams.delete(DOC_URL_ID_PARAM);
  }
  window.history.replaceState({}, '', url);
}
