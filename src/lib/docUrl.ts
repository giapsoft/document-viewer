import { isFriendlyDocId } from './documentId';

const configuredAppBase = (import.meta.env.VITE_APP_BASE as string | undefined)?.replace(/\/$/, '') ?? '';

export function getConfiguredAppBase(): string {
  return configuredAppBase;
}

function stripConfiguredBase(pathname: string): string {
  if (!configuredAppBase) return pathname;
  if (pathname === configuredAppBase || pathname.startsWith(`${configuredAppBase}/`)) {
    const rest = pathname.slice(configuredAppBase.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return pathname;
}

function relativePathFromPathname(): string {
  let path = stripConfiguredBase(window.location.pathname);
  if (path.endsWith('/index.html')) {
    path = path.slice(0, -'/index.html'.length) || '/';
  }
  return path;
}

export function getDocIdFromPathname(): string | null {
  const path = relativePathFromPathname();
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  if (!trimmed) return null;
  const segments = trimmed.split('/');
  if (segments.length !== 1) return null;
  const id = segments[0]!;
  return isFriendlyDocId(id) ? id : null;
}

export function buildAppPathForDocId(docId: string): string {
  if (configuredAppBase) return `${configuredAppBase}/${docId}`;
  return `/${docId}`;
}

export function buildWelcomePath(): string {
  if (configuredAppBase) return `${configuredAppBase}/`;
  return '/';
}

function copySelectionParams(from: URL, to: URL): void {
  const c = from.searchParams.get('c');
  const pages = from.searchParams.get('pages');
  if (c) to.searchParams.set('c', c);
  if (pages) to.searchParams.set('pages', pages);
}

export function getDocIdFromUrl(): string | null {
  const fromPath = getDocIdFromPathname();
  if (fromPath) return fromPath;

  const params = new URLSearchParams(window.location.search);
  return params.get('doc') ?? params.get('page');
}

export function buildDocShareUrl(docId: string): string {
  const current = new URL(window.location.href);

  if (isFriendlyDocId(docId)) {
    const url = new URL(window.location.origin + buildAppPathForDocId(docId));
    copySelectionParams(current, url);
    return url.toString();
  }

  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('doc', docId);
  copySelectionParams(current, url);
  return url.toString();
}

export function setDocIdInUrl(docId: string | null): void {
  const current = new URL(window.location.href);

  if (docId && isFriendlyDocId(docId)) {
    const url = new URL(window.location.origin + buildAppPathForDocId(docId));
    copySelectionParams(current, url);
    window.history.replaceState({}, '', url);
    return;
  }

  if (!docId) {
    const url = new URL(window.location.origin + buildWelcomePath());
    window.history.replaceState({}, '', url);
    return;
  }

  const url = new URL(window.location.href);
  url.searchParams.delete('page');
  url.searchParams.delete('help');
  url.searchParams.delete('helpPage');
  url.searchParams.set('doc', docId);
  window.history.replaceState({}, '', url);
}
