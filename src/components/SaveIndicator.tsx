import type { SaveStatus } from '../lib/saveProject';

interface SaveIndicatorProps {
  status: SaveStatus;
  errorMessage?: string | null;
  visible: boolean;
}

export function SaveIndicator({ status, errorMessage, visible }: SaveIndicatorProps) {
  if (!visible) return null;

  let label = '';
  let className = 'save-indicator';

  switch (status) {
    case 'pending':
      label = 'Unsaved…';
      className += ' save-pending';
      break;
    case 'saving':
      label = 'Saving…';
      className += ' save-saving';
      break;
    case 'saved':
      label = 'Saved';
      className += ' save-saved';
      break;
    case 'error':
      label = 'Save failed';
      className += ' save-error';
      break;
    default:
      return null;
  }

  return (
    <div className={className} title={errorMessage ?? undefined}>
      {label}
    </div>
  );
}
