export function getDocIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('doc') ?? params.get('page');
}

export function setDocIdInUrl(docId: string | null): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('page');
  if (docId) {
    url.searchParams.set('doc', docId);
  } else {
    url.searchParams.delete('doc');
  }
  window.history.replaceState({}, '', url);
}
