interface ComponentShortcutsHintProps {
  readShortcutsEnabled: boolean;
  hasSelection?: boolean;
  linkedListPanelOpen?: boolean;
  canToggleLinkedList?: boolean;
}

export function ComponentShortcutsHint({
  readShortcutsEnabled,
  hasSelection = false,
  linkedListPanelOpen = false,
  canToggleLinkedList = false,
}: ComponentShortcutsHintProps) {
  return (
    <div className="component-shortcuts-hint" aria-label="Component keyboard shortcuts">
      {hasSelection ? (
        <>
          <span className="component-shortcuts-hint-group">
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <span>move</span>
          </span>
          {readShortcutsEnabled ? (
            <>
              <span className="component-shortcuts-hint-sep" aria-hidden>
                ·
              </span>
              <span className="component-shortcuts-hint-group">
                <kbd>Enter</kbd>
                <span>toggle read</span>
              </span>
            </>
          ) : null}
          <span className="component-shortcuts-hint-sep" aria-hidden>
            ·
          </span>
          <span className="component-shortcuts-hint-group">
            <kbd>Alt</kbd>
            <span>+</span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <span>insert</span>
          </span>
          {canToggleLinkedList || linkedListPanelOpen ? (
            <>
              <span className="component-shortcuts-hint-sep" aria-hidden>
                ·
              </span>
              <span className="component-shortcuts-hint-group">
                <kbd>Alt</kbd>
                <span>+</span>
                <kbd>L</kbd>
                <span>{linkedListPanelOpen ? 'close lists' : 'linked lists'}</span>
              </span>
            </>
          ) : null}
        </>
      ) : null}
      {readShortcutsEnabled ? (
        <>
          {hasSelection ? (
            <span className="component-shortcuts-hint-sep" aria-hidden>
              ·
            </span>
          ) : null}
          <span className="component-shortcuts-hint-group">
            <kbd>U</kbd>
            <span>next unread</span>
          </span>
          <span className="component-shortcuts-hint-sep" aria-hidden>
            ·
          </span>
          <span className="component-shortcuts-hint-group">
            <kbd>Shift</kbd>
            <span>+</span>
            <kbd>U</kbd>
            <span>prev unread</span>
          </span>
        </>
      ) : null}
    </div>
  );
}
