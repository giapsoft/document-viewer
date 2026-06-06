const USERNAME_KEY = 'doc-viewer-comment-username';

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
