import { useEffect } from 'react';
import { isTypingTarget } from '../lib/keyboard';

interface UseSelectionNavigationShortcutsOptions {
  enabled: boolean;
  canGoBack: boolean;
  canGoNext: boolean;
  onBack: () => void;
  onNext: () => void;
}

export function useSelectionNavigationShortcuts({
  enabled,
  canGoBack,
  canGoNext,
  onBack,
  onNext,
}: UseSelectionNavigationShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === 'ArrowLeft' && canGoBack) {
        e.preventDefault();
        onBack();
        return;
      }

      if (e.key === 'ArrowRight' && canGoNext) {
        e.preventDefault();
        onNext();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, canGoBack, canGoNext, onBack, onNext]);
}
