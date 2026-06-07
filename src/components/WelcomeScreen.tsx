import { useEffect, useRef, useState } from 'react';
import { pickProjectFolder } from '../lib/loadProject';
import { VersionBadge } from './VersionBadge';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { listRemoteDocuments, type RemoteDocumentMeta } from '../lib/remoteProject';
import { getDocIdFromUrl } from '../lib/docUrl';

interface WelcomeScreenProps {
  onLoaded: (project: import('../types').LoadedProject) => void;
  onLoadRemoteDoc: (docId: string) => Promise<{ ok: boolean; error?: string }>;
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function WelcomeScreen({ onLoaded, onLoadRemoteDoc }: WelcomeScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [remoteDocs, setRemoteDocs] = useState<RemoteDocumentMeta[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const supabaseReady = isSupabaseConfigured();

  const refreshRemoteDocs = async () => {
    if (!supabaseReady) return;
    setRemoteLoading(true);
    setRemoteError(null);
    try {
      setRemoteDocs(await listRemoteDocuments());
    } catch (err) {
      setRemoteError(err instanceof Error ? err.message : 'Could not load remote documents');
    } finally {
      setRemoteLoading(false);
    }
  };

  useEffect(() => {
    void refreshRemoteDocs();
  }, [supabaseReady]);

  const onLoadRemoteDocRef = useRef(onLoadRemoteDoc);
  onLoadRemoteDocRef.current = onLoadRemoteDoc;

  useEffect(() => {
    const docId = getDocIdFromUrl();
    if (!docId || !supabaseReady) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    void onLoadRemoteDocRef.current(docId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error ?? 'Could not open document from URL');
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [supabaseReady]);

  const handlePickFolder = async () => {
    setError(null);
    setLoading(true);
    try {
      if (!window.showDirectoryPicker) {
        setError(
          'Folder selection is not supported in this browser. Please use Chrome or Edge.',
        );
        return;
      }
      const project = await pickProjectFolder();
      if (project) onLoaded(project);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Could not load folder');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRemote = async (docId: string) => {
    setError(null);
    setLoading(true);
    try {
      const result = await onLoadRemoteDoc(docId);
      if (!result.ok) {
        setError(result.error ?? 'Could not open document');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="welcome">
      <div className="welcome-card welcome-card-wide">
        <h1>Document Viewer</h1>
        <p>Open a local folder or choose a saved document from remote storage.</p>

        <div className="welcome-actions">
          <button type="button" onClick={handlePickFolder} disabled={loading}>
            {loading ? 'Loading…' : 'Select folder'}
          </button>
        </div>

        {supabaseReady ? (
          <section className="welcome-remote">
            <div className="welcome-remote-header">
              <h2>Saved documents</h2>
              <button
                type="button"
                className="welcome-refresh-btn"
                onClick={() => void refreshRemoteDocs()}
                disabled={remoteLoading || loading}
              >
                Refresh
              </button>
            </div>
            {remoteLoading && <p className="welcome-remote-status">Loading list…</p>}
            {remoteError && (
              <p className="welcome-error" role="alert">
                {remoteError}
              </p>
            )}
            {!remoteLoading && !remoteError && remoteDocs.length === 0 && (
              <p className="welcome-remote-status">No saved documents yet.</p>
            )}
            {!remoteLoading && remoteDocs.length > 0 && (
              <ul className="welcome-doc-list">
                {remoteDocs.map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      className="welcome-doc-item"
                      disabled={loading}
                      onClick={() => void handleOpenRemote(doc.id)}
                    >
                      <span className="welcome-doc-title">{doc.title}</span>
                      <span className="welcome-doc-meta">{formatUpdatedAt(doc.updated_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <p className="welcome-hint welcome-remote-unavailable-hint">
            Remote storage is not available on this site.
          </p>
        )}

        {error && <p className="welcome-error">{error}</p>}
        <p className="welcome-hint">
          Edits stay in memory until you press <strong>Save</strong> and choose local folder or
          remote storage. Deep link: <code>?doc=DOCUMENT_ID</code> (also accepts{' '}
          <code>?page=</code>).
        </p>
        <VersionBadge />
      </div>
    </div>
  );
}
