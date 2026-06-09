import { WelcomeScreen } from './components/WelcomeScreen';
import { ProjectWorkspace } from './components/ProjectWorkspace';
import { DocumentPasswordDialog } from './components/DocumentPasswordDialog';
import { useAppStore } from './hooks/useAppStore';
import { isSupabaseConfigured } from './lib/supabaseClient';

function App() {
  const store = useAppStore();

  return (
    <>
      {!store.state.project ? (
        <WelcomeScreen
          onLoaded={store.setProject}
          onCreateNewDocument={store.createNewDocument}
          onLoadRemoteDoc={store.loadRemoteDocForWelcome}
          onLoadBundledHelp={store.loadBundledHelpForWelcome}
          onPickFolder={store.selectProjectFolder}
        />
      ) : (
        <ProjectWorkspace store={store} supabaseReady={isSupabaseConfigured()} />
      )}

      {store.pendingUnlock ? (
        <DocumentPasswordDialog
          title={store.pendingUnlock.title}
          description="This document is password-protected. Enter the password to load its content."
          error={store.unlockError}
          busy={store.unlockBusy}
          onSubmit={(password) => {
            void store.unlockPendingDocument(password);
          }}
          onCancel={store.cancelDocumentUnlock}
        />
      ) : null}
    </>
  );
}

export default App;
