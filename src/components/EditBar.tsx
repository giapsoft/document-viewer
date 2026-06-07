import { useState, type ReactNode } from 'react';
import type {
  Component,
  ComponentStatus,
  ComponentType,
  LoadedProject,
  SelectionState,
} from '../types';
import { findComponent } from '../lib/projectMutations';
import type { ImportImageResult } from '../lib/importImage';
import { ContentEditorDialog, type ContentEditorDraft } from './ContentEditorDialog';
import { ImagePickerDialog } from './ImagePickerDialog';
import { ConfirmDialog } from './PageFileDialog';
import { Toast } from './Toast';

const TYPES: ComponentType[] = ['header', 'title', 'body', 'listItem', 'img', 'md', 'action'];
const STATUSES: ComponentStatus[] = ['undefined', 'pending', 'working', 'done', 'blocked'];

const TOAST_MS = 2000;

function ComponentIdHeader({ componentId, listBadge }: { componentId: string; listBadge?: ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(componentId);
      setToast('Copied');
      window.setTimeout(() => setToast(null), TOAST_MS);
    } catch {
      setToast('Copy failed');
      window.setTimeout(() => setToast(null), TOAST_MS);
    }
  };

  return (
    <>
      <span className="edit-bar-header-id">
        <span className="edit-bar-header-id-label">ID</span>
        <button
          type="button"
          className="edit-bar-component-id"
          onClick={() => void handleCopyId()}
          title="Copy component id"
        >
          {componentId}
        </button>
        {listBadge}
      </span>
      {toast ? <Toast message={toast} /> : null}
    </>
  );
}

interface EditBarProps {
  project: LoadedProject;
  selection: SelectionState | null;
  onUpdate: (
    pageFile: string,
    componentId: string,
    patch: Partial<Component>,
  ) => void;
  onInsertAbove: (pageFile: string, anchorComponentId: string) => void;
  onInsertBelow: (pageFile: string, anchorComponentId: string) => void;
  onDeleteComponent: (pageFile: string, componentId: string) => void;
  onUpdateMdContent: (componentId: string, content: string) => void;
  onImportImage?: () => Promise<ImportImageResult>;
  onImportImageFromClipboard?: () => Promise<ImportImageResult>;
  onDeleteProjectImage?: (filename: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onContentEditorOpenChange: (open: boolean) => void;
}

export function EditBar({
  project,
  selection,
  onUpdate,
  onInsertAbove,
  onInsertBelow,
  onDeleteComponent,
  onUpdateMdContent,
  onImportImage,
  onImportImageFromClipboard,
  onDeleteProjectImage,
  onContentEditorOpenChange,
}: EditBarProps) {
  const [bodyExpanded, setBodyExpanded] = useState(false);

  if (!selection) {
    return (
      <footer className="edit-bar edit-bar-empty">
        <span>Select a component to edit</span>
      </footer>
    );
  }

  const located = findComponent(project, selection.componentId);
  if (!located) {
    return (
      <footer className="edit-bar edit-bar-empty">
        <span>Component not found</span>
      </footer>
    );
  }

  const { pageFile, component } = located;
  const page = project.pages.find((p) => p.fileName === pageFile);
  const canDelete = (page?.components.length ?? 0) > 1;

  return (
    <EditBarForm
      key={component.id}
      project={project}
      selection={selection}
      pageFile={pageFile}
      component={component}
      canDelete={canDelete}
      bodyExpanded={bodyExpanded}
      onToggleBodyExpanded={() => setBodyExpanded((value) => !value)}
      onUpdate={onUpdate}
      onInsertAbove={onInsertAbove}
      onInsertBelow={onInsertBelow}
      onDeleteComponent={onDeleteComponent}
      onUpdateMdContent={onUpdateMdContent}
      onImportImage={onImportImage}
      onImportImageFromClipboard={onImportImageFromClipboard}
      onDeleteProjectImage={onDeleteProjectImage}
      onContentEditorOpenChange={onContentEditorOpenChange}
    />
  );
}

interface EditBarFormProps {
  project: LoadedProject;
  selection: SelectionState;
  pageFile: string;
  component: Component;
  canDelete: boolean;
  bodyExpanded: boolean;
  onToggleBodyExpanded: () => void;
  onUpdate: EditBarProps['onUpdate'];
  onInsertAbove: EditBarProps['onInsertAbove'];
  onInsertBelow: EditBarProps['onInsertBelow'];
  onDeleteComponent: EditBarProps['onDeleteComponent'];
  onUpdateMdContent: EditBarProps['onUpdateMdContent'];
  onImportImage?: EditBarProps['onImportImage'];
  onImportImageFromClipboard?: EditBarProps['onImportImageFromClipboard'];
  onDeleteProjectImage?: EditBarProps['onDeleteProjectImage'];
  onContentEditorOpenChange: (open: boolean) => void;
}

function EditBarForm({
  project,
  selection,
  pageFile,
  component,
  canDelete,
  bodyExpanded,
  onToggleBodyExpanded,
  onUpdate,
  onInsertAbove,
  onInsertBelow,
  onDeleteComponent,
  onUpdateMdContent,
  onImportImage,
  onImportImageFromClipboard,
  onDeleteProjectImage,
  onContentEditorOpenChange,
}: EditBarFormProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  const openFullscreen = () => {
    setFullscreenOpen(true);
    onContentEditorOpenChange(true);
  };

  const closeFullscreen = () => {
    setFullscreenOpen(false);
    onContentEditorOpenChange(false);
  };

  const patch = (changes: Partial<Omit<Component, 'id'>>) => {
    onUpdate(pageFile, component.id, changes);
  };

  const mdContent = project.mdFiles.get(component.id) ?? '';
  const isAction = component.type === 'action';
  const imgFilename = component.content.trim();
  const imgLabel = imgFilename || 'select image';

  const handleFullscreenDone = (draft: ContentEditorDraft) => {
    const patch: Partial<Component> = {};
    if (draft.type !== component.type) patch.type = draft.type;
    if (draft.status !== component.status) patch.status = draft.status;
    if (draft.content !== component.content) patch.content = draft.content;
    if (Object.keys(patch).length > 0) {
      onUpdate(pageFile, component.id, patch);
    }
    if (draft.type === 'md') {
      const currentMd = project.mdFiles.get(component.id) ?? '';
      if (draft.mdContent !== currentMd) {
        onUpdateMdContent(component.id, draft.mdContent);
      }
    }
  };

  const listBadge =
    selection.matchingGroupIndices.length > 1 ? (
      <span className="edit-bar-list-badge">{selection.matchingGroupIndices.length} lists</span>
    ) : null;
  const fullscreenListBadge =
    selection.matchingGroupIndices.length > 1 ? (
      <span className="content-editor-list-badge">
        {selection.matchingGroupIndices.length} lists
      </span>
    ) : null;

  const hasBodyEditor = component.type !== 'img' && !isAction;

  const handleExpandAreaClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!hasBodyEditor) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, select, textarea, input')) return;
    onToggleBodyExpanded();
  };

  return (
    <footer className={`edit-bar ${bodyExpanded ? 'edit-bar-body-expanded' : ''}`}>
      <div className="edit-bar-inner">
        <div
          className={`edit-bar-row${hasBodyEditor ? ' edit-bar-row-expandable' : ''}`}
          onClick={handleExpandAreaClick}
        >
          {hasBodyEditor && (
            <button
              type="button"
              className="edit-bar-toggle"
              onClick={onToggleBodyExpanded}
              aria-expanded={bodyExpanded}
              title={bodyExpanded ? 'Collapse content' : 'Expand content'}
            >
              {bodyExpanded ? '▼' : '▶'}
            </button>
          )}
          <span className="edit-bar-icon" title="Edit component" aria-hidden>
            ✎
          </span>
          <span className="edit-bar-meta">
            <ComponentIdHeader componentId={component.id} listBadge={listBadge} />
          </span>
          <div className="edit-bar-actions">
            <button
              type="button"
              className="edit-bar-icon-btn"
              onClick={openFullscreen}
              title="Full screen editor"
            >
              ⛶
            </button>
            <button
              type="button"
              className="edit-bar-icon-btn"
              onClick={() => onInsertAbove(pageFile, component.id)}
              title="Insert above"
            >
              ↑
            </button>
            <button
              type="button"
              className="edit-bar-icon-btn"
              onClick={() => onInsertBelow(pageFile, component.id)}
              title="Insert below"
            >
              ↓
            </button>
            <button
              type="button"
              className="edit-bar-icon-btn edit-bar-icon-btn-danger"
              disabled={!canDelete}
              onClick={() => setConfirmDelete(true)}
              title={canDelete ? 'Delete component' : 'Cannot delete the only component on this page'}
            >
              ×
            </button>
          </div>
          <div className="edit-bar-fields">
            <select
              className="edit-bar-input edit-bar-input-type"
              value={component.type}
              title="Type"
              onChange={(e) => patch({ type: e.target.value as ComponentType })}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              className="edit-bar-input edit-bar-input-status"
              value={component.status}
              title="Status"
              onChange={(e) => patch({ status: e.target.value as ComponentStatus })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {component.type === 'img' && (
              <button
                type="button"
                className="edit-bar-input edit-bar-file-picker"
                onClick={() => setPickerOpen(true)}
                title="Image file"
              >
                {imgLabel}
              </button>
            )}
            {isAction && (
              <button
                type="button"
                className="edit-bar-input edit-bar-action-open"
                onClick={openFullscreen}
                title="Open full editor to configure action"
              >
                Edit action…
              </button>
            )}
          </div>
        </div>
        {bodyExpanded && hasBodyEditor && component.type !== 'md' && (
          <textarea
            className="edit-bar-input edit-bar-input-content"
            rows={3}
            value={component.content}
            title="Content"
            placeholder="Content…"
            onChange={(e) => patch({ content: e.target.value })}
          />
        )}
        {bodyExpanded && component.type === 'md' && (
          <textarea
            className="edit-bar-input edit-bar-input-content edit-bar-input-md"
            rows={8}
            value={mdContent}
            title="Markdown"
            placeholder="Markdown…"
            onChange={(e) => onUpdateMdContent(component.id, e.target.value)}
          />
        )}
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete component"
          message={`Delete component "${component.id}"? It will be removed from this page and from all groups.`}
          confirmLabel="Delete"
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => onDeleteComponent(pageFile, component.id)}
        />
      )}

      {pickerOpen && component.type === 'img' && (
        <ImagePickerDialog
          project={project}
          selectedFilename={component.content}
          onSelect={(filename) => patch({ content: filename })}
          onClose={() => setPickerOpen(false)}
          onImport={onImportImage}
          onImportFromClipboard={onImportImageFromClipboard}
          onDeleteImage={onDeleteProjectImage}
        />
      )}

      {fullscreenOpen && (
        <ContentEditorDialog
          project={project}
          component={component}
          mdContent={mdContent}
          listBadge={fullscreenListBadge}
          canDelete={canDelete}
          onDone={handleFullscreenDone}
          onCancel={closeFullscreen}
          onDelete={() => onDeleteComponent(pageFile, component.id)}
          onImportImage={onImportImage}
          onImportImageFromClipboard={onImportImageFromClipboard}
          onDeleteProjectImage={onDeleteProjectImage}
        />
      )}
    </footer>
  );
}
