import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Component, ComponentStatus, ComponentType, LoadedProject } from '../types';
import type { ImportImageResult } from '../lib/importImage';
import { MarkdownPreview } from './MarkdownPreview';
import { ImagePickerDialog } from './ImagePickerDialog';
import { ConfirmDialog } from './PageFileDialog';
import { Toast } from './Toast';
import { ActionEditor, type ActionEditorHandle, type ActionImagePickerTarget } from './ActionEditor';
import { ComponentTypeBadge, getComponentTypeLabel } from './ComponentTypeIcon';

const TYPES: ComponentType[] = ['header', 'title', 'body', 'listItem', 'img', 'md', 'action'];
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

function ComponentTypeToggleGroup({
  value,
  onChange,
}: {
  value: ComponentType;
  onChange: (value: ComponentType) => void;
}) {
  return (
    <div className="content-editor-option-group" role="radiogroup" aria-label="Type">
      <span className="content-editor-sidebar-label">Type</span>
      <div className="content-editor-option-list">
        {TYPES.map((type) => {
          const active = value === type;
          return (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={getComponentTypeLabel(type)}
              className={`content-editor-option-btn content-editor-option-btn-type${active ? ' content-editor-option-btn-active' : ''}`}
              onClick={() => onChange(type)}
            >
              <ComponentTypeBadge type={type} showLabel iconSize={15} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type ContentEditorDraft = {
  type: ComponentType;
  status: ComponentStatus;
  content: string;
  mdContent: string;
};

function createEditorDraft(component: Component, mdContent: string): ContentEditorDraft {
  return {
    type: component.type,
    status: component.status,
    content: component.content,
    mdContent,
  };
}

function draftsEqual(a: ContentEditorDraft, b: ContentEditorDraft): boolean {
  return (
    a.type === b.type &&
    a.status === b.status &&
    a.content === b.content &&
    a.mdContent === b.mdContent
  );
}

interface ContentEditorDialogProps {
  project: LoadedProject;
  component: Component;
  mdContent: string;
  listBadge?: ReactNode;
  canDelete: boolean;
  onDone: (draft: ContentEditorDraft) => void;
  onCancel: () => void;
  onDelete: () => void;
  onImportImage?: () => Promise<ImportImageResult>;
  onImportImageFromClipboard?: () => Promise<ImportImageResult>;
  onDeleteProjectImage?: (filename: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}

export function ContentEditorDialog({
  project,
  component,
  mdContent,
  listBadge,
  canDelete,
  onDone,
  onCancel,
  onDelete,
  onImportImage,
  onImportImageFromClipboard,
  onDeleteProjectImage,
}: ContentEditorDialogProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const actionEditorRef = useRef<ActionEditorHandle>(null);
  const [draft, setDraft] = useState<ContentEditorDraft>(() => createEditorDraft(component, mdContent));
  const initialDraftRef = useRef(draft);
  const [toast, setToast] = useState<string | null>(null);
  const [actionImagePicker, setActionImagePicker] = useState<{
    target: ActionImagePickerTarget;
    selectedFilename: string;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isMd = draft.type === 'md';
  const isImg = draft.type === 'img';
  const isAction = draft.type === 'action';
  const hasTextEditor = isContentEditableType(draft.type);

  useEffect(() => {
    const next = createEditorDraft(component, mdContent);
    setDraft(next);
    initialDraftRef.current = next;
  }, [component.id, component.type, component.status, component.content, mdContent]);

  const isDraftDirty = useCallback(
    () => !draftsEqual(draft, initialDraftRef.current),
    [draft],
  );

  const handleCancel = useCallback(() => {
    if (isDraftDirty()) {
      const discard = window.confirm('Discard unsaved changes?');
      if (!discard) return;
    }
    onCancel();
  }, [isDraftDirty, onCancel]);

  const handleDone = useCallback(() => {
    onCancel();
    onDone(draft);
  }, [draft, onCancel, onDone]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (actionImagePicker || confirmDelete) return;

      if (event.key === 'Escape') {
        event.stopPropagation();
        handleCancel();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        event.stopPropagation();
        handleDone();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actionImagePicker, confirmDelete, handleCancel, handleDone]);

  useEffect(() => {
    if (hasTextEditor) {
      textareaRef.current?.focus();
    }
  }, [component.id, draft.type, hasTextEditor]);

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

  const patchDraft = (patch: Partial<ContentEditorDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

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
              className="content-editor-cancel-btn"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="content-editor-done-btn"
              onClick={handleDone}
              title="Save and close (Ctrl+S)"
            >
              <span>Done</span>
              <kbd className="content-editor-done-key">Ctrl+S</kbd>
            </button>
          </div>
        </header>

        <div className="content-editor-main">
          <aside className="content-editor-sidebar" aria-label="Component properties">
            <ComponentTypeToggleGroup
              value={draft.type}
              onChange={(type) => patchDraft({ type })}
            />
            <OptionToggleGroup
              label="Status"
              options={STATUSES}
              value={draft.status}
              onChange={(status) => patchDraft({ status })}
            />
          </aside>

          <div className={`content-editor-body${isMd ? ' content-editor-body-split' : ''}${isAction ? ' content-editor-body-action' : ''}${isImg ? ' content-editor-body-img' : ''}`}>
            {isAction ? (
              <ActionEditor
                ref={actionEditorRef}
                project={project}
                content={draft.content}
                onChange={(content) => patchDraft({ content })}
                onRequestImagePicker={(target, selectedFilename) => {
                  setActionImagePicker({ target, selectedFilename });
                }}
              />
            ) : isImg ? (
              <ImagePickerDialog
                embedded
                project={project}
                selectedFilename={draft.content}
                onSelect={(filename) => patchDraft({ content: filename })}
                onClose={() => {}}
                onImport={onImportImage}
                onImportFromClipboard={onImportImageFromClipboard}
                onDeleteImage={onDeleteProjectImage}
              />
            ) : isMd ? (
              <>
                <div className="content-editor-pane content-editor-edit-pane">
                  <div className="content-editor-pane-label">Markdown</div>
                  <textarea
                    ref={textareaRef}
                    className="content-editor-textarea"
                    value={draft.mdContent}
                    placeholder="Markdown…"
                    spellCheck={false}
                    onChange={(event) => patchDraft({ mdContent: event.target.value })}
                  />
                </div>
                <div className="content-editor-pane content-editor-preview-pane">
                  <div className="content-editor-pane-label">Preview</div>
                  <div className="content-editor-preview-scroll">
                    {draft.mdContent.trim() ? (
                      <MarkdownPreview source={draft.mdContent} className="content-editor-preview" />
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
                value={draft.content}
                placeholder="Content…"
                onChange={(event) => patchDraft({ content: event.target.value })}
              />
            )}
          </div>
        </div>
      </div>

      {toast ? <Toast message={toast} /> : null}

      {actionImagePicker && isAction && (
        <ImagePickerDialog
          elevated
          project={project}
          selectedFilename={actionImagePicker.selectedFilename}
          onSelect={(filename, previewSrc) => {
            actionEditorRef.current?.applyImagePick(
              actionImagePicker.target,
              filename,
              previewSrc,
            );
            setActionImagePicker(null);
          }}
          onClose={() => setActionImagePicker(null)}
          onImport={onImportImage}
          onImportFromClipboard={onImportImageFromClipboard}
          onDeleteImage={onDeleteProjectImage}
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
            onCancel();
            onDelete();
          }}
        />
      )}
    </div>
  );
}

export function isContentEditableType(type: ComponentType): boolean {
  return type !== 'img' && type !== 'action';
}
