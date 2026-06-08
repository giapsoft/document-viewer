interface ComponentShortcutsHintProps {
  readShortcutsEnabled: boolean;
}

export function ComponentShortcutsHint({
  readShortcutsEnabled,
}: ComponentShortcutsHintProps) {
  return (
    <div className="component-shortcuts-hint" aria-label="Component keyboard shortcuts">
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
          <span className="component-shortcuts-hint-sep" aria-hidden>
            ·
          </span>
          <span className="component-shortcuts-hint-group">
            <kbd>U</kbd>
            <span>next unread</span>
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
    </div>
  );
}
