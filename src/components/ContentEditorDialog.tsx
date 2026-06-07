import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType } from '../types';
import { MarkdownPreview } from './MarkdownPreview';

interface ContentEditorDialogProps {
  componentId: string;
  componentType: ComponentType;
  value: string;
  onCommit: (value: string) => void;
  onClose: () => void;
}

export function ContentEditorDialog({
  componentId,
  componentType,
  value,
  onCommit,
  onClose,
}: ContentEditorDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  const isMd = componentType === 'md';

  draftRef.current = draft;
  valueRef.current = value;

  useEffect(() => {
    setDraft(value);
  }, [componentId, value]);

  const handleClose = useCallback(() => {
    onClose();
    if (draftRef.current !== valueRef.current) {
      onCommit(draftRef.current);
    }
  }, [onCommit, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleClose]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [componentId]);

  return (
    <div className="content-editor-overlay" role="presentation">
      <div
        className="content-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="content-editor-title"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="content-editor-header">
          <div className="content-editor-header-start">
            <h2 id="content-editor-title" className="content-editor-title">
              Edit content
            </h2>
            <code className="content-editor-component-id">{componentId}</code>
            <span className="content-editor-type-badge">{componentType}</span>
          </div>
          <button
            type="button"
            className="content-editor-close-btn"
            onClick={handleClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className={`content-editor-body ${isMd ? 'content-editor-body-split' : ''}`}>
          {isMd ? (
            <>
              <div className="content-editor-pane content-editor-edit-pane">
                <div className="content-editor-pane-label">Markdown</div>
                <textarea
                  ref={textareaRef}
                  className="content-editor-textarea"
                  value={draft}
                  placeholder="Markdown…"
                  spellCheck={false}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </div>
              <div className="content-editor-pane content-editor-preview-pane">
                <div className="content-editor-pane-label">Preview</div>
                <div className="content-editor-preview-scroll">
                  {draft.trim() ? (
                    <MarkdownPreview source={draft} className="content-editor-preview" />
                  ) : (
                    <p className="content-editor-preview-empty">Nothing to preview yet.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <textarea
              ref={textareaRef}
              className="content-editor-textarea content-editor-textarea-full"
              value={draft}
              placeholder="Content…"
              onChange={(event) => setDraft(event.target.value)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function isContentEditableType(type: ComponentType): boolean {
  return type !== 'img';
}
