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
}

export function EditBar({
  project,
  selection,
  onUpdate,
  onInsertAbove,
  onInsertBelow,
}: EditBarProps) {
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

  return (
    <footer className="edit-bar">
      <div className="edit-bar-header">
        <strong>Edit</strong>
        <span className="edit-bar-context">
          <span className="edit-bar-page">{formatPageName(pageFile)}</span>
          <code className="edit-bar-component-id">{component.id}</code>
          {selection.matchingGroupIndices.length > 1 && (
            <span className="edit-bar-list-badge">
              In {selection.matchingGroupIndices.length} lists
            </span>
          )}
          {selection.matchingGroupIndices.length === 1 && (
            <span className="edit-bar-list-badge edit-bar-list-badge-single">
              In 1 list
            </span>
          )}
        </span>
      </div>

      <div className="edit-bar-actions">
        <button
          type="button"
          className="edit-bar-btn"
          onClick={() => onInsertAbove(pageFile, component.id)}
          title="Insert new component above"
        >
          ↑ Insert above
        </button>
        <button
          type="button"
          className="edit-bar-btn"
          onClick={() => onInsertBelow(pageFile, component.id)}
          title="Insert new component below"
        >
          ↓ Insert below
        </button>
      </div>

      <div className="edit-bar-fields">
        <label className="edit-field edit-field-id">
          <span>ID</span>
          <input
            type="text"
            value={idDraft}
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
        </label>

        <label className="edit-field">
          <span>Type</span>
          <select
            value={component.type}
            onChange={(e) => patch({ type: e.target.value as ComponentType })}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="edit-field">
          <span>Status</span>
          <select
            value={component.status}
            onChange={(e) => patch({ status: e.target.value as ComponentStatus })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="edit-field edit-field-content">
          <span>
            {component.type === 'img'
              ? 'Image file'
              : component.type === 'ref'
                ? 'Target'
                : 'Content'}
          </span>
          {component.type === 'ref' ? (
            <button
              type="button"
              className="ref-target-picker-btn"
              onClick={() => setPickerOpen(true)}
            >
              {refTargetLabel}
            </button>
          ) : (
            <textarea
              rows={2}
              value={component.content}
              placeholder={component.type === 'img' ? 'image.png' : 'Text content…'}
              onChange={(e) => patch({ content: e.target.value })}
            />
          )}
        </label>
      </div>

      {pickerOpen && component.type === 'ref' && (
        <RefTargetPickerDialog
          project={project}
          refComponentId={component.id}
          targetId={component.content}
          onSelect={(targetId) => patch({ content: targetId })}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </footer>
  );
}
