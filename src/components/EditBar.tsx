import { useEffect, useState } from 'react';
import type {
  Component,
  ComponentStatus,
  ComponentType,
  LoadedProject,
  SelectionState,
} from '../types';
import { findComponent } from '../lib/projectMutations';
import { formatPageName } from '../lib/formatPageName';
import type { ImportImageResult } from '../lib/importImage';
import { ImagePickerDialog } from './ImagePickerDialog';
import { RefTargetPickerDialog } from './RefTargetPickerDialog';

const TYPES: ComponentType[] = ['header', 'title', 'body', 'listItem', 'img', 'ref'];
const STATUSES: ComponentStatus[] = ['undefined', 'pending', 'working', 'done', 'blocked'];

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
  onImportImage?: () => Promise<ImportImageResult>;
  onImportImageFromClipboard?: () => Promise<ImportImageResult>;
}

export function EditBar({
  project,
  selection,
  onUpdate,
  onInsertAbove,
  onInsertBelow,
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

  return (
    <EditBarForm
      key={component.id}
      project={project}
      selection={selection}
      pageFile={pageFile}
      component={component}
      expanded={expanded}
      onToggleExpanded={() => setExpanded((value) => !value)}
      onUpdate={onUpdate}
      onInsertAbove={onInsertAbove}
      onInsertBelow={onInsertBelow}
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
  expanded: boolean;
  onToggleExpanded: () => void;
  onUpdate: EditBarProps['onUpdate'];
  onInsertAbove: EditBarProps['onInsertAbove'];
  onInsertBelow: EditBarProps['onInsertBelow'];
  onImportImage?: EditBarProps['onImportImage'];
  onImportImageFromClipboard?: EditBarProps['onImportImageFromClipboard'];
}

function EditBarForm({
  project,
  selection,
  pageFile,
  component,
  expanded,
  onToggleExpanded,
  onUpdate,
  onInsertAbove,
  onInsertBelow,
  onImportImage,
  onImportImageFromClipboard,
}: EditBarFormProps) {
  const [idDraft, setIdDraft] = useState(component.id);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setIdDraft(component.id);
  }, [component.id]);

  const patch = (changes: Partial<Component>) => {
    onUpdate(pageFile, component.id, changes);
  };

  const refTargetId = component.content.trim();
  const refTargetValid = component.type === 'ref' && refTargetId
    ? findComponent(project, refTargetId)
    : null;
  const refTargetLabel = refTargetValid ? refTargetId : 'Select component';

  const imgFilename = component.content.trim();
  const imgLabel = imgFilename || 'select image';

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
            <span className="edit-bar-page">{formatPageName(pageFile)}</span>
            <span className="edit-bar-sep">·</span>
            <code className="edit-bar-component-id">{component.id}</code>
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
              <span className="edit-bar-page">{formatPageName(pageFile)}</span>
              <code className="edit-bar-component-id">{component.id}</code>
              {listBadge}
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
            </div>
            <div className="edit-bar-fields">
              <input
                className="edit-bar-input edit-bar-input-id"
                type="text"
                value={idDraft}
                title="ID"
                placeholder="ID"
                onChange={(e) => setIdDraft(e.target.value)}
                onBlur={() => {
                  if (idDraft.trim() && idDraft !== component.id) {
                    patch({ id: idDraft.trim() });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
              />
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
          {component.type !== 'ref' && component.type !== 'img' && (
            <textarea
              className="edit-bar-input edit-bar-input-content"
              rows={3}
              value={component.content}
              title="Content"
              placeholder="Content…"
              onChange={(e) => patch({ content: e.target.value })}
            />
          )}
        </div>
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
