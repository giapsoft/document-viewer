interface LinkModeToggleProps {
  enabled: boolean;
  onToggle: () => void;
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
  canGoPrevLinkGroup?: boolean;
  canGoNextLinkGroup?: boolean;
  linkGroupNavLabel?: string | null;
  onLinkGroupPrev?: () => void;
  onLinkGroupNext?: () => void;
  linkTargetMemberCount?: number;
}

export function LinkModeToggle({
  enabled,
  onToggle,
  sidebarCollapsed = false,
  onExpandSidebar,
  canGoBack = false,
  canGoNext = false,
  onSelectionBack,
  onSelectionNext,
  canGoPrevGroup = false,
  canGoNextGroup = false,
  groupNavLabel = null,
  onGroupPrev,
  onGroupNext,
  canGoPrevLinkGroup = false,
  canGoNextLinkGroup = false,
  linkGroupNavLabel = null,
  onLinkGroupPrev,
  onLinkGroupNext,
  linkTargetMemberCount = 0,
}: LinkModeToggleProps) {
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
      {!enabled && groupNavLabel && onGroupPrev && onGroupNext && (
        <div className="selection-nav-group">
          <button
            type="button"
            className="selection-nav-btn"
            onClick={onGroupPrev}
            disabled={!canGoPrevGroup}
            title="Previous linked group"
          >
            ← Group
          </button>
          <span className="group-nav-label">{groupNavLabel}</span>
          <button
            type="button"
            className="selection-nav-btn"
            onClick={onGroupNext}
            disabled={!canGoNextGroup}
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
      {enabled && linkGroupNavLabel && onLinkGroupPrev && onLinkGroupNext && (
        <div className="selection-nav-group">
          <button
            type="button"
            className="selection-nav-btn"
            onClick={onLinkGroupPrev}
            disabled={!canGoPrevLinkGroup}
            title="Previous list (add target)"
          >
            ← List
          </button>
          <span className="group-nav-label">{linkGroupNavLabel}</span>
          <button
            type="button"
            className="selection-nav-btn"
            onClick={onLinkGroupNext}
            disabled={!canGoNextLinkGroup}
            title="Next list (add target)"
          >
            List →
          </button>
        </div>
      )}
      {enabled && (
        <span className="link-mode-hint">
          {linkGroupNavLabel
            ? `Tap components to add/remove from current list (${linkTargetMemberCount} members).`
            : 'Tap a component to start a new list.'}
        </span>
      )}
    </div>
  );
}
