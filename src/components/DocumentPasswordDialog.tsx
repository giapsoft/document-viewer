import type { DocumentLockFile } from '../lib/documentPassword';
import { useEffect, useState } from 'react';

interface DocumentPasswordDialogProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  error?: string | null;
  busy?: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function DocumentPasswordDialog({
  title,
  description = 'This document is password-protected. Enter the password to open it.',
  confirmLabel = 'Unlock',
  error = null,
  busy = false,
  onSubmit,
  onCancel,
}: DocumentPasswordDialogProps) {
  const [password, setPassword] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="picker-overlay" role="presentation" onClick={onCancel}>
      <div
        className="picker-dialog page-file-dialog document-password-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-password-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="picker-header">
          <h2 id="document-password-title" className="picker-title">
            {title}
          </h2>
          <button type="button" className="picker-close-btn" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </header>
        <form
          className="page-file-dialog-body document-password-body"
          onSubmit={(event) => {
            event.preventDefault();
            if (!password.trim() || busy) return;
            onSubmit(password);
          }}
        >
          <p className="document-password-description">{description}</p>
          <label className="save-destination-title-field">
            <span className="save-destination-title-label">Password</span>
            <input
              type="password"
              className="save-destination-title-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
              autoComplete="current-password"
              disabled={busy}
            />
          </label>
          {error ? (
            <p className="sidebar-action-error document-password-error" role="alert">
              {error}
            </p>
          ) : null}
          <footer className="page-file-dialog-footer page-file-dialog-footer-split">
            <button type="button" className="picker-import-btn" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="picker-import-btn"
              disabled={!password.trim() || busy}
            >
              {busy ? 'Unlocking…' : confirmLabel}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

import type { ImportLocalToRemoteParams } from './SaveDestinationDialog';

export type PendingDocumentUnlock =
  | {
      source: 'local';
      title: string;
      folderHandle: FileSystemDirectoryHandle;
      lock: DocumentLockFile;
    }
  | {
      source: 'local-import-remote';
      title: string;
      folderHandle: FileSystemDirectoryHandle;
      lock: DocumentLockFile;
      save: ImportLocalToRemoteParams;
    }
  | {
      source: 'remote';
      title: string;
      docId: string;
      lock: DocumentLockFile;
      publishMode?: import('../types').PublishMode;
    }
  | {
      source: 'remote-edit';
      title: string;
      docId: string;
    };
