interface LinkModeToggleProps {
  enabled: boolean;
  selectedCount: number;
  onToggle: () => void;
  sidebarCollapsed?: boolean;
  onExpandSidebar?: () => void;
  canGoBack?: boolean;
  canGoNext?: boolean;
  onSelectionBack?: () => void;
  onSelectionNext?: () => void;
}

export function LinkModeToggle({
  enabled,
  selectedCount,
  onToggle,
  sidebarCollapsed = false,
  onExpandSidebar,
  canGoBack = false,
  canGoNext = false,
  onSelectionBack,
  onSelectionNext,
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
      {enabled && (
        <span className="link-mode-hint">
          Tap components to link or unlink them.
          {selectedCount > 0 && (
            <>
              {' '}
              <strong>{selectedCount}</strong> selected
            </>
          )}
        </span>
      )}
    </div>
  );
}
