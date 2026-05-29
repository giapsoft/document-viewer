interface LinkModeToggleProps {
  enabled: boolean;
  onToggle: () => void;
  canUnlink?: boolean;
  onUnlink?: () => void;
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
  canGoBack?: boolean;
  canGoNext?: boolean;
  onSelectionBack?: () => void;
  onSelectionNext?: () => void;
  canGoPrevGroup?: boolean;
  canGoNextGroup?: boolean;
  groupNavLabel?: string | null;
  onGroupPrev?: () => void;
  onGroupNext?: () => void;
  /** Locked list index in link mode, or null when creating a new list */
  linkEditingListIndex?: number | null;
  linkTargetMemberCount?: number;
}

export function LinkModeToggle({
  enabled,
  onToggle,
  canUnlink = false,
  onUnlink,
  sidebarCollapsed = false,
  onExpandSidebar,
  canGoBack = false,
  canGoNext = false,
  onSelectionBack,
  onSelectionNext,
  canGoPrevGroup = false,
  canGoNextGroup: _canGoNextGroup = false,
  groupNavLabel = null,
  onGroupPrev,
  onGroupNext,
  linkEditingListIndex = null,
  linkTargetMemberCount = 0,
}: LinkModeToggleProps) {
  const creatingNewList = enabled && linkEditingListIndex === null;

  return (
    <div className="link-mode-bar">
      {sidebarCollapsed && onExpandSidebar && (
        <button
          type="button"
          className="sidebar-expand-btn"
          onClick={onExpandSidebar}
        >
          Expand
        </button>
      )}
      {!enabled && onSelectionBack && onSelectionNext && (
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
      {!enabled && canGoPrevGroup && onGroupPrev && onGroupNext && (
        <div className="selection-nav-group">
          <button
            type="button"
            className="selection-nav-btn"
            onClick={onGroupPrev}
            title="Previous linked group"
          >
            ← Group
          </button>
          <span className="group-nav-label">{groupNavLabel ?? 'Group'}</span>
          <button
            type="button"
            className="selection-nav-btn"
            onClick={onGroupNext}
            title="Next linked group"
          >
            Group →
          </button>
        </div>
      )}
      <button
        type="button"
        className={`link-mode-toggle ${enabled ? 'active' : ''}`}
        onClick={onToggle}
        aria-pressed={enabled}
      >
        <span className="link-mode-toggle-track">
          <span className="link-mode-toggle-thumb" />
        </span>
        <span className="link-mode-toggle-label">Link mode</span>
        <span className={`link-mode-status ${enabled ? 'on' : 'off'}`}>
          {enabled ? 'ON' : 'OFF'}
        </span>
      </button>
      {onUnlink && (
        <button
          type="button"
          className="link-unlink-btn"
          onClick={onUnlink}
          disabled={!canUnlink}
          title={
            canUnlink
              ? 'Delete the currently selected relation group'
              : 'Select a linked group to unlink'
          }
        >
          Unlink
        </button>
      )}
      {enabled && (
        <span className="link-mode-hint">
          {creatingNewList
            ? 'Creating a new list — click components to add them to this list.'
            : `Editing list ${linkEditingListIndex! + 1} (${linkTargetMemberCount} members) — click to add or remove.`}
        </span>
      )}
    </div>
  );
}
