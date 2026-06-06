import { useEffect } from 'react';

interface RemoteConflictDialogProps {
  onReload: () => void;
  onOverwrite: () => void;
  onClose: () => void;
}

export function RemoteConflictDialog({
  onReload,
  onOverwrite,
  onClose,
}: RemoteConflictDialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="picker-overlay" role="presentation" onClick={onClose}>
      <div
        className="picker-dialog page-file-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remote-conflict-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="picker-header">
          <h2 id="remote-conflict-title" className="picker-title">
            Newer version on server
          </h2>
          <button type="button" className="picker-close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="page-file-dialog-body">
          <p className="page-file-dialog-message">
            Someone else saved this document while you were editing. Reload to merge their changes
            into your session (you will lose unsaved edits unless you copy them first), or overwrite
            the server with your copy.
          </p>
          <footer className="page-file-dialog-footer page-file-dialog-footer-split">
            <button type="button" className="picker-import-btn" onClick={onClose}>
              Cancel
            </button>
            <div className="page-file-dialog-footer-actions">
              <button type="button" className="picker-import-btn" onClick={onReload}>
                Reload
              </button>
              <button
                type="button"
                className="picker-import-btn page-file-dialog-danger"
                onClick={onOverwrite}
              >
                Overwrite server
              </button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
