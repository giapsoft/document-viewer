import { Sidebar } from './Sidebar';
import { PagePanel } from './PagePanel';
import { EditBar } from './EditBar';
import { WorkspaceTopBar } from './WorkspaceTopBar';
import { ProjectToolbar } from './ProjectToolbar';
import { SaveDestinationDialog, type SaveDestination } from './SaveDestinationDialog';
import { RemoteConflictDialog } from './RemoteConflictDialog';
import type { useAppStore } from '../hooks/useAppStore';
import { useSelectionNavigationShortcuts } from '../hooks/useSelectionNavigationShortcuts';
import { useUnreadNavigationShortcuts } from '../hooks/useUnreadNavigationShortcuts';
import { useLinkedListPanelShortcuts } from '../hooks/useLinkedListPanelShortcuts';
import { useCtrlLinkModeHold } from '../hooks/useCtrlLinkModeHold';
import { useCtrlCommentLinkHold } from '../hooks/useCtrlCommentLinkHold';
import { useRemoteStalePoll } from '../hooks/useRemoteStalePoll';
import { CommentPanel } from './CommentPanel';
import { Toast } from './Toast';
import { GroupMembershipDialog } from './GroupMembershipDialog';
import { activeComments, canOwnComment, resolveCommentAnchorHighlightId } from '../lib/comments';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { isSaveInProgress } from '../lib/saveProject';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { pageHasHighlightedComponents, getMainGroupPageFiles } from '../lib/selectionHighlight';
import { countUnreadComponentsOnPage } from '../lib/readState';
import { getAdjacentComponentId } from '../lib/componentNavigation';
import { findComponent } from '../lib/projectMutations';
import { getGroupIndicesForComponent } from '../lib/groupRelations';
import { getDisplayGroups, getPersistedGroupIndicesForComponent } from '../lib/mdVirtualGroups';

const APP_TOAST_MS = 2000;

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
    pendingRemoteImages,
    pendingRemoteMd,
    toggleSidebar,
    expandSidebar,
    openPage,
    selectComponent,
    jumpToComponent,
    clearSelection,
    setMaxOpenPages,
    updateComponent,
    updateMdContent,
    insertComponentAbove,
    insertComponentBelow,
    deleteComponent,
    setLinkCtrlActive,
    setLinkTargetGroupIndex,
    setContentEditorOpen,
    clearAppToast,
    finishLinkSession,
    toggleCommentPanel,
    setCommentUsername,
    toggleComponentRead,
    toggleCommentRead,
    toggleAllCommentsRead,
    togglePageReadAll,
    toggleSelectedComponentRead,
    navigateToUnread,
    selectComment,
    setCommentLinkPreview,
    setCommentLinkCtrlActive,
    finishCommentLinkSession,
    addRootComment,
    addReplyComment,
    focusComment,
    outstandComment,
    updateComment,
    deleteComment,
    deleteActiveGroup,
    removeComponentFromGroupAtIndex,
    toggleLinkComponent,
    goBackSelection,
    goNextSelection,
    importImage,
    importImageFromClipboard,
    deleteProjectImage,
    createPage,
    renamePage,
    reorderPages,
    deletePage,
    reloadProject,
    saveToLocal,
    saveToRemote,
    checkRemoteDocumentStale,
    deleteRemoteLink,
    closeProject,
    suggestNewPageName,
    normalizePageName,
  } = store;

  const project = state.project!;
  const readShortcutsEnabled = Boolean(state.commentUsername);
  const [groupPanelOpen, setGroupPanelOpen] = useState(false);
  const [groupPanelActiveIndex, setGroupPanelActiveIndex] = useState<number | null>(null);

  const closeGroupPanel = useCallback(() => {
    setGroupPanelOpen(false);
    setGroupPanelActiveIndex(null);
  }, []);

  const openGroupPanel = useCallback(() => {
    if (!state.selection) return;
    const indices = getPersistedGroupIndicesForComponent(
      project.index,
      state.selection.componentId,
    );
    setGroupPanelActiveIndex(indices[0] ?? null);
    setGroupPanelOpen(true);
  }, [project.index, state.selection]);

  const toggleGroupPanel = useCallback(() => {
    if (groupPanelOpen) {
      closeGroupPanel();
      return;
    }
    openGroupPanel();
  }, [groupPanelOpen, closeGroupPanel, openGroupPanel]);

  const handleSelectGroupInPanel = useCallback(
    (groupIndex: number) => {
      setGroupPanelActiveIndex(groupIndex);
      if (state.linkMode) {
        setLinkTargetGroupIndex(groupIndex);
      }
    },
    [state.linkMode, setLinkTargetGroupIndex],
  );

  const panelGroups =
    state.linkMode && state.linkPreviewGroups
      ? state.linkPreviewGroups
      : project.index.groups;

  const panelComponentId =
    state.linkMode && state.linkFocusComponentId
      ? state.linkFocusComponentId
      : state.selection?.componentId ?? null;

  const panelGroupIndices = useMemo(() => {
    if (!panelComponentId) return [];
    if (state.linkMode && state.linkPreviewGroups) {
      return getGroupIndicesForComponent(state.linkPreviewGroups, panelComponentId);
    }
    return getPersistedGroupIndicesForComponent(project.index, panelComponentId);
  }, [
    panelComponentId,
    project.index,
    state.linkMode,
    state.linkPreviewGroups,
  ]);

  const persistedMatchingGroupIndices = useMemo(() => {
    if (!state.selection) return [];
    return getPersistedGroupIndicesForComponent(
      project.index,
      state.selection.componentId,
    );
  }, [project.index, state.selection?.componentId]);

  const panelActiveGroupIndex =
    state.linkMode && state.linkTargetGroupIndex !== null
      ? state.linkTargetGroupIndex
      : groupPanelActiveIndex;

  const handleSelectAdjacent = useCallback(
    (direction: 'up' | 'down') => {
      if (!state.selection) return;
      const located = findComponent(project, state.selection.componentId);
      if (!located) return;
      const page = project.pages.find((entry) => entry.fileName === located.pageFile);
      if (!page) return;
      const nextId = getAdjacentComponentId(page.components, state.selection.componentId, direction);
      if (nextId) selectComponent(nextId, located.pageFile, true);
    },
    [project, selectComponent, state.selection],
  );

  const handleToggleReadShortcut = useCallback(() => {
    toggleSelectedComponentRead();
  }, [toggleSelectedComponentRead]);

  useEffect(() => {
    if (!state.appToast) return;
    const toastId = state.appToast.id;
    const timer = window.setTimeout(() => clearAppToast(toastId), APP_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [state.appToast, clearAppToast]);

  useEffect(() => {
    if (!groupPanelOpen || state.linkMode) return;
    const indices = state.selection
      ? getPersistedGroupIndicesForComponent(
          project.index,
          state.selection.componentId,
        )
      : [];
    setGroupPanelActiveIndex((prev) =>
      prev !== null && indices.includes(prev) ? prev : (indices[0] ?? null),
    );
  }, [
    groupPanelOpen,
    state.linkMode,
    project.index,
    state.selection?.componentId,
  ]);

  const showSidebarColumn = groupPanelOpen || state.sidebarExpanded;

  const canGoBack = state.selectionHistoryIndex > 0;
  const canGoNext =
    state.selectionHistoryIndex >= 0 &&
    state.selectionHistoryIndex < state.selectionHistory.length - 1;

  useSelectionNavigationShortcuts({
    enabled:
      !state.selection &&
      !state.linkMode &&
      !state.commentLinkCtrlActive &&
      !state.contentEditorOpen,
    canGoBack,
    canGoNext,
    onBack: goBackSelection,
    onNext: goNextSelection,
  });

  const comments = activeComments(project.relations.comments ?? []);
  const selectedComment = state.selectedCommentId
    ? comments.find((c) => c.id === state.selectedCommentId)
    : null;
  const canLinkSelectedComment = Boolean(
    selectedComment &&
      canOwnComment(selectedComment, state.commentAuthorId, state.commentUsername),
  );

  const activateLinkMode = useCallback(() => {
    setLinkCtrlActive(true, groupPanelOpen ? groupPanelActiveIndex : undefined);
  }, [setLinkCtrlActive, groupPanelOpen, groupPanelActiveIndex]);

  useCtrlLinkModeHold({
    enabled: !state.contentEditorOpen && !state.commentLinkCtrlActive && !canLinkSelectedComment,
    ctrlActive: state.linkCtrlActive,
    setCtrlActive: (active) => {
      if (active) activateLinkMode();
    },
    onRelease: finishLinkSession,
  });

  useCtrlCommentLinkHold({
    enabled: !state.contentEditorOpen && canLinkSelectedComment,
    ctrlActive: state.commentLinkCtrlActive,
    setCtrlActive: setCommentLinkCtrlActive,
    onRelease: finishCommentLinkSession,
  });

  const commentLinkMode = canLinkSelectedComment && state.commentLinkCtrlActive;
  const commentLinkPreviewAnchor = state.commentLinkPreviewAnchor;
  const commentAnchorHighlightId = resolveCommentAnchorHighlightId(
    comments,
    state.selectedCommentId,
    state.outstandingCommentId,
    state.commentAuthorId,
    state.commentUsername,
  );

  const handleCommentMarkClick = (commentId: string, componentId: string, pageFile: string) => {
    if (commentLinkMode || state.linkMode) return;
    selectComponent(componentId, pageFile);
    outstandComment(commentId);
  };

  const findComponentType = (componentId: string) => {
    for (const page of project.pages) {
      const component = page.components.find((c) => c.id === componentId);
      if (component) return component.type;
    }
    return null;
  };

  const handleCommentLinkComponent = (componentId: string, _pageFile: string) => {
    if (!commentLinkMode) return;

    if (findComponentType(componentId) === 'md') return;

    const preview = commentLinkPreviewAnchor;
    if (preview?.kind === 'component' && preview.componentId === componentId) {
      setCommentLinkPreview(null);
      return;
    }

    setCommentLinkPreview({
      kind: 'component',
      componentId,
    });
  };

  const handleComponentClick = (componentId: string, pageFile: string) => {
    if (commentLinkMode) {
      handleCommentLinkComponent(componentId, pageFile);
      return;
    }
    if (state.linkMode) {
      toggleLinkComponent(componentId, pageFile);
      return;
    }
    selectComponent(componentId, pageFile);
  };

  const handleCommentLinkMdRange = (
    componentId: string,
    _pageFile: string,
    range: import('../lib/mdSelection').MdTextRange,
  ) => {
    if (!commentLinkMode) return;
    setCommentLinkPreview({
      kind: 'md-range',
      componentId,
      start: range.start,
      end: range.end,
      excerpt: range.excerpt,
      segments: range.segments,
    });
  };

  const sidebarPages = useMemo(
    () =>
      project.pages.map((p) => ({
        fileName: p.fileName,
        pageId: p.pageId,
        pageName: p.pageName,
        componentCount: p.components.length,
        unreadCount: state.commentUsername
          ? countUnreadComponentsOnPage(p.components, state.componentReadState)
          : null,
      })),
    [project.pages, state.commentUsername, state.componentReadState],
  );
  const canManagePages = true;
  const panelPageFiles = useMemo(
    () => new Set(state.panels.map((panel) => panel.pageFile)),
    [state.panels],
  );
  const highlightedPageFiles = useMemo(() => {
    const files = new Set<string>();
    if (!state.selection) return files;
    for (const page of project.pages) {
      if (pageHasHighlightedComponents(page, state.selection, state.currentPage)) {
        files.add(page.fileName);
      }
    }
    return files;
  }, [project.pages, state.selection, state.currentPage]);

  const mainGroupPageFiles = useMemo(() => {
    if (!state.selection) return new Set<string>();
    return getMainGroupPageFiles(
      project.index.groups,
      state.selection,
      project.index.componentToPage,
    );
  }, [project.index, state.selection]);

  const mainSelectionPageFile = useMemo(() => {
    if (!state.selection) return null;
    return (
      project.index.componentToPage.get(state.selection.componentId) ?? null
    );
  }, [project.index, state.selection]);

  const groups = state.linkPreviewGroups ?? getDisplayGroups(project.index);
  const linkEditingListIndex = state.linkTargetGroupIndex;
  const linkGroupMembers =
    state.linkMode && linkEditingListIndex !== null
      ? new Set(groups[linkEditingListIndex] ?? [])
      : new Set<string>();

  const canUnlinkGroup = state.linkMode
    ? linkEditingListIndex !== null
    : persistedMatchingGroupIndices.length > 0;

  const [toolbarLoading, setToolbarLoading] = useState(false);
  const [toolbarError, setToolbarError] = useState(null as string | null);
  const [saveDestinationOpen, setSaveDestinationOpen] = useState(false);
  const [remoteConflictOpen, setRemoteConflictOpen] = useState(false);
  const [pendingRemoteTitle, setPendingRemoteTitle] = useState<string | undefined>();

  const workspaceShortcutsBlocked =
    state.linkMode ||
    state.commentLinkCtrlActive ||
    state.contentEditorOpen ||
    saveDestinationOpen ||
    remoteConflictOpen;

  useUnreadNavigationShortcuts({
    enabled: readShortcutsEnabled && !workspaceShortcutsBlocked,
    onNavigateUnread: navigateToUnread,
  });

  const canToggleLinkedList = Boolean(state.selection);

  useLinkedListPanelShortcuts({
    enabled: !workspaceShortcutsBlocked,
    isOpen: groupPanelOpen,
    canOpen: canToggleLinkedList,
    onOpen: openGroupPanel,
    onClose: closeGroupPanel,
  });

  const showShortcutsHint =
    !workspaceShortcutsBlocked && (Boolean(state.selection) || readShortcutsEnabled);

  const autoPullRemoteDocument = useCallback(async () => {
    if (dirty || state.contentEditorOpen) return;
    await reloadProject();
  }, [dirty, state.contentEditorOpen, reloadProject]);

  const remoteStaleOnServer = useRemoteStalePoll(
    Boolean(project.remoteDocId && project.remoteUpdatedAt) &&
      !dirty &&
      !isSaveInProgress(saveStatus),
    checkRemoteDocumentStale,
    undefined,
    project.remoteUpdatedAt,
    autoPullRemoteDocument,
  );

  const runRemoteSave = useCallback(
    async (title?: string, force = false) => {
      const result = await saveToRemote(title, { force });
      if (result.ok) return { ok: true as const };
      if (result.conflict) {
        setPendingRemoteTitle(title);
        setRemoteConflictOpen(true);
        return { ok: true as const };
      }
      return { ok: false as const, error: result.error };
    },
    [saveToRemote],
  );

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
    if (state.contentEditorOpen) {
      setToolbarError('Close the content editor before saving.');
      return;
    }
    if (!canSave) {
      setToolbarError('Saving requires Chrome/Edge (local) or remote storage on this site.');
      return;
    }
    setSaveDestinationOpen(true);
  };

  const handleChooseDestination = (destination: SaveDestination, remoteTitle?: string) => {
    setSaveDestinationOpen(false);

    if (destination === 'local') {
      void runToolbarAction(async () => {
        const result = await saveToLocal();
        if (!result.ok && result.cancelled) return { ok: true };
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      });
      return;
    }

    void runToolbarAction(async () => runRemoteSave(remoteTitle));
  };

  const handleClose = () => {
    if (dirty) {
      const leave = window.confirm('You have unsaved changes. Close anyway?');
      if (!leave) return;
    }
    closeProject();
  };

  const sourceParts: string[] = [];
  if (project.bundledHelp) {
    sourceParts.push('Built-in guide');
  } else {
    if (project.remoteDocId) {
      sourceParts.push(project.remoteTitle ?? 'Remote document');
    }
    if (project.folderHandle) {
      sourceParts.push('Local folder');
    }
  }
  const sourceLabel = sourceParts.length > 0 ? sourceParts.join(' · ') : 'Unsaved draft';
  const canReloadFromLocal = Boolean(project.folderHandle && !project.remoteDocId);

  const handleReloadFromLocal = () => {
    if (state.contentEditorOpen) {
      setToolbarError('Close the content editor before reloading.');
      return;
    }
    if (dirty) {
      const proceed = window.confirm(
        'You have unsaved changes. Reload from disk anyway? Unsaved edits will be lost.',
      );
      if (!proceed) return;
    }
    void runToolbarAction(reloadProject);
  };

  return (
    <>
      <div className={`app ${showSidebarColumn ? 'sidebar-open' : 'sidebar-collapsed'}`}>
        {groupPanelOpen ? (
          <GroupMembershipDialog
            project={project}
            groups={panelGroups}
            anchorComponentId={panelComponentId}
            groupIndices={panelGroupIndices}
            activeGroupIndex={panelActiveGroupIndex}
            linkMode={state.linkMode}
            onSelectGroup={handleSelectGroupInPanel}
            onRemoveMember={(groupIndex, componentId) => {
              removeComponentFromGroupAtIndex(componentId, groupIndex);
            }}
            onNavigateToComponent={jumpToComponent}
            onClose={closeGroupPanel}
          />
        ) : (
          <Sidebar
            expanded={state.sidebarExpanded}
            pages={sidebarPages}
            canManagePages={canManagePages}
            onSelectPage={openPage}
            onToggle={toggleSidebar}
            maxOpenPages={state.maxOpenPages}
            onMaxOpenPagesChange={setMaxOpenPages}
            onCreatePage={createPage}
            onRenamePage={renamePage}
            onReorderPages={reorderPages}
            onDeletePage={deletePage}
            panelPageFiles={panelPageFiles}
            highlightedPageFiles={highlightedPageFiles}
            mainGroupPageFiles={mainGroupPageFiles}
            mainSelectionPageFile={mainSelectionPageFile}
            suggestNewPageName={suggestNewPageName}
            normalizePageName={normalizePageName}
          />
        )}

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

          {remoteStaleOnServer && !dirty && project.remoteDocId && (
            <div className="remote-stale-banner" role="status">
              <span>
                A newer version is on the server but could not be loaded automatically.
              </span>
              <button
                type="button"
                className="remote-stale-banner-btn"
                onClick={() => void runToolbarAction(reloadProject)}
                disabled={toolbarLoading}
              >
                Reload
              </button>
            </div>
          )}

          <div className="workspace-top-bar">
            <WorkspaceTopBar
              linkMode={state.linkMode}
              canUnlink={canUnlinkGroup}
              onUnlink={deleteActiveGroup}
              sidebarCollapsed={!showSidebarColumn}
              onExpandSidebar={expandSidebar}
              canGoBack={canGoBack}
              canGoNext={canGoNext}
              onSelectionBack={goBackSelection}
              onSelectionNext={goNextSelection}
              linkEditingListIndex={linkEditingListIndex}
              linkTargetMemberCount={linkGroupMembers.size}
              showComponentShortcuts={showShortcutsHint}
              readShortcutsEnabled={readShortcutsEnabled}
              hasComponentSelection={Boolean(state.selection)}
              linkedListPanelOpen={groupPanelOpen}
              canToggleLinkedList={canToggleLinkedList}
            />
            <ProjectToolbar
              dirty={dirty}
              canSave={canSave}
              canReloadFromLocal={canReloadFromLocal}
              loading={toolbarLoading}
              error={toolbarError}
              saveStatus={saveStatus}
              saveError={saveError}
              sourceLabel={sourceLabel}
              onSave={handleSave}
              onReload={handleReloadFromLocal}
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
                project={project}
                isCurrent={state.currentPage === panel.pageFile}
                selection={state.selection}
                linkMode={state.linkMode}
                linkGroupMembers={linkGroupMembers}
                pendingImageNames={pendingRemoteImages}
                pendingMdComponentIds={pendingRemoteMd}
                onClose={() => openPage(panel.pageFile)}
                onSelect={handleComponentClick}
                onClearSelection={clearSelection}
                scrollToComponentId={state.scrollToComponent?.componentId ?? null}
                scrollNonce={state.scrollToComponent?.nonce ?? 0}
                scrollColdOpen={state.scrollToComponent?.coldOpen ?? false}
                flashedComponentId={state.flashedComponent?.componentId ?? null}
                flashNonce={state.flashedComponent?.nonce ?? 0}
                selectionScrollNonce={state.selectionScrollNonce}
                commentLinkMode={commentLinkMode}
                commentLinkPreviewAnchor={commentLinkPreviewAnchor}
                commentAnchorHighlightId={commentAnchorHighlightId}
                outstandingCommentId={state.outstandingCommentId}
                onCommentLinkComponent={handleCommentLinkComponent}
                onCommentLinkMdRange={handleCommentLinkMdRange}
                onCommentMarkClick={handleCommentMarkClick}
                onNavigateToComponent={jumpToComponent}
                commentUsername={state.commentUsername}
                componentReadState={state.componentReadState}
                onToggleComponentRead={toggleComponentRead}
                onTogglePageReadAll={togglePageReadAll}
                onOpenGroupDialog={toggleGroupPanel}
                linkedListPanelOpen={groupPanelOpen}
              />
            ))}
            <CommentPanel
              expanded={state.commentPanelExpanded}
              project={project}
              username={state.commentUsername}
              authorId={state.commentAuthorId}
              selectedCommentId={state.selectedCommentId}
              outstandingCommentId={state.outstandingCommentId}
              commentPanelScrollNonce={state.commentPanelScrollNonce}
              commentLinkCtrlActive={state.commentLinkCtrlActive}
              canLinkSelectedComment={canLinkSelectedComment}
              onSelectComment={selectComment}
              onToggle={toggleCommentPanel}
              onSetUsername={setCommentUsername}
              onAddRoot={addRootComment}
              onAddReply={addReplyComment}
              onFocusComment={focusComment}
              onUpdateComment={updateComment}
              onDeleteComment={deleteComment}
              commentReadState={state.commentReadState}
              onToggleCommentRead={toggleCommentRead}
              onToggleAllCommentsRead={toggleAllCommentsRead}
            />
          </div>

          <EditBar
            project={project}
            selection={state.selection}
            shortcutsEnabled={
              !state.linkMode && !state.commentLinkCtrlActive && !state.contentEditorOpen
            }
            onUpdate={updateComponent}
            onUpdateMdContent={updateMdContent}
            onInsertAbove={insertComponentAbove}
            onInsertBelow={insertComponentBelow}
            onDeleteComponent={deleteComponent}
            onImportImage={importImage}
            onImportImageFromClipboard={importImageFromClipboard}
            onDeleteProjectImage={deleteProjectImage}
            onContentEditorOpenChange={setContentEditorOpen}
            readShortcutsEnabled={readShortcutsEnabled}
            onSelectAdjacent={handleSelectAdjacent}
            onToggleRead={handleToggleReadShortcut}
          />
        </main>
      </div>

      {saveDestinationOpen && (
        <SaveDestinationDialog
          project={project}
          dirty={dirty}
          onClose={() => setSaveDestinationOpen(false)}
          onChoose={handleChooseDestination}
          onDeleteRemote={() => {
            setSaveDestinationOpen(false);
            void runToolbarAction(deleteRemoteLink);
          }}
        />
      )}

      {remoteConflictOpen && (
        <RemoteConflictDialog
          onClose={() => setRemoteConflictOpen(false)}
          onReload={() => {
            setRemoteConflictOpen(false);
            void runToolbarAction(reloadProject);
          }}
          onOverwrite={() => {
            setRemoteConflictOpen(false);
            void runToolbarAction(async () => runRemoteSave(pendingRemoteTitle, true));
          }}
        />
      )}

      {state.appToast ? <Toast message={state.appToast.message} /> : null}
    </>
  );
}
