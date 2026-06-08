export function getDocIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('doc') ?? params.get('page');
}

export function buildDocShareUrl(docId: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('doc', docId);
  return url.toString();
}

export function setDocIdInUrl(docId: string | null): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('page');
  url.searchParams.delete('help');
  url.searchParams.delete('helpPage');
  if (docId) {
    url.searchParams.set('doc', docId);
  } else {
    url.searchParams.delete('doc');
  }
  window.history.replaceState({}, '', url);
}
