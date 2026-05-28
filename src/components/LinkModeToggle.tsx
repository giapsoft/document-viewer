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
  linkFocusComponentId?: string | null;
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
  canGoNextGroup: _canGoNextGroup = false,
  groupNavLabel = null,
  onGroupPrev,
  onGroupNext,
  canGoPrevLinkGroup = false,
  canGoNextLinkGroup: _canGoNextLinkGroup = false,
  linkGroupNavLabel = null,
  linkFocusComponentId = null,
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
      {enabled && canGoPrevLinkGroup && onLinkGroupPrev && onLinkGroupNext && (
        <div className="selection-nav-group link-list-nav">
          <button
            type="button"
            className="selection-nav-btn"
            onClick={onLinkGroupPrev}
            title="Previous list (add target)"
          >
            ← List
          </button>
          <span className="group-nav-label">{linkGroupNavLabel ?? 'List'}</span>
          <button
            type="button"
            className="selection-nav-btn"
            onClick={onLinkGroupNext}
            title="Next list (add target)"
          >
            List →
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
      {enabled && linkFocusComponentId && (
        <span className="link-focus-badge">
          Focus: <code>{linkFocusComponentId}</code>
        </span>
      )}
      {enabled && (
        <span className="link-mode-hint">
          {canGoPrevLinkGroup && linkGroupNavLabel
            ? `Add/remove in ${linkGroupNavLabel} (${linkTargetMemberCount} members).`
            : linkFocusComponentId
              ? 'Focus node is in 1 list — no list switcher.'
              : 'Select a component, then toggle lists with ← List / List →.'}
        </span>
      )}
    </div>
  );
}
