import { useState, type CSSProperties, type ReactNode } from 'react';
import type {
  Component,
  ComponentStatus,
  ComponentType,
  LoadedProject,
  SelectionState,
} from '../types';
import { findComponent } from '../lib/projectMutations';
import type { ImportImageResult } from '../lib/importImage';
import { useEditBarShortcuts } from '../hooks/useEditBarShortcuts';
import { ContentEditorDialog, type ContentEditorDraft } from './ContentEditorDialog';
import { ImagePickerDialog } from './ImagePickerDialog';
import { ConfirmDialog } from './PageFileDialog';
import { Toast } from './Toast';

const TYPES: ComponentType[] = ['header', 'title', 'body', 'listItem', 'img', 'md', 'action'];
const STATUSES: ComponentStatus[] = ['undefined', 'pending', 'working', 'done', 'blocked'];

const TOAST_MS = 2000;

function EditBarIconButton({
  title,
  shortcut,
  onClick,
  disabled,
  danger,
  children,
}: {
  title: string;
  shortcut: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`edit-bar-tool-btn${danger ? ' edit-bar-tool-btn-danger' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={`${title} (${shortcut})`}
    >
      <span className="edit-bar-tool-icon" aria-hidden>
        {children}
      </span>
      <kbd className="edit-bar-tool-key">{shortcut}</kbd>
    </button>
  );
}

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
  shortcutsEnabled?: boolean;
  readShortcutsEnabled?: boolean;
  onSelectAdjacent?: (direction: 'up' | 'down') => void;
  onToggleRead?: () => void;
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
  shortcutsEnabled = true,
  readShortcutsEnabled = false,
  onSelectAdjacent,
  onToggleRead,
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
      shortcutsEnabled={shortcutsEnabled}
      readShortcutsEnabled={readShortcutsEnabled}
      onSelectAdjacent={onSelectAdjacent}
      onToggleRead={onToggleRead}
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
  shortcutsEnabled: boolean;
  readShortcutsEnabled: boolean;
  onSelectAdjacent?: (direction: 'up' | 'down') => void;
  onToggleRead?: () => void;
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
  shortcutsEnabled,
  readShortcutsEnabled,
  onSelectAdjacent,
  onToggleRead,
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
  const statusStyle = project.styles.statuses[component.status];

  const handleExpandAreaClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!hasBodyEditor) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, select, textarea, input')) return;
    onToggleBodyExpanded();
  };

  useEditBarShortcuts({
    enabled: shortcutsEnabled && !fullscreenOpen && !confirmDelete && !pickerOpen,
    status: component.status,
    canDelete,
    readShortcutsEnabled,
    onOpenFullscreen: openFullscreen,
    onSelectAdjacent: (direction) => onSelectAdjacent?.(direction),
    onToggleRead: () => onToggleRead?.(),
    onInsertAbove: () => onInsertAbove(pageFile, component.id),
    onInsertBelow: () => onInsertBelow(pageFile, component.id),
    onDelete: () => setConfirmDelete(true),
    onStatusChange: (status) => patch({ status }),
  });

  return (
    <footer
      className={`edit-bar edit-bar-has-selection edit-bar-status-${component.status}${bodyExpanded ? ' edit-bar-body-expanded' : ''}`}
      style={{ '--edit-bar-status-bg': statusStyle.backgroundColor } as CSSProperties}
    >
      <div className="edit-bar-inner">
        <div
          className={`edit-bar-toolbar${hasBodyEditor ? ' edit-bar-toolbar-expandable' : ''}`}
          onClick={handleExpandAreaClick}
        >
          <div className="edit-bar-identity">
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
            <div className="edit-bar-identity-text">
              <span className="edit-bar-identity-label">Component</span>
              <ComponentIdHeader componentId={component.id} listBadge={listBadge} />
            </div>
          </div>

          <div className="edit-bar-properties">
            <label className="edit-bar-field">
              <span className="edit-bar-field-label">Type</span>
              <select
                className="edit-bar-select edit-bar-select-type"
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
            </label>

            <label className="edit-bar-field">
              <span className="edit-bar-field-label">Status</span>
              <span className="edit-bar-field-row">
                <select
                  className={`edit-bar-select edit-bar-select-status edit-bar-select-status-${component.status}`}
                  value={component.status}
                  title="Status (← →)"
                  style={{ backgroundColor: statusStyle.backgroundColor }}
                  onChange={(e) => patch({ status: e.target.value as ComponentStatus })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <kbd className="edit-bar-key-hint" aria-hidden>
                  ← →
                </kbd>
              </span>
            </label>

            {component.type === 'img' && (
              <label className="edit-bar-field edit-bar-field-grow">
                <span className="edit-bar-field-label">Image</span>
                <button
                  type="button"
                  className="edit-bar-aux-btn"
                  onClick={() => setPickerOpen(true)}
                  title="Image file"
                >
                  {imgLabel}
                </button>
              </label>
            )}

            {isAction && (
              <label className="edit-bar-field">
                <span className="edit-bar-field-label">Action</span>
                <button
                  type="button"
                  className="edit-bar-aux-btn edit-bar-aux-btn-primary"
                  onClick={openFullscreen}
                  title="Open full editor to configure action (E)"
                >
                  <span>Edit action</span>
                  <kbd className="edit-bar-key-hint">E</kbd>
                </button>
              </label>
            )}
          </div>

          <div className="edit-bar-actions" role="toolbar" aria-label="Component actions">
            <EditBarIconButton title="Full screen editor" shortcut="E" onClick={openFullscreen}>
              ⛶
            </EditBarIconButton>
            <span className="edit-bar-actions-divider" aria-hidden />
            <EditBarIconButton
              title="Insert above"
              shortcut="Alt+↑"
              onClick={() => onInsertAbove(pageFile, component.id)}
            >
              ↑
            </EditBarIconButton>
            <EditBarIconButton
              title="Insert below"
              shortcut="Alt+↓"
              onClick={() => onInsertBelow(pageFile, component.id)}
            >
              ↓
            </EditBarIconButton>
            <span className="edit-bar-actions-divider" aria-hidden />
            <EditBarIconButton
              title="Delete component"
              shortcut="Del"
              onClick={() => setConfirmDelete(true)}
              disabled={!canDelete}
              danger
            >
              ×
            </EditBarIconButton>
          </div>
        </div>

        {bodyExpanded && hasBodyEditor && component.type !== 'md' && (
          <div className="edit-bar-body-pane">
            <span className="edit-bar-field-label">Content</span>
            <textarea
              className="edit-bar-textarea"
              rows={4}
              value={component.content}
              title="Content"
              placeholder="Content…"
              onChange={(e) => patch({ content: e.target.value })}
            />
          </div>
        )}
        {bodyExpanded && component.type === 'md' && (
          <div className="edit-bar-body-pane">
            <span className="edit-bar-field-label">Markdown</span>
            <textarea
              className="edit-bar-textarea edit-bar-textarea-md"
              rows={8}
              value={mdContent}
              title="Markdown"
              placeholder="Markdown…"
              onChange={(e) => onUpdateMdContent(component.id, e.target.value)}
            />
          </div>
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
