import { ComponentShortcutsHint } from './ComponentShortcutsHint';

interface WorkspaceTopBarProps {
  linkMode?: boolean;
  linkEditingListIndex?: number | null;
  linkTargetMemberCount?: number;
  canUnlink?: boolean;
  onUnlink?: () => void;
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
  canGoBack?: boolean;
  canGoNext?: boolean;
  onSelectionBack?: () => void;
  onSelectionNext?: () => void;
  showComponentShortcuts?: boolean;
  readShortcutsEnabled?: boolean;
}

export function WorkspaceTopBar({
  linkMode = false,
  linkEditingListIndex = null,
  linkTargetMemberCount = 0,
  canUnlink = false,
  onUnlink,
  sidebarCollapsed = false,
  onExpandSidebar,
  canGoBack = false,
  canGoNext = false,
  onSelectionBack,
  onSelectionNext,
  showComponentShortcuts = false,
  readShortcutsEnabled = false,
}: WorkspaceTopBarProps) {
  const creatingNewList = linkMode && linkEditingListIndex === null;

  return (
    <>
      {sidebarCollapsed && onExpandSidebar && (
        <button type="button" className="sidebar-expand-btn" onClick={onExpandSidebar}>
          Expand
        </button>
      )}

      {!linkMode && onSelectionBack && onSelectionNext && (
        <div className="selection-nav-group">
          <button
            type="button"
            className="selection-nav-btn"
            onClick={onSelectionBack}
            disabled={!canGoBack}
            title="Previous selection (←)"
          >
            ← Back
          </button>
          <button
            type="button"
            className="selection-nav-btn"
            onClick={onSelectionNext}
            disabled={!canGoNext}
            title="Next selection (→)"
          >
            Next →
          </button>
        </div>
      )}

      {onUnlink && (
        <button
          type="button"
          className="link-unlink-btn"
          onClick={onUnlink}
          disabled={!canUnlink}
          title={
            canUnlink
              ? linkMode
                ? 'Delete the currently selected relation group'
                : 'Remove all relation groups for this component'
              : 'Select a linked component to unlink'
          }
        >
          Unlink
        </button>
      )}

      {linkMode && (
        <span className="link-mode-hint">
          {creatingNewList
            ? 'Creating a new list — click components to add them to this list. (Hold Ctrl)'
            : `Editing list ${linkEditingListIndex! + 1} (${linkTargetMemberCount} members) — click to add or remove. (Hold Ctrl)`}
        </span>
      )}

      {showComponentShortcuts && !linkMode && (
        <ComponentShortcutsHint readShortcutsEnabled={readShortcutsEnabled} />
      )}
    </>
  );
}
