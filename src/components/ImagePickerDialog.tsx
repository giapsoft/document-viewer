import { useEffect, useMemo, useState } from 'react';

import type { LoadedProject } from '../types';

import { canImportImages, canReadClipboardImages } from '../lib/importImage';

import type { ImportImageResult } from '../lib/importImage';

interface ImagePickerDialogProps {
  project: LoadedProject;
  selectedFilename: string;
  onSelect: (filename: string, previewSrc?: string) => void;
  onClose: () => void;
  onImport?: () => Promise<ImportImageResult>;
  onImportFromClipboard?: () => Promise<ImportImageResult>;
  elevated?: boolean;
}

export function ImagePickerDialog({
  project,
  selectedFilename,
  onSelect,
  onClose,
  onImport,
  onImportFromClipboard,
  elevated = false,
}: ImagePickerDialogProps) {
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const images = useMemo(
    () => [...project.imageUrls.keys()].sort((a, b) => a.localeCompare(b)),
    [project.imageUrls],
  );

  const importAllowed = canImportImages(project) && Boolean(onImport);
  const clipboardAllowed =
    importAllowed && Boolean(onImportFromClipboard) && canReadClipboardImages();
  const selected = selectedFilename.trim();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const runImport = async (importFn: () => Promise<ImportImageResult>) => {
    if (importing) return;
    setImportError(null);
    setImporting(true);
    try {
      const result = await importFn();
      if (result.ok) {
        onSelect(result.filename, result.objectUrl);
        onClose();
        return;
      }
      if (!result.cancelled) {
        setImportError(result.error);
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      className={`picker-overlay${elevated ? ' picker-overlay-elevated' : ''}`}
      role="presentation"
      onClick={onClose}
    >
      <div
        className="picker-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-picker-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="picker-header">
          <div className="picker-header-start">
            <h2 id="image-picker-dialog-title" className="picker-title">
              Select image
            </h2>
          </div>
          <button
            type="button"
            className="picker-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="picker-body">
          {images.length === 0 ? (
            <p className="picker-empty">No images found in docs/</p>
          ) : (
            <ul className="picker-image-list">
              {images.map((name) => {
                const src = project.imageUrls.get(name);
                return (
                  <li key={name}>
                    <button
                      type="button"
                      className={`picker-image-item ${selected === name ? 'active' : ''}`}
                      onClick={() => {
                        onSelect(name);
                        onClose();
                      }}
                    >
                      {src ? (
                        <img
                          src={src}
                          alt=""
                          className="picker-image-thumb"
                        />
                      ) : (
                        <span className="picker-image-thumb picker-image-thumb-missing" aria-hidden>
                          🖼
                        </span>
                      )}
                      <span className="picker-image-name">{name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="picker-footer picker-footer-with-actions">
          <div className="picker-footer-text">
            <span>Images from the project docs/ folder. Click to select.</span>
            {!importAllowed && (
              <span className="picker-import-hint">
                Sample mode — open a local project folder to import images.
              </span>
            )}
            {importError && (
              <span className="picker-import-error" role="alert">
                {importError}
              </span>
            )}
          </div>
          <div className="picker-footer-actions">
            <button
              type="button"
              className="picker-import-btn"
              disabled={!clipboardAllowed || importing}
              onClick={() => onImportFromClipboard && void runImport(onImportFromClipboard)}
              title={
                clipboardAllowed
                  ? 'Paste an image from the clipboard into docs/'
                  : importAllowed
                    ? 'Clipboard image paste is not supported in this browser'
                    : 'Open a local project folder to import images'
              }
            >
              {importing ? 'Importing…' : 'Paste from clipboard…'}
            </button>
            <button
              type="button"
              className="picker-import-btn"
              disabled={!importAllowed || importing}
              onClick={() => onImport && void runImport(onImport)}
              title={
                importAllowed
                  ? 'Copy an image from your computer into docs/'
                  : 'Open a local project folder to import images'
              }
            >
              {importing ? 'Importing…' : 'Import from computer…'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
