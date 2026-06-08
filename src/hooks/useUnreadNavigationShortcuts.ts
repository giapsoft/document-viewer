import { useEffect } from 'react';
import { isTypingTarget, isWorkspaceOverlayOpen, releaseComponentReadBarFocus } from '../lib/keyboard';

interface UseUnreadNavigationShortcutsOptions {
  enabled: boolean;
  onNavigateUnread: (direction: 'forward' | 'backward') => void;
}

export function useUnreadNavigationShortcuts({
  enabled,
  onNavigateUnread,
}: UseUnreadNavigationShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTypingTarget(event.target)) return;
      if (isWorkspaceOverlayOpen()) return;

      const key = event.key;
      if (key !== 'u' && key !== 'U') return;

      event.preventDefault();
      event.stopPropagation();
      releaseComponentReadBarFocus();
      onNavigateUnread(event.shiftKey ? 'backward' : 'forward');
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, onNavigateUnread]);
}
