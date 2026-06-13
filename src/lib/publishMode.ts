export type PublishMode = 'public' | 'protected' | 'private';

export const PUBLISH_MODES: PublishMode[] = ['public', 'protected', 'private'];

export const DEFAULT_PUBLISH_MODE: PublishMode = 'public';

export function normalizePublishMode(
  value: unknown,
  legacyIsPublished?: boolean | null,
): PublishMode {
  if (value === 'public' || value === 'protected' || value === 'private') {
    return value;
  }
  if (legacyIsPublished === false) return 'protected';
  return DEFAULT_PUBLISH_MODE;
}

export function publishModeFromRow(row: {
  publish_mode?: string | null;
  is_published?: boolean | null;
}): PublishMode {
  if (row.publish_mode != null && row.publish_mode !== '') {
    return normalizePublishMode(row.publish_mode);
  }
  return normalizePublishMode(undefined, row.is_published);
}

export function isWelcomeListedPublishMode(mode: PublishMode): boolean {
  return mode === 'public';
}

/** Password-protected: open readonly without password; edit needs password. */
export function allowsReadonlyPasswordAccess(
  mode: PublishMode,
  passwordProtected: boolean,
): boolean {
  return passwordProtected && (mode === 'public' || mode === 'protected');
}

/** Password-protected: must enter password before any content loads. */
export function requiresPasswordToOpen(mode: PublishMode, passwordProtected: boolean): boolean {
  return passwordProtected && mode === 'private';
}

/** Keep plaintext on server for link/read-only access. */
export function usesReadonlyPlaintextStorage(
  mode: PublishMode,
  passwordProtected: boolean,
): boolean {
  return passwordProtected && (mode === 'public' || mode === 'protected');
}

/** Encrypt entire payload (private + password). */
export function usesFullEncryptionStorage(
  mode: PublishMode,
  passwordProtected: boolean,
): boolean {
  return passwordProtected && mode === 'private';
}

export const PUBLISH_MODE_LABELS: Record<PublishMode, string> = {
  public: 'Public',
  protected: 'Protected',
  private: 'Private',
};

export const PUBLISH_MODE_HINTS: Record<PublishMode, string> = {
  public:
    'Listed on the welcome screen. Anyone can view; editing requires the password when set.',
  protected:
    'Hidden from the welcome list. Direct links allow viewing; editing requires the password when set.',
  private:
    'Hidden from the welcome list. Direct links require the password to open when set.',
};
