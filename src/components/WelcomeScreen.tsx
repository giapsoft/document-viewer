import { useState } from 'react';
import { loadSampleProject, pickProjectFolder } from '../lib/loadProject';

interface WelcomeScreenProps {
  onLoaded: (project: import('../types').LoadedProject) => void;
}

export function WelcomeScreen({ onLoaded }: WelcomeScreenProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  const handleSample = async () => {
    setError(null);
    setLoading(true);
    try {
      const project = await loadSampleProject();
      onLoaded(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load sample data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="welcome">
      <div className="welcome-card">
        <h1>Document Viewer</h1>
        <p>Read and trace documents from a local folder.</p>
        <div className="welcome-actions">
          <button type="button" onClick={handlePickFolder} disabled={loading}>
            {loading ? 'Loading…' : 'Select folder'}
          </button>
          <button type="button" className="secondary" onClick={handleSample} disabled={loading}>
            Use sample data
          </button>
        </div>
        {error && <p className="welcome-error">{error}</p>}
        <p className="welcome-hint">
          You can open an empty folder and add pages from the sidebar. The app creates{' '}
          <code>docs/</code> on the first page and writes <code>relations.json</code> when
          saving. <code>styles.json</code> is optional. Edits auto-save in Chrome/Edge when
          using <strong>Select folder</strong>.
        </p>
      </div>
    </div>
  );
}
