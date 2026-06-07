import { useEffect, useState } from 'react';
import type { LoadedProject } from '../types';
import { buildDocShareUrl } from '../lib/docUrl';
import { defaultRemoteTitle } from '../lib/projectBundle';
import { isSupabaseConfigured } from '../lib/supabaseClient';

export type SaveDestination = 'local' | 'remote';

interface SaveDestinationDialogProps {
  project: LoadedProject;
  dirty: boolean;
  onClose: () => void;
  onChoose: (destination: SaveDestination) => void;
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

  const remoteHint = !dirty
    ? 'No unsaved changes — remote save is only needed after you edit.'
    : hasRemoteDoc
      ? `Update “${project.remoteTitle ?? defaultRemoteTitle(project)}” in remote storage.`
      : remoteStorageReady
        ? 'Create a new document in remote storage (you will name it).'
        : 'Remote storage is not available on this site.';

  const remoteTitle = project.remoteTitle ?? defaultRemoteTitle(project);
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
              <p className="save-destination-intro">Choose where to export your changes.</p>

              {hasRemoteDoc && (
                <section className="save-destination-section save-destination-link-section">
                  <h3 className="save-destination-section-title">Remote link</h3>
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
                    disabled={!remoteStorageReady || !dirty}
                    onClick={() => onChoose('remote')}
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
