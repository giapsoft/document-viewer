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
          description={
            store.pendingUnlock.source === 'remote-edit'
              ? 'This document is view-only. Enter the password to enable editing.'
              : store.pendingUnlock.source === 'local-import-remote'
                ? 'The selected local folder is password-protected. Enter its password to import and save to remote storage.'
              : store.pendingUnlock.source === 'remote' &&
                  store.pendingUnlock.publishMode === 'private'
                ? 'This private document requires the password before any content loads.'
                : 'This document is password-protected. Enter the password to load its content.'
          }
          confirmLabel={
            store.pendingUnlock.source === 'remote-edit'
              ? 'Unlock editing'
              : store.pendingUnlock.source === 'local-import-remote'
                ? 'Import and save'
                : 'Unlock'
          }
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
