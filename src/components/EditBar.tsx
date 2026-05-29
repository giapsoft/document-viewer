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
import { ImagePickerDialog } from './ImagePickerDialog';
import { RefTargetPickerDialog } from './RefTargetPickerDialog';
import { ConfirmDialog } from './PageFileDialog';

const TYPES: ComponentType[] = ['header', 'title', 'body', 'listItem', 'img', 'md', 'ref'];
const STATUSES: ComponentStatus[] = ['undefined', 'pending', 'working', 'done', 'blocked'];

function ComponentIdHeader({ componentId, listBadge }: { componentId: string; listBadge?: ReactNode }) {
  return (
    <span className="edit-bar-header-id">
      <span className="edit-bar-header-id-label">ID</span>
      <code className="edit-bar-component-id">{componentId}</code>
      {listBadge}
    </span>
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
}: EditBarProps) {
  const [expanded, setExpanded] = useState(true);

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
      expanded={expanded}
      onToggleExpanded={() => setExpanded((value) => !value)}
      onUpdate={onUpdate}
      onInsertAbove={onInsertAbove}
      onInsertBelow={onInsertBelow}
      onDeleteComponent={onDeleteComponent}
      onUpdateMdContent={onUpdateMdContent}
      onImportImage={onImportImage}
      onImportImageFromClipboard={onImportImageFromClipboard}
    />
  );
}

interface EditBarFormProps {
  project: LoadedProject;
  selection: SelectionState;
  pageFile: string;
  component: Component;
  canDelete: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onUpdate: EditBarProps['onUpdate'];
  onInsertAbove: EditBarProps['onInsertAbove'];
  onInsertBelow: EditBarProps['onInsertBelow'];
  onDeleteComponent: EditBarProps['onDeleteComponent'];
  onUpdateMdContent: EditBarProps['onUpdateMdContent'];
  onImportImage?: EditBarProps['onImportImage'];
  onImportImageFromClipboard?: EditBarProps['onImportImageFromClipboard'];
}

function EditBarForm({
  project,
  selection,
  pageFile,
  component,
  canDelete,
  expanded,
  onToggleExpanded,
  onUpdate,
  onInsertAbove,
  onInsertBelow,
  onDeleteComponent,
  onUpdateMdContent,
  onImportImage,
  onImportImageFromClipboard,
}: EditBarFormProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const patch = (changes: Partial<Omit<Component, 'id'>>) => {
    onUpdate(pageFile, component.id, changes);
  };

  const refTargetId = component.content.trim();
  const refTargetValid = component.type === 'ref' && refTargetId
    ? findComponent(project, refTargetId)
    : null;
  const refTargetLabel = refTargetValid ? refTargetId : 'Select component';

  const imgFilename = component.content.trim();
  const imgLabel = imgFilename || 'select image';
  const mdContent = project.mdFiles.get(component.id) ?? '';

  const listBadge =
    selection.matchingGroupIndices.length > 1 ? (
      <span className="edit-bar-list-badge">{selection.matchingGroupIndices.length} lists</span>
    ) : null;

  return (
    <footer className={`edit-bar ${expanded ? 'edit-bar-expanded' : 'edit-bar-collapsed'}`}>
      {!expanded ? (
        <div className="edit-bar-top">
          <button
            type="button"
            className="edit-bar-toggle"
            onClick={onToggleExpanded}
            aria-expanded={false}
            title="Expand editor"
          >
            ▶
          </button>
          <button
            type="button"
            className="edit-bar-collapsed-summary"
            onClick={onToggleExpanded}
            title="Expand editor"
          >
            <span className="edit-bar-icon" aria-hidden>
              ✎
            </span>
            <ComponentIdHeader componentId={component.id} />
            <span className="edit-bar-sep">·</span>
            <span>{component.type}</span>
            <span className="edit-bar-sep">·</span>
            <span>{component.status}</span>
          </button>
        </div>
      ) : (
        <div className="edit-bar-expanded-inner">
          <div className="edit-bar-row">
            <button
              type="button"
              className="edit-bar-toggle"
              onClick={onToggleExpanded}
              aria-expanded
              title="Collapse editor"
            >
              ▼
            </button>
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
              {component.type === 'ref' && (
                <button
                  type="button"
                  className="edit-bar-input edit-bar-ref-target"
                  onClick={() => setPickerOpen(true)}
                  title="Ref target"
                >
                  {refTargetLabel}
                </button>
              )}
              {component.type === 'img' && (
                <button
                  type="button"
                  className="edit-bar-input edit-bar-ref-target"
                  onClick={() => setPickerOpen(true)}
                  title="Image file"
                >
                  {imgLabel}
                </button>
              )}
            </div>
          </div>
          {component.type !== 'ref' && component.type !== 'img' && component.type !== 'md' && (
            <textarea
              className="edit-bar-input edit-bar-input-content"
              rows={3}
              value={component.content}
              title="Content"
              placeholder="Content…"
              onChange={(e) => patch({ content: e.target.value })}
            />
          )}
          {component.type === 'md' && (
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
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Delete component"
          message={`Delete component "${component.id}"? It will be removed from this page and from all groups. Refs pointing to it will be cleared.`}
          confirmLabel="Delete"
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => onDeleteComponent(pageFile, component.id)}
        />
      )}

      {pickerOpen && component.type === 'ref' && (
        <RefTargetPickerDialog
          project={project}
          refComponentId={component.id}
          targetId={component.content}
          onSelect={(targetId) => patch({ content: targetId })}
          onClose={() => setPickerOpen(false)}
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
        />
      )}
    </footer>
  );
}
