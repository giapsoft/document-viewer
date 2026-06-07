import { useEffect, useRef } from 'react';
import type { ComponentStatus } from '../types';
import { isTypingTarget } from '../lib/keyboard';

const STATUSES: ComponentStatus[] = ['undefined', 'pending', 'working', 'done', 'blocked'];

function stepStatus(current: ComponentStatus, direction: -1 | 1): ComponentStatus {
  const index = STATUSES.indexOf(current);
  const start = index >= 0 ? index : 0;
  return STATUSES[(start + direction + STATUSES.length) % STATUSES.length];
}

interface UseEditBarShortcutsOptions {
  enabled: boolean;
  status: ComponentStatus;
  canDelete: boolean;
  onOpenFullscreen: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDelete: () => void;
  onStatusChange: (status: ComponentStatus) => void;
}

export function useEditBarShortcuts({
  enabled,
  status,
  canDelete,
  onOpenFullscreen,
  onInsertAbove,
  onInsertBelow,
  onDelete,
  onStatusChange,
}: UseEditBarShortcutsOptions) {
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key;

      if (key === 'e' || key === 'E') {
        event.preventDefault();
        onOpenFullscreen();
        return;
      }

      if (key === 'ArrowLeft') {
        event.preventDefault();
        onStatusChange(stepStatus(statusRef.current, -1));
        return;
      }

      if (key === 'ArrowRight') {
        event.preventDefault();
        onStatusChange(stepStatus(statusRef.current, 1));
        return;
      }

      if (key === 'Delete') {
        if (!canDelete) return;
        event.preventDefault();
        onDelete();
        return;
      }

      if (key === 'ArrowUp') {
        event.preventDefault();
        onInsertAbove();
        return;
      }

      if (key === 'ArrowDown') {
        event.preventDefault();
        onInsertBelow();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    enabled,
    canDelete,
    onOpenFullscreen,
    onInsertAbove,
    onInsertBelow,
    onDelete,
    onStatusChange,
  ]);
}
