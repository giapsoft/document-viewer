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
        onCreateNewDocument={store.createNewDocument}
        onLoadRemoteDoc={store.loadRemoteDocForWelcome}
        onLoadBundledHelp={store.loadBundledHelpForWelcome}
      />
    );
  }

  return <ProjectWorkspace store={store} supabaseReady={isSupabaseConfigured()} />;
}

export default App;
