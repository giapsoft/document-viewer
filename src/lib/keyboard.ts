export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('.picker-dialog')) return true;
  if (target.closest('.content-editor-overlay')) return true;

  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;

  return false;
}

/** True when a modal dialog or full-screen editor covers the main workspace. */
export function isWorkspaceOverlayOpen(): boolean {
  return Boolean(
    document.querySelector(
      '.content-editor-overlay, .picker-overlay, .page-file-dialog, .save-destination-dialog',
    ),
  );
}

/** Read bars used to be buttons; blur so Enter does not activate a stale bar. */
export function releaseComponentReadBarFocus(): void {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (!active.closest('.component-read-bar')) return;
  active.blur();
}

export function focusComponentBlock(componentId: string): void {
  const el = document.querySelector(
    `[data-component-id="${CSS.escape(componentId)}"]`,
  ) as HTMLElement | null;
  el?.focus({ preventScroll: true });
}

export function queueFocusComponentBlock(componentId: string): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      focusComponentBlock(componentId);
    });
  });
}
