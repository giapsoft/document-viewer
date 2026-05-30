import type { SaveStatus } from '../lib/saveProject';

interface ProjectFolderActionsProps {
  canReload: boolean;
  loading: boolean;
  error: string | null;
  onReload: () => void;
  onSelectFolder: () => void;
  saveVisible?: boolean;
  saveStatus?: SaveStatus;
  saveError?: string | null;
}

function saveStatusLabel(status: SaveStatus): string | null {
  switch (status) {
    case 'pending':
      return 'Unsaved…';
    case 'saving':
      return 'Saving…';
    case 'saved':
      return 'Saved';
    case 'error':
      return 'Save failed';
    default:
      return null;
  }
}

export function ProjectFolderActions({
  canReload,
  loading,
  error,
  onReload,
  onSelectFolder,
  saveVisible = false,
  saveStatus = 'idle',
  saveError = null,
}: ProjectFolderActionsProps) {
  const saveLabel = saveVisible ? saveStatusLabel(saveStatus) : null;

  return (
    <div className="project-folder-actions">
      {saveLabel && (
        <span
          className={`project-save-label project-save-label-${saveStatus}`}
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
        className="project-folder-btn"
        onClick={onReload}
        disabled={!canReload || loading}
        title={
          canReload
            ? 'Reload all files from the open project folder'
            : 'Reload is only available for a local project folder'
        }
      >
        {loading ? 'Loading…' : 'Reload'}
      </button>
      <button
        type="button"
        className="project-folder-btn"
        onClick={onSelectFolder}
        disabled={loading}
        title="Choose a different project folder"
      >
        Select folder
      </button>
    </div>
  );
}
