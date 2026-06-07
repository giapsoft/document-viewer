import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Component, ComponentStatus, ComponentType, LoadedProject } from '../types';
import type { ImportImageResult } from '../lib/importImage';
import { MarkdownPreview } from './MarkdownPreview';
import { ImagePickerDialog } from './ImagePickerDialog';
import { ConfirmDialog } from './PageFileDialog';
import { Toast } from './Toast';

const TYPES: ComponentType[] = ['header', 'title', 'body', 'listItem', 'img', 'md'];
const STATUSES: ComponentStatus[] = ['undefined', 'pending', 'working', 'done', 'blocked'];
const TOAST_MS = 2000;

interface OptionToggleGroupProps<T extends string> {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}

function OptionToggleGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: OptionToggleGroupProps<T>) {
  return (
    <div className="content-editor-option-group" role="radiogroup" aria-label={label}>
      <span className="content-editor-sidebar-label">{label}</span>
      <div className="content-editor-option-list">
        {options.map((option) => {
          const active = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={active}
              className={`content-editor-option-btn${active ? ' content-editor-option-btn-active' : ''}`}
              onClick={() => onChange(option)}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface ContentEditorDialogProps {
  project: LoadedProject;
  component: Component;
  listBadge?: ReactNode;
  canDelete: boolean;
  value: string;
  onPatch: (patch: Partial<Omit<Component, 'id'>>) => void;
  onCommit: (value: string) => void;
  onDelete: () => void;
  onClose: () => void;
  onImportImage?: () => Promise<ImportImageResult>;
  onImportImageFromClipboard?: () => Promise<ImportImageResult>;
}

export function ContentEditorDialog({
  project,
  component,
  listBadge,
  canDelete,
  value,
  onPatch,
  onCommit,
  onDelete,
  onClose,
  onImportImage,
  onImportImageFromClipboard,
}: ContentEditorDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(value);
  const [toast, setToast] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const draftRef = useRef(draft);
  const valueRef = useRef(value);
  const isMd = component.type === 'md';
  const isImg = component.type === 'img';
  const hasTextEditor = isContentEditableType(component.type);

  draftRef.current = draft;
  valueRef.current = value;

  useEffect(() => {
    setDraft(value);
  }, [component.id, component.type, value]);

  const handleClose = useCallback(() => {
    onClose();
    if (hasTextEditor && draftRef.current !== valueRef.current) {
      onCommit(draftRef.current);
    }
  }, [hasTextEditor, onCommit, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pickerOpen && !confirmDelete) {
        event.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmDelete, handleClose, pickerOpen]);

  useEffect(() => {
    if (hasTextEditor) {
      textareaRef.current?.focus();
    }
  }, [component.id, component.type, hasTextEditor]);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(component.id);
      setToast('Copied');
      window.setTimeout(() => setToast(null), TOAST_MS);
    } catch {
      setToast('Copy failed');
      window.setTimeout(() => setToast(null), TOAST_MS);
    }
  };

  const imgSrc = isImg ? project.imageUrls.get(component.content.trim()) : undefined;
  const imgLabel = component.content.trim() || 'Select image';

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
              Edit component
            </h2>
            <button
              type="button"
              className="content-editor-component-id content-editor-component-id-btn"
              onClick={() => void handleCopyId()}
              title="Copy component id"
            >
              {component.id}
            </button>
            {listBadge}
          </div>

          <div className="content-editor-header-actions">
            <button
              type="button"
              className="content-editor-delete-btn"
              disabled={!canDelete}
              onClick={() => setConfirmDelete(true)}
              title={canDelete ? 'Delete component' : 'Cannot delete the only component on this page'}
            >
              Delete
            </button>
            <button
              type="button"
              className="content-editor-done-btn"
              onClick={handleClose}
            >
              Done
            </button>
          </div>
        </header>

        <div className="content-editor-main">
          <aside className="content-editor-sidebar" aria-label="Component properties">
            <OptionToggleGroup
              label="Type"
              options={TYPES}
              value={component.type}
              onChange={(type) => onPatch({ type })}
            />
            <OptionToggleGroup
              label="Status"
              options={STATUSES}
              value={component.status}
              onChange={(status) => onPatch({ status })}
            />
          </aside>

          <div className={`content-editor-body ${isMd ? 'content-editor-body-split' : ''}`}>
            {isImg ? (
              <div className="content-editor-img-pane">
                <div className="content-editor-pane-label">Image</div>
                <div className="content-editor-img-body">
                  {imgSrc ? (
                    <img src={imgSrc} alt={component.content} className="content-editor-img-preview" />
                  ) : (
                    <p className="content-editor-preview-empty">No image selected</p>
                  )}
                  <button
                    type="button"
                    className="content-editor-img-picker-btn"
                    onClick={() => setPickerOpen(true)}
                  >
                    {imgLabel}
                  </button>
                </div>
              </div>
            ) : isMd ? (
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

      {toast ? <Toast message={toast} /> : null}

      {pickerOpen && isImg && (
        <ImagePickerDialog
          elevated
          project={project}
          selectedFilename={component.content}
          onSelect={(filename) => onPatch({ content: filename })}
          onClose={() => setPickerOpen(false)}
          onImport={onImportImage}
          onImportFromClipboard={onImportImageFromClipboard}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          elevated
          title="Delete component"
          message={`Delete component "${component.id}"? It will be removed from this page and from all groups.`}
          confirmLabel="Delete"
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            onClose();
            onDelete();
          }}
        />
      )}
    </div>
  );
}

export function isContentEditableType(type: ComponentType): boolean {
  return type !== 'img';
}
