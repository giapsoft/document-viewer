const USERNAME_KEY = 'doc-viewer-comment-username';
const AUTHOR_ID_KEY = 'doc-viewer-comment-author-id';

export function getStoredCommentUsername(): string | null {
  try {
    const value = sessionStorage.getItem(USERNAME_KEY);
    return value?.trim() ? value : null;
  } catch {
    return null;
  }
}

export function setStoredCommentUsername(username: string): void {
  try {
    sessionStorage.setItem(USERNAME_KEY, username.trim());
  } catch {
    // ignore quota / private mode
  }
}

function createAuthorId(): string {
  return `uid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Stable per-browser author id for owning comments (localStorage). */
export function getOrCreateCommentAuthorId(): string {
  try {
    const existing = localStorage.getItem(AUTHOR_ID_KEY)?.trim();
    if (existing) return existing;
    const created = createAuthorId();
    localStorage.setItem(AUTHOR_ID_KEY, created);
    return created;
  } catch {
    return createAuthorId();
  }
}
