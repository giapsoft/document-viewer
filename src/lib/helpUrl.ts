export const HELP_ABOUT_PAGE = 'about.p';
export const HELP_GUIDE_PAGE = 'guide.p';

export function getHelpRequestFromUrl(): { requested: boolean; pageFile: string | null } {
  const params = new URLSearchParams(window.location.search);
  if (params.get('help') !== '1') {
    return { requested: false, pageFile: null };
  }
  const pageFile = params.get('helpPage');
  return {
    requested: true,
    pageFile: pageFile && pageFile.endsWith('.p') ? pageFile : null,
  };
}

export function buildHelpUrl(pageFile?: string): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('help', '1');
  if (pageFile) {
    url.searchParams.set('helpPage', pageFile);
  }
  return url.toString();
}

export function setHelpInUrl(pageFile: string | null): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('doc');
  url.searchParams.delete('page');
  if (pageFile) {
    url.searchParams.set('help', '1');
    url.searchParams.set('helpPage', pageFile);
  } else {
    url.searchParams.delete('help');
    url.searchParams.delete('helpPage');
  }
  window.history.replaceState({}, '', url);
}

export function clearHelpFromUrl(): void {
  setHelpInUrl(null);
}
