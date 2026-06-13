import type { SaveStatus } from '../lib/saveProject';

interface ProjectToolbarProps {
  dirty: boolean;
  canSave: boolean;
  canReloadFromLocal?: boolean;
  editLocked?: boolean;
  loading: boolean;
  error: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  sourceLabel: string | null;
  onSave: () => void;
  onReload?: () => void;
  onUnlockEditing?: () => void;
  onClose: () => void;
}

function saveStatusLabel(status: SaveStatus, dirty: boolean): string | null {
  switch (status) {
    case 'pending':
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
  canSave,
  canReloadFromLocal = false,
  editLocked = false,
  loading,
  error,
  saveStatus,
  saveError,
  sourceLabel,
  onSave,
  onReload,
  onUnlockEditing,
  onClose,
}: ProjectToolbarProps) {
  const saveLabel =
    canSave || saveStatus === 'pending' || saveStatus === 'saving' || saveStatus === 'saved' || saveStatus === 'error'
      ? saveStatusLabel(saveStatus, dirty)
      : null;

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
      {canReloadFromLocal && onReload && (
        <button
          type="button"
          className="project-folder-btn"
          onClick={onReload}
          disabled={loading}
          title="Reload document from local folder"
        >
          Reload
        </button>
      )}
      {editLocked && onUnlockEditing && (
        <button
          type="button"
          className="project-folder-btn project-folder-btn-primary"
          onClick={onUnlockEditing}
          disabled={loading}
          title="Enter password to enable editing"
        >
          Unlock editing
        </button>
      )}
      <button
        type="button"
        className="project-folder-btn project-folder-btn-primary"
        onClick={onSave}
        disabled={!canSave || loading || saveStatus === 'saving'}
        title="Export document (local folder or remote storage)"
      >
        Export
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
