import { useEffect, useState } from 'react';
import type { LoadedProject } from '../types';
import { buildDocShareUrl } from '../lib/docUrl';
import { defaultRemoteTitle, normalizeDocumentTitle } from '../lib/projectBundle';
import { isSupabaseConfigured } from '../lib/supabaseClient';

export type SaveDestination = 'local' | 'remote';

interface SaveDestinationDialogProps {
  project: LoadedProject;
  dirty: boolean;
  onClose: () => void;
  onChoose: (destination: SaveDestination, remoteTitle?: string) => void;
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
  const titleChanged = hasRemoteDoc && normalizedDraft !== normalizedCurrent;
  const canPublishRemote = !hasRemoteDoc;
  const canChooseRemote =
    remoteStorageReady &&
    normalizedDraft.length > 0 &&
    (dirty || canPublishRemote || titleChanged);

  const remoteHint = !remoteStorageReady
    ? 'Remote storage is not available on this site.'
    : normalizedDraft.length === 0
      ? 'Enter a document title above.'
      : canPublishRemote
        ? dirty
          ? 'Publish your changes to remote storage for the first time.'
          : 'Publish this document to remote storage for the first time.'
        : titleChanged && !dirty
          ? 'Rename the remote document (no other unsaved changes).'
          : dirty
            ? `Update “${normalizedDraft}” in remote storage.`
            : 'No unsaved changes — remote update is not needed.';
  const shareUrl = hasRemoteDoc ? buildDocShareUrl(project.remoteDocId!) : '';

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
                      onChange={(e) => setRemoteTitleDraft(e.target.value)}
                      placeholder="Document title"
                    />
                  </label>
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

              <section className="save-destination-section">
                <h3 className="save-destination-section-title">Export to</h3>
                <div className="save-destination-options">
                  <button
                    type="button"
                    className="save-destination-option"
                    disabled={!canPickLocal}
                    onClick={() => onChoose('local')}
                  >
                    <span className="save-destination-option-title">Local folder</span>
                    <span className="save-destination-option-hint">{localHint}</span>
                  </button>
                  <button
                    type="button"
                    className="save-destination-option"
                    disabled={!canChooseRemote}
                    onClick={() => onChoose('remote', normalizedDraft)}
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
