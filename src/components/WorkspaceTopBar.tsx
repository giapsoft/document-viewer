interface WorkspaceTopBarProps {
  linkMode?: boolean;
  linkEditingListIndex?: number | null;
  linkTargetMemberCount?: number;
  pinModeActive?: boolean;
  onExitPinMode?: () => void;
  canUnlink?: boolean;
  onUnlink?: () => void;
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
  canGoBack?: boolean;
  canGoNext?: boolean;
  onSelectionBack?: () => void;
  onSelectionNext?: () => void;
}

export function WorkspaceTopBar({
  linkMode = false,
  linkEditingListIndex = null,
  linkTargetMemberCount = 0,
  pinModeActive = false,
  onExitPinMode,
  canUnlink = false,
  onUnlink,
  sidebarCollapsed = false,
  onExpandSidebar,
  canGoBack = false,
  canGoNext = false,
  onSelectionBack,
  onSelectionNext,
}: WorkspaceTopBarProps) {
  const creatingNewList = linkMode && linkEditingListIndex === null;

  return (
    <>
      {sidebarCollapsed && onExpandSidebar && (
        <button type="button" className="sidebar-expand-btn" onClick={onExpandSidebar}>
          Expand
        </button>
      )}

      {pinModeActive && onExitPinMode && (
        <div className="pin-mode-banner">
          <span className="pin-mode-message">
            You are in Pin mode. Only pinned pages are shown in the panel area.
          </span>
          <button
            type="button"
            className="pin-mode-toggle active"
            onClick={onExitPinMode}
            aria-pressed
            title="Turn off Pin mode and unpin all pages"
          >
            <span className="pin-mode-toggle-track">
              <span className="pin-mode-toggle-thumb" />
            </span>
            <span className="pin-mode-toggle-label">Pin mode</span>
            <span className="pin-mode-status on">ON</span>
          </button>
        </div>
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
    </>
  );
}
