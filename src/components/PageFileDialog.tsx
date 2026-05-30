import { useEffect, useState } from 'react';

interface PageFileDialogProps {
  title: string;
  label: string;
  initialValue?: string;
  hint?: string;
  confirmLabel: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  deleteConfirmMessage?: string;
}

export function PageFileDialog({
  title,
  label,
  initialValue = '',
  hint,
  confirmLabel,
  onConfirm,
  onClose,
  onDelete,
  deleteDisabled = false,
  deleteConfirmMessage = 'Delete this page and remove its components from all groups? This cannot be undone.',
}: PageFileDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Enter a page name.');
      return;
    }
    setError(null);
    onConfirm(trimmed);
  };

  return (
    <div className="picker-overlay" role="presentation" onClick={onClose}>
      <div
        className="picker-dialog page-file-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="page-file-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="picker-header">
          <h2 id="page-file-dialog-title" className="picker-title">
            {title}
          </h2>
          <button type="button" className="picker-close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <form className="page-file-dialog-body" onSubmit={handleSubmit}>
          {confirmingDelete ? (
            <>
              <p className="page-file-dialog-message">{deleteConfirmMessage}</p>
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
                    onClick={() => onDelete?.()}
                  >
                    Delete
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <>
          <label className="page-file-dialog-label">
            <span>{label}</span>
            <input
              type="text"
              className="page-file-dialog-input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="my-page.p"
              autoFocus
            />
          </label>
          {hint && <p className="page-file-dialog-hint">{hint}</p>}
          {error && (
            <p className="page-file-dialog-error" role="alert">
              {error}
            </p>
          )}
          <footer className="page-file-dialog-footer page-file-dialog-footer-split">
            {onDelete ? (
              <button
                type="button"
                className="picker-import-btn page-file-dialog-danger"
                disabled={deleteDisabled}
                onClick={() => setConfirmingDelete(true)}
              >
                Delete page
              </button>
            ) : (
              <span />
            )}
            <div className="page-file-dialog-footer-actions">
              <button type="button" className="picker-import-btn" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="picker-import-btn page-file-dialog-submit">
                {confirmLabel}
              </button>
            </div>
          </footer>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
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
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="picker-header">
          <h2 id="confirm-dialog-title" className="picker-title">
            {title}
          </h2>
          <button type="button" className="picker-close-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="page-file-dialog-body">
          <p className="page-file-dialog-message">{message}</p>
          <footer className="page-file-dialog-footer">
            <button type="button" className="picker-import-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="picker-import-btn page-file-dialog-danger"
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              {confirmLabel}
            </button>
          </footer>
        </div>
      </div>
    </div>
  );
}
