import { PageFileDialog } from './PageFileDialog';
import { defaultRemoteTitle } from '../lib/projectBundle';
import type { LoadedProject } from '../types';

interface SaveDocDialogProps {
  project: LoadedProject;
  onClose: () => void;
  onConfirm: (title: string) => void;
}

export function SaveDocDialog({ project, onClose, onConfirm }: SaveDocDialogProps) {
  return (
    <PageFileDialog
      title="Save to Supabase"
      label="Document title"
      initialValue={defaultRemoteTitle(project)}
      hint="This creates a new saved document on Supabase."
      confirmLabel="Save"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
