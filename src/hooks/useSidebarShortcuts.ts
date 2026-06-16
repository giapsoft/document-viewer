import { useEffect } from 'react';
import { isTypingTarget, isWorkspaceOverlayOpen } from '../lib/keyboard';

interface UseSidebarShortcutsOptions {
  enabled?: boolean;
  onToggle: () => void;
}

export function useSidebarShortcuts({
  enabled = true,
  onToggle,
}: UseSidebarShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (event.key !== 'b' && event.key !== 'B') return;
      if (isTypingTarget(event.target)) return;
      if (isWorkspaceOverlayOpen()) return;

      event.preventDefault();
      event.stopPropagation();
      onToggle();
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, onToggle]);
}
