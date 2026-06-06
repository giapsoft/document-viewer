import type { SaveStatus } from '../lib/saveProject';

interface ProjectToolbarProps {
  dirty: boolean;
  canReload: boolean;
  canSave: boolean;
  loading: boolean;
  error: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  sourceLabel: string | null;
  onSave: () => void;
  onReload: () => void;
  onSelectFolder: () => void;
  onClose: () => void;
}

function saveStatusLabel(status: SaveStatus, dirty: boolean): string | null {
  switch (status) {
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'error':
      return 'Save failed';
    default:
      return dirty ? 'Unsaved changes' : null;
  }
}

export function ProjectToolbar({
  dirty,
  canReload,
  canSave,
  loading,
  error,
  saveStatus,
  saveError,
  sourceLabel,
  onSave,
  onReload,
  onSelectFolder,
  onClose,
}: ProjectToolbarProps) {
  const saveLabel = canSave ? saveStatusLabel(saveStatus, dirty) : null;

  return (
    <div className="project-folder-actions">
      {sourceLabel && <span className="project-source-label">{sourceLabel}</span>}
      {saveLabel && (
        <span
          className={`project-save-label project-save-label-${saveStatus === 'idle' && dirty ? 'pending' : saveStatus}`}
          title={saveError ?? undefined}
        >
          {saveLabel}
        </span>
      )}
      {error && (
        <span className="project-folder-error" role="alert">
          {error}
        </span>
      )}
      <button
        type="button"
        className="project-folder-btn project-folder-btn-primary"
        onClick={onSave}
        disabled={!canSave || loading || saveStatus === 'saving'}
        title={
          dirty
            ? 'Save document (local folder or remote storage)'
            : 'Save document to local folder'
        }
      >
        Save
      </button>
      <button
        type="button"
        className="project-folder-btn"
        onClick={onReload}
        disabled={!canReload || loading}
        title="Discard unsaved changes and reload"
      >
        {loading ? 'Loading…' : 'Reload'}
      </button>
      <button
        type="button"
        className="project-folder-btn"
        onClick={onSelectFolder}
        disabled={loading}
        title="Choose a different local folder"
      >
        Select folder
      </button>
      <button
        type="button"
        className="project-folder-btn"
        onClick={onClose}
        disabled={loading}
        title="Back to document list"
      >
        Close
      </button>
    </div>
  );
}
