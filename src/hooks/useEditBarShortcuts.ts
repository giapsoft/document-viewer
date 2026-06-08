import { useEffect, useRef } from 'react';
import type { ComponentStatus } from '../types';
import { isTypingTarget, releaseComponentReadBarFocus } from '../lib/keyboard';

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
  readShortcutsEnabled: boolean;
  onOpenFullscreen: () => void;
  onSelectAdjacent: (direction: 'up' | 'down') => void;
  onSelectNextUnread: () => void;
  onToggleRead: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDelete: () => void;
  onStatusChange: (status: ComponentStatus) => void;
}

export function useEditBarShortcuts({
  enabled,
  status,
  canDelete,
  readShortcutsEnabled,
  onOpenFullscreen,
  onSelectAdjacent,
  onSelectNextUnread,
  onToggleRead,
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
      if (isTypingTarget(event.target)) return;

      const key = event.key;

      if (event.altKey && key === 'ArrowUp') {
        event.preventDefault();
        onInsertAbove();
        return;
      }

      if (event.altKey && key === 'ArrowDown') {
        event.preventDefault();
        onInsertBelow();
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) return;

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
        releaseComponentReadBarFocus();
        onSelectAdjacent('up');
        return;
      }

      if (key === 'ArrowDown') {
        event.preventDefault();
        releaseComponentReadBarFocus();
        onSelectAdjacent('down');
        return;
      }

      if (key === 'Enter' && readShortcutsEnabled) {
        event.preventDefault();
        event.stopPropagation();
        releaseComponentReadBarFocus();
        onToggleRead();
        return;
      }

      if ((key === 'u' || key === 'U') && readShortcutsEnabled) {
        event.preventDefault();
        releaseComponentReadBarFocus();
        onSelectNextUnread();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    enabled,
    canDelete,
    readShortcutsEnabled,
    onOpenFullscreen,
    onSelectAdjacent,
    onSelectNextUnread,
    onToggleRead,
    onInsertAbove,
    onInsertBelow,
    onDelete,
    onStatusChange,
  ]);
}
