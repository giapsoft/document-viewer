import type { SaveStatus } from './saveProject';

const REMOTE_SAVE_DEBOUNCE_MS = 2_000;

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let statusListener: ((status: SaveStatus, message?: string) => void) | null = null;

export function setRemoteSaveStatusListener(
  listener: ((status: SaveStatus, message?: string) => void) | null,
): void {
  statusListener = listener;
}

function notify(status: SaveStatus, message?: string): void {
  statusListener?.(status, message);
}

export type RemoteAutoSaveResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; conflict?: boolean; error?: string };

export function scheduleRemoteAutoSave(
  save: () => Promise<RemoteAutoSaveResult>,
): void {
  if (saveTimer) clearTimeout(saveTimer);
  notify('pending');

  saveTimer = setTimeout(() => {
    saveTimer = null;
    notify('saving');
    void save()
      .then((result) => {
        if (result.ok) {
          notify(result.skipped ? 'idle' : 'saved');
          if (!result.skipped) {
            window.setTimeout(() => notify('idle'), 2000);
          }
          return;
        }
        if (result.conflict) {
          notify('idle');
          return;
        }
        notify('error', result.error ?? 'Could not save');
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Could not save document';
        notify('error', message);
      });
  }, REMOTE_SAVE_DEBOUNCE_MS);
}

export function cancelRemoteAutoSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}
