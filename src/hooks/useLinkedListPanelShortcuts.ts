import { useEffect } from 'react';
import { isTypingTarget, isWorkspaceOverlayOpen, releaseComponentReadBarFocus } from '../lib/keyboard';

interface UseLinkedListPanelShortcutsOptions {
  enabled: boolean;
  isOpen: boolean;
  canOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
}

export function useLinkedListPanelShortcuts({
  enabled,
  isOpen,
  canOpen,
  onOpen,
  onClose,
}: UseLinkedListPanelShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== 'l' && event.key !== 'L') return;
      if (isTypingTarget(event.target)) return;
      if (isWorkspaceOverlayOpen()) return;

      event.preventDefault();
      event.stopPropagation();
      releaseComponentReadBarFocus();

      if (isOpen) {
        onClose();
        return;
      }

      if (canOpen) {
        onOpen();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, isOpen, canOpen, onOpen, onClose]);
}
