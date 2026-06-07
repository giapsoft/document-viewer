import { Sidebar } from './Sidebar';
import { PagePanel } from './PagePanel';
import { EditBar } from './EditBar';
import { WorkspaceTopBar } from './WorkspaceTopBar';
import { ProjectToolbar } from './ProjectToolbar';
import { SaveDestinationDialog, type SaveDestination } from './SaveDestinationDialog';
import { RemoteConflictDialog } from './RemoteConflictDialog';
import type { useAppStore } from '../hooks/useAppStore';
import { useSelectionNavigationShortcuts } from '../hooks/useSelectionNavigationShortcuts';
import { useCtrlLinkModeHold } from '../hooks/useCtrlLinkModeHold';
import { useCtrlCommentLinkHold } from '../hooks/useCtrlCommentLinkHold';
import { useRemoteStalePoll } from '../hooks/useRemoteStalePoll';
import { CommentPanel } from './CommentPanel';
import { activeComments, canOwnComment, resolveCommentAnchorHighlightId } from '../lib/comments';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { isSaveInProgress } from '../lib/saveProject';
import { useCallback, useMemo, useState } from 'react';
import { pageHasHighlightedComponents } from '../lib/selectionHighlight';

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
    clearSelection,
    togglePanel,
    updateComponent,
    updateMdContent,
    insertComponentAbove,
    insertComponentBelow,
    deleteComponent,
    setLinkCtrlActive,
    setContentEditorOpen,
    finishLinkSession,
    toggleCommentPanel,
    setCommentUsername,
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
    toggleLinkComponent,
    goBackSelection,
    goNextSelection,
    importImage,
    importImageFromClipboard,
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

  const canGoBack = state.selectionHistoryIndex > 0;
  const canGoNext =
    state.selectionHistoryIndex >= 0 &&
    state.selectionHistoryIndex < state.selectionHistory.length - 1;

  useSelectionNavigationShortcuts({
    enabled: !state.linkMode && !state.commentLinkCtrlActive && !state.contentEditorOpen,
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

  useCtrlLinkModeHold({
    enabled: !state.contentEditorOpen && !state.commentLinkCtrlActive && !canLinkSelectedComment,
    ctrlActive: state.linkCtrlActive,
    setCtrlActive: setLinkCtrlActive,
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

  const sidebarPages = project.pages.map((p) => ({
    fileName: p.fileName,
    pageId: p.pageId,
    pageName: p.pageName,
    componentCount: p.components.length,
  }));
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

  const mainSelectionPageFile = useMemo(() => {
    if (!state.selection) return null;
    return (
      project.index.componentToPage.get(state.selection.componentId) ?? null
    );
  }, [project.index, state.selection]);

  const matchingGroupIndices = state.selection?.matchingGroupIndices ?? [];

  const groups = state.linkPreviewGroups ?? project.relations.groups;
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
  const [remoteConflictOpen, setRemoteConflictOpen] = useState(false);
  const [pendingRemoteTitle, setPendingRemoteTitle] = useState<string | undefined>();

  const remoteStaleOnServer = useRemoteStalePoll(
    Boolean(project.remoteDocId && project.remoteUpdatedAt) && !isSaveInProgress(saveStatus),
    checkRemoteDocumentStale,
    undefined,
    project.remoteUpdatedAt,
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
          canManagePages={canManagePages}
          onSelectPage={openPage}
          onToggle={toggleSidebar}
          onCreatePage={createPage}
          onRenamePage={renamePage}
          onReorderPages={reorderPages}
          onDeletePage={deletePage}
          panelPageFiles={panelPageFiles}
          highlightedPageFiles={highlightedPageFiles}
          mainSelectionPageFile={mainSelectionPageFile}
          suggestNewPageName={suggestNewPageName}
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

          {remoteStaleOnServer && !dirty && project.remoteDocId && (
            <div className="remote-stale-banner" role="status">
              <span>A newer version of this document is on the server.</span>
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
              canSave={canSave}
              loading={toolbarLoading}
              error={toolbarError}
              saveStatus={saveStatus}
              saveError={saveError}
              sourceLabel={sourceLabel}
              onSave={handleSave}
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
                pendingImageNames={pendingRemoteImages}
                pendingMdComponentIds={pendingRemoteMd}
                onToggle={() => togglePanel(panel.pageFile)}
                onSelect={handleComponentClick}
                onClearSelection={clearSelection}
                scrollToComponentId={state.scrollToComponent?.componentId ?? null}
                scrollNonce={state.scrollToComponent?.nonce ?? 0}
                selectionScrollNonce={state.selectionScrollNonce}
                commentLinkMode={commentLinkMode}
                commentLinkPreviewAnchor={commentLinkPreviewAnchor}
                commentAnchorHighlightId={commentAnchorHighlightId}
                outstandingCommentId={state.outstandingCommentId}
                onCommentLinkComponent={handleCommentLinkComponent}
                onCommentLinkMdRange={handleCommentLinkMdRange}
                onCommentMarkClick={handleCommentMarkClick}
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
            />
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
            onContentEditorOpenChange={setContentEditorOpen}
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
    </>
  );
}
