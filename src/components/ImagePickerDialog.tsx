import { useEffect, useMemo, useState } from 'react';

import type { LoadedProject } from '../types';

import { canImportImages, canReadClipboardImages } from '../lib/importImage';

import type { ImportImageResult } from '../lib/importImage';

type ImageDeleteResult = { ok: true } | { ok: false; error: string };

interface ImagePickerDialogProps {
  project: LoadedProject;
  selectedFilename: string;
  onSelect: (filename: string, previewSrc?: string) => void;
  onClose: () => void;
  onImport?: () => Promise<ImportImageResult>;
  onImportFromClipboard?: () => Promise<ImportImageResult>;
  onDeleteImage?: (filename: string) => Promise<ImageDeleteResult>;
  elevated?: boolean;
}

function resolveInitialPreview(images: string[], selectedFilename: string): string {
  const selected = selectedFilename.trim();
  if (selected && images.includes(selected)) return selected;
  return images[0] ?? '';
}

export function ImagePickerDialog({
  project,
  selectedFilename,
  onSelect,
  onClose,
  onImport,
  onImportFromClipboard,
  onDeleteImage,
  elevated = false,
}: ImagePickerDialogProps) {
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [backdropArmed, setBackdropArmed] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setBackdropArmed(true);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      setBackdropArmed(false);
    };
  }, []);

  const images = useMemo(
    () => [...project.imageUrls.keys()].sort((a, b) => a.localeCompare(b)),
    [project.imageUrls],
  );

  const [previewFilename, setPreviewFilename] = useState(() =>
    resolveInitialPreview(images, selectedFilename),
  );

  useEffect(() => {
    if (previewFilename && images.includes(previewFilename)) return;
    setPreviewFilename(resolveInitialPreview(images, selectedFilename));
  }, [images, previewFilename, selectedFilename]);

  const importAllowed = canImportImages(project) && Boolean(onImport);
  const clipboardAllowed =
    importAllowed && Boolean(onImportFromClipboard) && canReadClipboardImages();

  const previewSrc = previewFilename ? project.imageUrls.get(previewFilename) : undefined;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter' && previewFilename && !importing) {
        const src = project.imageUrls.get(previewFilename);
        onSelect(previewFilename, src);
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [importing, onClose, onSelect, previewFilename, project.imageUrls]);

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

  const confirmSelection = () => {
    if (!previewFilename) return;
    onSelect(previewFilename, previewSrc);
    onClose();
  };

  const runDelete = async () => {
    if (!previewFilename || !onDeleteImage || deleting || importing) return;
    setImportError(null);
    setDeleting(true);
    try {
      const result = await onDeleteImage(previewFilename);
      if (!result.ok) {
        setImportError(result.error);
        return;
      }
      const remaining = images.filter((name) => name !== previewFilename);
      setPreviewFilename(remaining[0] ?? '');
    } finally {
      setDeleting(false);
    }
  };

  const handleBackdropClose = () => {
    if (!backdropArmed) return;
    onClose();
  };

  return (
    <div
      className={`picker-overlay${elevated ? ' picker-overlay-elevated' : ''}`}
      role="presentation"
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        handleBackdropClose();
      }}
    >
      <div
        className="picker-dialog picker-dialog-image"
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

        <div className="picker-body picker-image-picker-body">
          {images.length === 0 ? (
            <p className="picker-empty">No images found in docs/</p>
          ) : (
            <div className="picker-image-picker-layout">
              <div className="picker-image-list-panel">
                <ul className="picker-image-list-compact" role="listbox" aria-label="Project images">
                  {images.map((name) => {
                    const src = project.imageUrls.get(name);
                    const isActive = previewFilename === name;
                    return (
                      <li key={name} role="presentation">
                        <button
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          className={`picker-image-list-item${isActive ? ' active' : ''}`}
                          onClick={() => setPreviewFilename(name)}
                        >
                          {src ? (
                            <img src={src} alt="" className="picker-image-list-thumb" />
                          ) : (
                            <span
                              className="picker-image-list-thumb picker-image-thumb-missing"
                              aria-hidden
                            >
                              🖼
                            </span>
                          )}
                          <span className="picker-image-list-name">{name}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="picker-image-preview-panel">
                {previewFilename ? (
                  <>
                    <div
                      className="picker-image-preview-stage"
                      tabIndex={0}
                      aria-label={`Preview of ${previewFilename}`}
                    >
                      {previewSrc ? (
                        <img
                          src={previewSrc}
                          alt={previewFilename}
                          className="picker-image-preview-img"
                          draggable={false}
                        />
                      ) : (
                        <span className="picker-image-preview-missing">Image unavailable</span>
                      )}
                    </div>
                    <p className="picker-image-preview-filename">{previewFilename}</p>
                  </>
                ) : (
                  <div className="picker-image-preview-empty">Select an image to preview</div>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="picker-footer picker-footer-with-actions">
          <div className="picker-footer-text">
            <span>Preview an image on the right, then confirm your selection.</span>
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
              className="picker-select-btn"
              disabled={!previewFilename || importing || deleting}
              onClick={confirmSelection}
            >
              Select image
            </button>
            {onDeleteImage && (
              <button
                type="button"
                className="picker-delete-btn"
                disabled={!previewFilename || importing || deleting}
                onClick={() => void runDelete()}
                title="Delete image from project docs/"
              >
                {deleting ? 'Deleting…' : 'Delete image'}
              </button>
            )}
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
