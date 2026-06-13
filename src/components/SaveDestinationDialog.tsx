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
import {
  DEFAULT_PUBLISH_MODE,
  PUBLISH_MODE_HINTS,
  PUBLISH_MODE_LABELS,
  PUBLISH_MODES,
  type PublishMode,
} from '../lib/publishMode';

export type SaveDestination = 'local' | 'remote';

export type SaveDestinationChoice = {
  destination: SaveDestination;
  remoteTitle?: string;
  remoteDocId?: string;
  remotePublishMode?: PublishMode;
  protection?: ExportProtection;
};

export type ImportLocalToRemoteParams = {
  remoteTitle?: string;
  remoteDocId?: string;
  remotePublishMode?: PublishMode;
  protection?: ExportProtection;
};

interface SaveDestinationDialogProps {
  project: LoadedProject;
  dirty: boolean;
  onClose: () => void;
  onChoose: (choice: SaveDestinationChoice) => void;
  onImportLocalToRemote: (params: ImportLocalToRemoteParams) => void;
  onDeleteRemote?: () => void;
}

export function SaveDestinationDialog({
  project,
  dirty,
  onClose,
  onChoose,
  onImportLocalToRemote,
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
  const [publishModeDraft, setPublishModeDraft] = useState<PublishMode>(
    () => project.remotePublishMode ?? DEFAULT_PUBLISH_MODE,
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
  const publishModeCurrent = project.remotePublishMode ?? DEFAULT_PUBLISH_MODE;
  const publishModeChanged = hasRemoteDoc && publishModeDraft !== publishModeCurrent;
  const canPublishRemote = !hasRemoteDoc;
  const canChooseRemote =
    remoteStorageReady &&
    normalizedDraft.length > 0 &&
    (hasRemoteDoc || linkIdValidation.ok) &&
    (dirty || canPublishRemote || titleChanged || publishModeChanged);

  const canImportLocalToRemote =
    remoteStorageReady &&
    canPickLocal &&
    normalizedDraft.length > 0 &&
    (hasRemoteDoc || linkIdValidation.ok);

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
          : publishModeChanged && !dirty && !titleChanged
            ? 'Update how this document is published on remote storage.'
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
      remotePublishMode: destination === 'remote' ? publishModeDraft : undefined,
      protection,
    });
  };

  const buildImportParams = (): ImportLocalToRemoteParams | null => {
    setPasswordError(null);
    setLinkIdError(null);
    const protection = buildProtection();
    if (protectWithPassword && !removePassword && !protection && !project.passwordProtected) {
      return null;
    }
    if (canPublishRemote) {
      const validation = validateFriendlyDocId(normalizedLinkId);
      if (!validation.ok) {
        setLinkIdError(validation.error);
        return null;
      }
    }
    return {
      remoteTitle: normalizedDraft,
      remoteDocId: canPublishRemote ? normalizedLinkId : undefined,
      remotePublishMode: publishModeDraft,
      protection,
    };
  };

  const handleImportFromLocal = () => {
    const params = buildImportParams();
    if (!params) return;
    onImportLocalToRemote(params);
  };

  const importLocalHint = !canPickLocal
    ? 'Requires Chrome or Edge.'
    : !remoteStorageReady
      ? 'Remote storage is not available on this site.'
      : normalizedDraft.length === 0
        ? 'Enter a document title above.'
        : canPublishRemote && !linkIdValidation.ok
          ? linkIdDraft.trim()
            ? (linkIdValidation.error ?? 'Enter a valid link ID.')
            : 'Enter a link ID before importing to remote storage.'
          : hasRemoteDoc
            ? 'Replace the open document with a local folder and upload to remote storage.'
            : 'Pick a local folder, then publish its contents to remote storage.';

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
                        Required for first publish. Letters and numbers only (e.g. ?id=UserStories).
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
                  <fieldset className="save-destination-publish-mode">
                    <legend className="save-destination-title-label">Publish mode</legend>
                    {PUBLISH_MODES.map((mode) => (
                      <label key={mode} className="save-destination-radio-field">
                        <input
                          type="radio"
                          name="publish-mode"
                          value={mode}
                          checked={publishModeDraft === mode}
                          onChange={() => setPublishModeDraft(mode)}
                        />
                        <span className="save-destination-radio-label">
                          <strong>{PUBLISH_MODE_LABELS[mode]}</strong>
                          <span className="save-destination-option-hint">
                            {PUBLISH_MODE_HINTS[mode]}
                          </span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
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
                  <div className="save-destination-import-local">
                    <button
                      type="button"
                      className="save-destination-import-local-btn"
                      disabled={!canImportLocalToRemote}
                      onClick={handleImportFromLocal}
                    >
                      Import from local → remote
                    </button>
                    <p className="save-destination-option-hint">{importLocalHint}</p>
                  </div>
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
                  <span>Require a password to edit (or open private documents)</span>
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
                  Public and protected documents stay readable via link or welcome list. Private
                  documents require the password before any content loads.
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
