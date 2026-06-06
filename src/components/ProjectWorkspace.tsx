import { Sidebar } from './Sidebar';
import { PagePanel } from './PagePanel';
import { EditBar } from './EditBar';
import { LinkModeToggle } from './LinkModeToggle';
import { ProjectToolbar } from './ProjectToolbar';
import { SaveDestinationDialog, type SaveDestination } from './SaveDestinationDialog';
import { SaveDocDialog } from './SaveDocDialog';
import type { useAppStore } from '../hooks/useAppStore';
import { useSelectionNavigationShortcuts } from '../hooks/useSelectionNavigationShortcuts';
import { useCtrlLinkModeHold } from '../hooks/useCtrlLinkModeHold';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { useState } from 'react';

type AppStore = ReturnType<typeof useAppStore>;

interface ProjectWorkspaceProps {
  store: AppStore;
  supabaseReady: boolean;
}

export function ProjectWorkspace({ store, supabaseReady: remoteStorageReady }: ProjectWorkspaceProps) {
  const {
    state,
    dirty,
    saveStatus,
    saveError,
    toggleSidebar,
    expandSidebar,
    openPage,
    selectComponent,
    clearSelection,
    togglePanel,
    updateComponent,
    updateMdContent,
    insertComponentAbove,
    insertComponentBelow,
    deleteComponent,
    toggleLinkMode,
    setLinkMode,
    deleteActiveGroup,
    toggleLinkComponent,
    goBackSelection,
    goNextSelection,
    importImage,
    importImageFromClipboard,
    createPage,
    renamePage,
    reorderPages,
    deletePage,
    togglePinPage,
    appendClipboardImageToPage,
    reloadProject,
    selectProjectFolder,
    saveToLocal,
    saveToRemote,
    deleteRemoteLink,
    closeProject,
    suggestNewPageFileName,
    normalizePageFileName,
    normalizePageName,
  } = store;

  const project = state.project!;

  const canGoBack = state.selectionHistoryIndex > 0;
  const canGoNext =
    state.selectionHistoryIndex >= 0 &&
    state.selectionHistoryIndex < state.selectionHistory.length - 1;

  useSelectionNavigationShortcuts({
    enabled: !state.linkMode,
    canGoBack,
    canGoNext,
    onBack: goBackSelection,
    onNext: goNextSelection,
  });

  useCtrlLinkModeHold({
    enabled: true,
    linkMode: state.linkMode,
    setLinkMode,
  });

  const sidebarPages = project.pages.map((p) => ({
    fileName: p.fileName,
    pageId: p.pageId,
    pageName: p.pageName,
    componentCount: p.components.length,
  }));
  const canManagePages = true;
  const pinnedPages = project.relations.pinnedPages ?? [];
  const handleComponentClick = state.linkMode ? toggleLinkComponent : selectComponent;

  const matchingGroupIndices = state.selection?.matchingGroupIndices ?? [];

  const groups = project.relations.groups;
  const linkEditingListIndex = state.linkTargetGroupIndex;
  const linkGroupMembers =
    state.linkMode && linkEditingListIndex !== null
      ? new Set(groups[linkEditingListIndex] ?? [])
      : new Set<string>();

  const canUnlinkGroup = state.linkMode
    ? linkEditingListIndex !== null
    : matchingGroupIndices.length > 0;

  const [toolbarLoading, setToolbarLoading] = useState(false);
  const [toolbarError, setToolbarError] = useState(null as string | null);
  const [saveDestinationOpen, setSaveDestinationOpen] = useState(false);
  const [remoteTitleOpen, setRemoteTitleOpen] = useState(false);

  const canSaveLocal = Boolean(window.showDirectoryPicker);
  const canSaveRemote = remoteStorageReady && isSupabaseConfigured();
  const canSave = canSaveLocal || canSaveRemote;

  const runToolbarAction = async (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setToolbarError(null);
    setToolbarLoading(true);
    try {
      const result = await action();
      if (!result.ok) {
        setToolbarError(result.error ?? 'Could not complete the action.');
      }
    } finally {
      setToolbarLoading(false);
    }
  };

  const handleSave = () => {
    if (!canSave) {
      setToolbarError('Saving requires Chrome/Edge (local) or remote storage on this site.');
      return;
    }
    setSaveDestinationOpen(true);
  };

  const handleChooseDestination = (destination: SaveDestination) => {
    setSaveDestinationOpen(false);

    if (destination === 'local') {
      void runToolbarAction(async () => {
        const result = await saveToLocal();
        if (!result.ok && result.cancelled) return { ok: true };
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      });
      return;
    }

    if (project.remoteDocId) {
      void runToolbarAction(async () => {
        const result = await saveToRemote();
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      });
      return;
    }

    setRemoteTitleOpen(true);
  };

  const handleClose = () => {
    if (dirty) {
      const leave = window.confirm('You have unsaved changes. Close anyway?');
      if (!leave) return;
    }
    closeProject();
  };

  const sourceParts: string[] = [];
  if (project.remoteDocId) {
    sourceParts.push(project.remoteTitle ?? 'Remote document');
  }
  if (project.folderHandle) {
    sourceParts.push('Local folder');
  }
  const sourceLabel = sourceParts.length > 0 ? sourceParts.join(' · ') : 'Unsaved draft';

  return (
    <>
      <div className={`app ${state.sidebarExpanded ? 'sidebar-open' : 'sidebar-collapsed'}`}>
        <Sidebar
          expanded={state.sidebarExpanded}
          pages={sidebarPages}
          currentPage={state.currentPage}
          canManagePages={canManagePages}
          onSelectPage={openPage}
          onToggle={toggleSidebar}
          onCreatePage={createPage}
          onRenamePage={renamePage}
          onReorderPages={reorderPages}
          onDeletePage={deletePage}
          pinnedPages={pinnedPages}
          onTogglePinPage={togglePinPage}
          onAppendClipboardImage={appendClipboardImageToPage}
          suggestNewPageFileName={suggestNewPageFileName}
          normalizePageFileName={normalizePageFileName}
          normalizePageName={normalizePageName}
        />

        <main
          className="main-area"
          onClick={(e) => {
            if (e.target === e.currentTarget) clearSelection();
          }}
        >
          {project.warnings.length > 0 && (
            <div className="warnings-bar">
              {project.warnings.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>
          )}

          <div className="link-mode-bar">
            <LinkModeToggle
              enabled={state.linkMode}
              onToggle={toggleLinkMode}
              canUnlink={canUnlinkGroup}
              onUnlink={deleteActiveGroup}
              sidebarCollapsed={!state.sidebarExpanded}
              onExpandSidebar={expandSidebar}
              canGoBack={canGoBack}
              canGoNext={canGoNext}
              onSelectionBack={goBackSelection}
              onSelectionNext={goNextSelection}
              linkEditingListIndex={linkEditingListIndex}
              linkTargetMemberCount={linkGroupMembers.size}
            />
            <ProjectToolbar
              dirty={dirty}
              canReload
              canSave={canSave}
              loading={toolbarLoading}
              error={toolbarError}
              saveStatus={saveStatus}
              saveError={saveError}
              sourceLabel={sourceLabel}
              onSave={handleSave}
              onReload={() => void runToolbarAction(reloadProject)}
              onSelectFolder={() => void runToolbarAction(selectProjectFolder)}
              onClose={handleClose}
            />
          </div>

          <div className="panel-row">
            {state.panels.length === 0 && (
              <div className="empty-panels">
                {project.pages.length === 0
                  ? 'No pages yet. Use + New page in the sidebar to create the first one.'
                  : 'Select a page from the sidebar to get started.'}
              </div>
            )}
            {state.panels.map((panel) => (
              <PagePanel
                key={panel.pageFile}
                pageFile={panel.pageFile}
                expanded={panel.expanded}
                project={project}
                isCurrent={state.currentPage === panel.pageFile}
                selection={state.selection}
                linkMode={state.linkMode}
                linkGroupMembers={linkGroupMembers}
                onToggle={() => togglePanel(panel.pageFile)}
                onSelect={handleComponentClick}
                onClearSelection={clearSelection}
                scrollToComponentId={state.scrollToComponent?.componentId ?? null}
                scrollNonce={state.scrollToComponent?.nonce ?? 0}
                selectionScrollNonce={state.selectionScrollNonce}
              />
            ))}
          </div>

          <EditBar
            project={project}
            selection={state.selection}
            onUpdate={updateComponent}
            onUpdateMdContent={updateMdContent}
            onInsertAbove={insertComponentAbove}
            onInsertBelow={insertComponentBelow}
            onDeleteComponent={deleteComponent}
            onImportImage={importImage}
            onImportImageFromClipboard={importImageFromClipboard}
          />
        </main>
      </div>

      {saveDestinationOpen && (
        <SaveDestinationDialog
          project={project}
          onClose={() => setSaveDestinationOpen(false)}
          onChoose={handleChooseDestination}
          onDeleteRemote={() => {
            setSaveDestinationOpen(false);
            void runToolbarAction(deleteRemoteLink);
          }}
        />
      )}

      {remoteTitleOpen && (
        <SaveDocDialog
          project={project}
          onClose={() => setRemoteTitleOpen(false)}
          onConfirm={(title) => {
            setRemoteTitleOpen(false);
            void runToolbarAction(async () => {
              const result = await saveToRemote(title);
              return result.ok ? { ok: true } : { ok: false, error: result.error };
            });
          }}
        />
      )}
    </>
  );
}
