import { Sidebar } from './Sidebar';
import { PagePanel } from './PagePanel';
import { EditBar } from './EditBar';
import { LinkModeToggle } from './LinkModeToggle';
import { ProjectFolderActions } from './ProjectFolderActions';
import type { useAppStore } from '../hooks/useAppStore';
import { useSelectionNavigationShortcuts } from '../hooks/useSelectionNavigationShortcuts';
import { useState } from 'react';

type AppStore = ReturnType<typeof useAppStore>;

interface ProjectWorkspaceProps {
  store: AppStore;
}

export function ProjectWorkspace({ store }: ProjectWorkspaceProps) {
  const {
    state,
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
    deleteActiveGroup,
    toggleLinkComponent,
    goBackSelection,
    goNextSelection,
    goPrevGroup,
    goNextGroup,
    importImage,
    importImageFromClipboard,
    createPage,
    renamePage,
    deletePage,
    togglePinPage,
    appendClipboardImageToPage,
    reloadProjectFromDisk,
    selectProjectFolder,
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

  const sidebarPages = project.pages.map((p) => ({
    fileName: p.fileName,
    pageId: p.pageId,
    pageName: p.pageName,
  }));
  const canManagePages = Boolean(project.folderHandle);
  const pinnedPages = project.relations.pinnedPages ?? [];
  const handleComponentClick = state.linkMode ? toggleLinkComponent : selectComponent;

  const matchingGroupIndices = state.selection?.matchingGroupIndices ?? [];
  const activeGroupIndex = state.selection?.activeGroupIndex ?? null;
  const matchingGroupPosition =
    activeGroupIndex === null ? -1 : matchingGroupIndices.indexOf(activeGroupIndex);
  const showGroupNav = !state.linkMode && matchingGroupIndices.length > 1;
  const groupNavLabel = showGroupNav
    ? `Group ${(matchingGroupPosition >= 0 ? matchingGroupPosition : 0) + 1}/${matchingGroupIndices.length}`
    : null;

  const groups = project.relations.groups;
  const linkEditingListIndex = state.linkTargetGroupIndex;
  const linkGroupMembers =
    state.linkMode && linkEditingListIndex !== null
      ? new Set(groups[linkEditingListIndex] ?? [])
      : new Set<string>();

  const canUnlinkGroup = state.linkMode
    ? linkEditingListIndex !== null
    : activeGroupIndex !== null;

  const [folderActionLoading, setFolderActionLoading] = useState(false);
  const [folderActionError, setFolderActionError] = useState<string | null>(null);

  const runFolderAction = async (action: () => Promise<{ ok: boolean; error?: string }>) => {
    setFolderActionError(null);
    setFolderActionLoading(true);
    try {
      const result = await action();
      if (!result.ok) {
        setFolderActionError(result.error ?? 'Could not complete the action.');
      }
    } finally {
      setFolderActionLoading(false);
    }
  };

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
              canGoPrevGroup={showGroupNav}
              canGoNextGroup={showGroupNav}
              groupNavLabel={groupNavLabel}
              onGroupPrev={goPrevGroup}
              onGroupNext={goNextGroup}
              linkEditingListIndex={linkEditingListIndex}
              linkTargetMemberCount={linkGroupMembers.size}
            />
            <ProjectFolderActions
              canReload={canManagePages}
              loading={folderActionLoading}
              error={folderActionError}
              onReload={() => void runFolderAction(reloadProjectFromDisk)}
              onSelectFolder={() => void runFolderAction(selectProjectFolder)}
              saveVisible={canManagePages}
              saveStatus={saveStatus}
              saveError={saveError}
            />
          </div>

          <div className="panel-row">
            {state.panels.length === 0 && (
              <div className="empty-panels">
                {project.pages.length === 0 && canManagePages
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
    </>
  );
}
