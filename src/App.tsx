import { WelcomeScreen } from './components/WelcomeScreen';
import { ProjectWorkspace } from './components/ProjectWorkspace';
import { useAppStore } from './hooks/useAppStore';
import { isSupabaseConfigured } from './lib/supabaseClient';

function App() {
  const store = useAppStore();

  if (!store.state.project) {
    return (
      <WelcomeScreen
        onLoaded={store.setProject}
        onLoadRemoteDoc={async (docId) => {
          const result = await store.loadRemoteDoc(docId);
          return result.ok ? { ok: true } : { ok: false, error: result.error };
        }}
      />
    );
  }

  return <ProjectWorkspace store={store} supabaseReady={isSupabaseConfigured()} />;
}

export default App;
