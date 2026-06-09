import { useEffect, useState } from 'react';
import type { LoadedProject } from '../types';
import { buildDocShareUrl } from '../lib/docUrl';
import {
  normalizeFriendlyDocId,
  validateFriendlyDocId,
} from '../lib/documentId';
import { defaultRemoteTitle, normalizeDocumentTitle } from '../lib/projectBundle';
import { isSupabaseConfigured } from '../lib/supabaseClient';

import type { ExportProtection } from '../lib/saveProject';

export type SaveDestination = 'local' | 'remote';

export type SaveDestinationChoice = {
  destination: SaveDestination;
  remoteTitle?: string;
  remoteDocId?: string;
  remotePublished?: boolean;
  protection?: ExportProtection;
};

interface SaveDestinationDialogProps {
  project: LoadedProject;
  dirty: boolean;
  onClose: () => void;
  onChoose: (choice: SaveDestinationChoice) => void;
  onDeleteRemote?: () => void;
}

export function SaveDestinationDialog({
  project,
  dirty,
  onClose,
  onChoose,
  onDeleteRemote,
}: SaveDestinationDialogProps) {
  const remoteStorageReady = isSupabaseConfigured();
  const hasLocalFolder = Boolean(project.folderHandle);
  const hasRemoteDoc = Boolean(project.remoteDocId);
  const canPickLocal = Boolean(window.showDirectoryPicker);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [remoteTitleDraft, setRemoteTitleDraft] = useState(
    () => project.remoteTitle ?? defaultRemoteTitle(project),
  );
  const [linkIdDraft, setLinkIdDraft] = useState('');
  const [linkIdError, setLinkIdError] = useState<string | null>(null);
  const [listOnWelcomeDraft, setListOnWelcomeDraft] = useState(
    () => project.remotePublished !== false,
  );
  const [protectWithPassword, setProtectWithPassword] = useState(
    () => Boolean(project.passwordProtected),
  );
  const [removePassword, setRemovePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleCopyLink = async () => {
    if (!project.remoteDocId) return;
    const url = buildDocShareUrl(project.remoteDocId);
    try {
      await navigator.clipboard.writeText(url);
      setCopyFeedback('Copied!');
      window.setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      setCopyFeedback('Copy failed');
      window.setTimeout(() => setCopyFeedback(null), 2500);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const localHint = hasLocalFolder
    ? 'Save into the currently linked local folder.'
    : canPickLocal
      ? 'Choose a folder on your computer.'
      : 'Folder saving requires Chrome or Edge.';

  const remoteTitle = project.remoteTitle ?? defaultRemoteTitle(project);
  const normalizedDraft = normalizeDocumentTitle(remoteTitleDraft);
  const normalizedCurrent = normalizeDocumentTitle(remoteTitle);
  const normalizedLinkId = normalizeFriendlyDocId(linkIdDraft);
  const linkIdValidation = validateFriendlyDocId(normalizedLinkId);
  const titleChanged = hasRemoteDoc && normalizedDraft !== normalizedCurrent;
  const listOnWelcomeCurrent = project.remotePublished !== false;
  const publishedChanged = hasRemoteDoc && listOnWelcomeDraft !== listOnWelcomeCurrent;
  const canPublishRemote = !hasRemoteDoc;
  const canChooseRemote =
    remoteStorageReady &&
    normalizedDraft.length > 0 &&
    (hasRemoteDoc || linkIdValidation.ok) &&
    (dirty || canPublishRemote || titleChanged || publishedChanged);

  const remoteHint = !remoteStorageReady
    ? 'Remote storage is not available on this site.'
    : normalizedDraft.length === 0
      ? 'Enter a document title above.'
      : canPublishRemote && !linkIdValidation.ok
        ? linkIdDraft.trim()
          ? linkIdValidation.error
          : 'Enter a link ID before publishing to remote storage.'
        : canPublishRemote
          ? dirty
            ? 'Publish your changes to remote storage for the first time.'
            : 'Publish this document to remote storage for the first time.'
          : publishedChanged && !dirty && !titleChanged
            ? 'Update whether this document appears on the welcome screen.'
            : titleChanged && !dirty
              ? 'Rename the remote document (no other unsaved changes).'
              : dirty
                ? `Update “${normalizedDraft}” in remote storage.`
                : 'No unsaved changes — remote update is not needed.';
  const shareUrl = hasRemoteDoc
    ? buildDocShareUrl(project.remoteDocId!)
    : linkIdValidation.ok
      ? buildDocShareUrl(normalizedLinkId)
      : '';

  const handleRemoteTitleChange = (value: string) => {
    setRemoteTitleDraft(value);
  };

  const handleLinkIdChange = (value: string) => {
    setLinkIdDraft(value);
    setLinkIdError(null);
  };

  const buildProtection = (): ExportProtection | undefined => {
    if (removePassword && project.passwordProtected) {
      return { mode: 'remove' };
    }
    if (!protectWithPassword) return undefined;
    if (!password && project.passwordProtected && !removePassword) {
      return undefined;
    }
    if (!password) {
      setPasswordError('Enter a password.');
      return undefined;
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return undefined;
    }
    return { mode: 'protect', password };
  };

  const handleChoose = (destination: SaveDestination) => {
    setPasswordError(null);
    setLinkIdError(null);
    const protection = buildProtection();
    if (protectWithPassword && !removePassword && !protection && !project.passwordProtected) return;

    if (destination === 'remote' && canPublishRemote) {
      const validation = validateFriendlyDocId(normalizedLinkId);
      if (!validation.ok) {
        setLinkIdError(validation.error);
        return;
      }
    }

    onChoose({
      destination,
      remoteTitle: destination === 'remote' ? normalizedDraft : undefined,
      remoteDocId: destination === 'remote' && canPublishRemote ? normalizedLinkId : undefined,
      remotePublished: destination === 'remote' ? listOnWelcomeDraft : undefined,
      protection,
    });
  };

  const selectLinkInput = (event: { currentTarget: HTMLInputElement }) => {
    event.currentTarget.select();
  };

  return (
    <div className="picker-overlay" role="presentation" onClick={onClose}>
      <div
        className="picker-dialog page-file-dialog save-destination-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-destination-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="picker-header">
          <h2 id="save-destination-title" className="picker-title">
            Export document
          </h2>
          <button type="button" className="picker-close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="page-file-dialog-body save-destination-body">
          {confirmingDelete ? (
            <>
              <p className="page-file-dialog-message">
                Delete “{remoteTitle}” from remote storage? This removes the remote copy only. Your
                current edits in the browser stay open.
              </p>
              <footer className="page-file-dialog-footer page-file-dialog-footer-split">
                <button
                  type="button"
                  className="picker-import-btn"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Back
                </button>
                <div className="page-file-dialog-footer-actions">
                  <button type="button" className="picker-import-btn" onClick={onClose}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="picker-import-btn page-file-dialog-danger"
                    onClick={() => onDeleteRemote?.()}
                  >
                    Delete remote
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <>
              <p className="save-destination-intro">
                {canPublishRemote
                  ? 'Publish to remote storage or export to a local folder.'
                  : 'Choose where to export your changes.'}
              </p>

              {remoteStorageReady && (
                <section className="save-destination-section save-destination-remote-section">
                  <h3 className="save-destination-section-title">Remote document</h3>
                  <label className="save-destination-title-field">
                    <span className="save-destination-title-label">Document title</span>
                    <input
                      type="text"
                      className="save-destination-title-input"
                      value={remoteTitleDraft}
                      onChange={(e) => handleRemoteTitleChange(e.target.value)}
                      placeholder="Document title"
                    />
                  </label>
                  {canPublishRemote ? (
                    <>
                      <label className="save-destination-title-field">
                        <span className="save-destination-title-label">Link ID (required)</span>
                        <input
                          type="text"
                          className="save-destination-title-input"
                          value={linkIdDraft}
                          onChange={(e) => handleLinkIdChange(e.target.value)}
                          placeholder="UserStories"
                          spellCheck={false}
                          autoCapitalize="off"
                          autoCorrect="off"
                          required
                        />
                      </label>
                      {linkIdError ? (
                        <p className="sidebar-action-error" role="alert">
                          {linkIdError}
                        </p>
                      ) : null}
                      <p className="save-destination-option-hint">
                        Required for first publish. Letters and numbers only (e.g. /UserStories).
                      </p>
                      {shareUrl ? (
                        <div className="save-destination-link-field">
                          <input
                            type="text"
                            readOnly
                            className="save-destination-link-input"
                            value={shareUrl}
                            aria-label="Preview share link"
                            onFocus={selectLinkInput}
                            onClick={selectLinkInput}
                          />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <label className="save-destination-checkbox-field">
                    <input
                      type="checkbox"
                      checked={listOnWelcomeDraft}
                      onChange={(event) => setListOnWelcomeDraft(event.target.checked)}
                    />
                    <span>Show in saved documents on the welcome screen</span>
                  </label>
                  <p className="save-destination-option-hint">
                    When off, the document stays on remote storage but is hidden from the public
                    list. Direct links still work.
                  </p>
                  {hasRemoteDoc && (
                    <div className="save-destination-link-field">
                      <input
                        type="text"
                        readOnly
                        className="save-destination-link-input"
                        value={shareUrl}
                        aria-label="Remote document link"
                        onFocus={selectLinkInput}
                        onClick={selectLinkInput}
                      />
                      <button
                        type="button"
                        className="save-destination-link-copy"
                        onClick={() => void handleCopyLink()}
                      >
                        {copyFeedback ?? 'Copy'}
                      </button>
                    </div>
                  )}
                </section>
              )}

              <section className="save-destination-section save-destination-password-section">
                <h3 className="save-destination-section-title">Password protection</h3>
                <label className="save-destination-checkbox-field">
                  <input
                    type="checkbox"
                    checked={protectWithPassword}
                    onChange={(event) => {
                      setProtectWithPassword(event.target.checked);
                      if (event.target.checked) setRemovePassword(false);
                      setPasswordError(null);
                    }}
                  />
                  <span>Require a password to open this export</span>
                </label>
                {project.passwordProtected && protectWithPassword ? (
                  <label className="save-destination-checkbox-field">
                    <input
                      type="checkbox"
                      checked={removePassword}
                      onChange={(event) => {
                        setRemovePassword(event.target.checked);
                        setPasswordError(null);
                      }}
                    />
                    <span>Remove password protection</span>
                  </label>
                ) : null}
                {protectWithPassword && !removePassword ? (
                  <>
                    <label className="save-destination-title-field">
                      <span className="save-destination-title-label">Password</span>
                      <input
                        type="password"
                        className="save-destination-title-input"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        autoComplete="new-password"
                      />
                    </label>
                    <label className="save-destination-title-field">
                      <span className="save-destination-title-label">Confirm password</span>
                      <input
                        type="password"
                        className="save-destination-title-input"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        autoComplete="new-password"
                      />
                    </label>
                  </>
                ) : null}
                {passwordError ? (
                  <p className="sidebar-action-error" role="alert">
                    {passwordError}
                  </p>
                ) : null}
                <p className="save-destination-option-hint">
                  Protected exports store encrypted data. Viewers must enter the password before
                  any document content loads.
                </p>
              </section>

              <section className="save-destination-section">
                <h3 className="save-destination-section-title">Export to</h3>
                <div className="save-destination-options">
                  <button
                    type="button"
                    className="save-destination-option"
                    disabled={!canPickLocal}
                    onClick={() => handleChoose('local')}
                  >
                    <span className="save-destination-option-title">Local folder</span>
                    <span className="save-destination-option-hint">{localHint}</span>
                  </button>
                  <button
                    type="button"
                    className="save-destination-option"
                    disabled={!canChooseRemote}
                    onClick={() => handleChoose('remote')}
                  >
                    <span className="save-destination-option-title">Remote storage</span>
                    <span className="save-destination-option-hint">{remoteHint}</span>
                  </button>
                </div>
              </section>

              <footer className="save-destination-footer">
                <button
                  type="button"
                  className="picker-import-btn page-file-dialog-danger"
                  disabled={!hasRemoteDoc || !remoteStorageReady}
                  onClick={() => setConfirmingDelete(true)}
                  title={
                    hasRemoteDoc
                      ? 'Delete this document from remote storage'
                      : 'No remote document is linked'
                  }
                >
                  Delete remote
                </button>
                <button type="button" className="picker-import-btn" onClick={onClose}>
                  Cancel
                </button>
              </footer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
