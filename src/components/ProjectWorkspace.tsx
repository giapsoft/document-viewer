import { Sidebar } from './Sidebar';
import { PagePanel } from './PagePanel';
import { EditBar } from './EditBar';
import { WorkspaceTopBar } from './WorkspaceTopBar';
import { ProjectToolbar } from './ProjectToolbar';
import { SaveDestinationDialog, type SaveDestinationChoice, type ImportLocalToRemoteParams } from './SaveDestinationDialog';
import { RemoteConflictDialog } from './RemoteConflictDialog';
import type { useAppStore } from '../hooks/useAppStore';
import { useSelectionNavigationShortcuts } from '../hooks/useSelectionNavigationShortcuts';
import { useUnreadNavigationShortcuts } from '../hooks/useUnreadNavigationShortcuts';
import { useLinkedListPanelShortcuts } from '../hooks/useLinkedListPanelShortcuts';
import { useSidebarShortcuts } from '../hooks/useSidebarShortcuts';
import { usePagePanelReorder } from '../hooks/usePagePanelReorder';
import { useCtrlLinkModeHold } from '../hooks/useCtrlLinkModeHold';
import { useCtrlCommentLinkHold } from '../hooks/useCtrlCommentLinkHold';
import { useMdLinkHold } from '../hooks/useMdLinkHold';
import {
  getMdSelectionForComponent,
  unwrapMdComponentLinkAtOffset,
  wrapMdRangeWithComponentLink,
} from '../lib/mdComponentLinkInsert';
import type { MdTextRange } from '../lib/mdSelection';
import { CommentPanel } from './CommentPanel';
import { Toast } from './Toast';
import { GroupMembershipDialog } from './GroupMembershipDialog';
import { activeComments, canOwnComment, resolveCommentAnchorHighlightId } from '../lib/comments';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelResizeHandle } from './PanelResizeHandle';
import { usePagePanelResize } from '../hooks/usePagePanelResize';
import { usePagePanelsTrackRef } from '../hooks/usePagePanelsTrackRef';
import {
  loadPanelWidths,
  resolvePanelWidthProjectKey,
} from '../lib/panelWidthStorage';
import { setPanelSlotElement } from '../lib/panelSlotRegistry';
import type { PanelState } from '../types';
import { pageHasHighlightedComponents, getMainGroupPageFiles } from '../lib/selectionHighlight';
import { countUnreadComponentsOnPage } from '../lib/readState';
import { getAdjacentComponentId } from '../lib/componentNavigation';
import { findComponent } from '../lib/projectMutations';
import { getGroupIndicesForComponent } from '../lib/groupRelations';
import { getDisplayGroups, getPersistedGroupIndicesForComponent } from '../lib/mdVirtualGroups';
import { exportGroupToFolder } from '../lib/exportGroupMarkdown';

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
    closePagePanel,
    togglePanelPin,
    selectComponent,
    jumpToComponent,
    clearSelection,
    setMaxOpenPages,
    reorderPanels,
    resizePanelSplit,
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
    reorderGroupMembers,
    showAppToast,
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
    importLocalToRemote,
    deleteRemoteLink,
    closeProject,
    suggestNewPageName,
    normalizePageName,
    isEditLocked,
    requestEditUnlock,
  } = store;

  const project = state.project!;
  const panelSlotRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const panelWidthProjectKey = useMemo(
    () => resolvePanelWidthProjectKey(project),
    [project],
  );
  const storedPanelWidths = useMemo(
    () => loadPanelWidths(panelWidthProjectKey),
    [panelWidthProjectKey, state.panels],
  );
  const { startResize } = usePagePanelResize(panelSlotRefs, resizePanelSplit);

  const resolvePanelWidth = useCallback(
    (panel: PanelState): number | undefined =>
      panel.widthPx ?? storedPanelWidths[panel.pageFile],
    [storedPanelWidths],
  );

  const panelTrackRef = usePagePanelsTrackRef();

  const registerPanelSlot = useCallback((pageFile: string, el: HTMLDivElement | null) => {
    setPanelSlotElement(pageFile, el);
    if (el) panelSlotRefs.current.set(pageFile, el);
    else panelSlotRefs.current.delete(pageFile);
  }, []);

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

  const handleExportGroup = useCallback(
    async (groupIndex: number, memberIds: string[]) => {
      const result = await exportGroupToFolder(project, memberIds, groupIndex);
      if (result.ok) {
        showAppToast(`Exported ${result.fileName} to ${result.folderName}`);
        return;
      }
      if ('cancelled' in result && result.cancelled) return;
      showAppToast('error' in result ? result.error : 'Export failed.');
    },
    [project, showAppToast],
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
  const canLinkSelectedComment =
    !isEditLocked &&
    Boolean(
      selectedComment &&
        canOwnComment(selectedComment, state.commentAuthorId, state.commentUsername),
    );

  const selectedLocated = state.selection
    ? findComponent(project, state.selection.componentId)
    : null;
  const selectedIsMd = selectedLocated?.component.type === 'md';

  const [mdLinkCtrlActive, setMdLinkCtrlActive] = useState(false);
  const [mdLinkCapturedRange, setMdLinkCapturedRange] = useState<MdTextRange | null>(null);
  const [mdLinkToast, setMdLinkToast] = useState<string | null>(null);

  const canMdLink =
    !isEditLocked && !state.contentEditorOpen && !canLinkSelectedComment && selectedIsMd;

  const finishMdLinkSession = useCallback(() => {
    setMdLinkCtrlActive(false);
    setMdLinkCapturedRange(null);
  }, []);

  const tryActivateMdLink = useCallback(() => {
    if (!state.selection || !selectedIsMd) return false;
    const componentId = state.selection.componentId;
    const source = project.mdFiles.get(componentId) ?? '';
    const range = getMdSelectionForComponent(componentId, source);
    if (!range) return false;
    setMdLinkCapturedRange(range);
    return true;
  }, [state.selection, selectedIsMd, project.mdFiles]);

  const shouldDeferGroupLinkToMdText = useCallback(() => {
    if (!state.selection || !selectedIsMd) return false;
    const componentId = state.selection.componentId;
    const source = project.mdFiles.get(componentId) ?? '';
    return getMdSelectionForComponent(componentId, source) !== null;
  }, [state.selection, selectedIsMd, project.mdFiles]);

  useMdLinkHold({
    enabled: canMdLink,
    ctrlActive: mdLinkCtrlActive,
    setCtrlActive: setMdLinkCtrlActive,
    onActivate: tryActivateMdLink,
    onRelease: finishMdLinkSession,
  });

  const mdLinkMode = mdLinkCtrlActive && mdLinkCapturedRange !== null;
  const mdLinkSourceComponentId = mdLinkMode ? state.selection?.componentId ?? null : null;

  useEffect(() => {
    if (!mdLinkToast) return;
    const timer = window.setTimeout(() => setMdLinkToast(null), APP_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [mdLinkToast]);

  const activateLinkMode = useCallback(() => {
    setLinkCtrlActive(true, groupPanelOpen ? groupPanelActiveIndex : undefined);
  }, [setLinkCtrlActive, groupPanelOpen, groupPanelActiveIndex]);

  useCtrlLinkModeHold({
    enabled:
      !isEditLocked &&
      !state.contentEditorOpen &&
      !state.commentLinkCtrlActive &&
      !canLinkSelectedComment,
    ctrlActive: state.linkCtrlActive,
    setCtrlActive: (active) => {
      if (active) activateLinkMode();
    },
    shouldDeferActivate: shouldDeferGroupLinkToMdText,
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

  const handleMdLinkTarget = (targetId: string, _pageFile: string) => {
    if (!mdLinkMode || !mdLinkCapturedRange || !state.selection) return;
    const sourceId = state.selection.componentId;
    if (targetId === sourceId) return;

    const source = project.mdFiles.get(sourceId) ?? '';
    const result = wrapMdRangeWithComponentLink(source, mdLinkCapturedRange, targetId);
    if (!result.ok) {
      setMdLinkToast(result.reason);
      finishMdLinkSession();
      return;
    }

    updateMdContent(sourceId, result.content);
    finishMdLinkSession();
    window.getSelection()?.removeAllRanges();
    setMdLinkToast(`Linked to ${targetId}`);
  };

  const handleUnlinkMdComponentLink = (
    componentId: string,
    pageFile: string,
    sourceOffset: number,
  ) => {
    if (isEditLocked) return;
    const source = project.mdFiles.get(componentId) ?? '';
    const result = unwrapMdComponentLinkAtOffset(source, sourceOffset, pageFile, project);
    if (!result.ok) {
      setMdLinkToast(result.reason);
      return;
    }
    updateMdContent(componentId, result.content);
    setMdLinkToast('Link removed');
  };

  const handleComponentClick = (componentId: string, pageFile: string) => {
    if (mdLinkMode) {
      handleMdLinkTarget(componentId, pageFile);
      return;
    }
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
  const canManagePages = !isEditLocked;
  const panelPageFiles = useMemo(
    () => new Set(state.panels.map((panel) => panel.pageFile)),
    [state.panels],
  );
  const openPanelPageFiles = useMemo(
    () => state.panels.map((panel) => panel.pageFile),
    [state.panels],
  );
  const {
    canReorder: canReorderPanels,
    dragIndex: dragPanelIndex,
    dropIndex: dropPanelIndex,
    handleDragStart: handlePanelDragStart,
    handleDragOver: handlePanelDragOver,
    handleDrop: handlePanelDrop,
    handleDragEnd: handlePanelDragEnd,
    handleDragLeave: handlePanelDragLeave,
  } = usePagePanelReorder({
    panelPageFiles: openPanelPageFiles,
    onReorder: reorderPanels,
  });
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
    mdLinkCtrlActive ||
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

  useSidebarShortcuts({ onToggle: toggleSidebar });

  const showShortcutsHint =
    !workspaceShortcutsBlocked && (Boolean(state.selection) || readShortcutsEnabled);

  const runRemoteSave = useCallback(
    async (
      title?: string,
      force = false,
      protection?: import('../lib/saveProject').ExportProtection,
      docId?: string,
      publishMode?: import('../types').PublishMode,
    ) => {
      const result = await saveToRemote(title, { force, protection, docId, publishMode });
      if (result.ok) return { ok: true as const };
      if (result.conflict && !result.conflictPaths) {
        // Version-level conflict (old mechanism): offer Reload or Overwrite
        setPendingRemoteTitle(title);
        setRemoteConflictOpen(true);
        return { ok: true as const };
      }
      if (result.conflict && result.conflictPaths) {
        // Per-file conflict: changes were saved, but some files were also modified by someone else
        return { ok: false as const, error: result.error ?? 'Conflict detected.' };
      }
      return { ok: false as const, error: result.error };
    },
    [saveToRemote],
  );

  const canSaveLocal = Boolean(window.showDirectoryPicker);
  const canSaveRemote = remoteStorageReady && isSupabaseConfigured();
  const canSave = !isEditLocked && (canSaveLocal || canSaveRemote);

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

  const handleChooseDestination = (choice: SaveDestinationChoice) => {
    setSaveDestinationOpen(false);

    if (choice.destination === 'local') {
      void runToolbarAction(async () => {
        const result = await saveToLocal(choice.protection ?? undefined);
        if (!result.ok && result.cancelled) return { ok: true };
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      });
      return;
    }

    void runToolbarAction(async () =>
      runRemoteSave(
        choice.remoteTitle,
        false,
        choice.protection,
        choice.remoteDocId,
        choice.remotePublishMode,
      ),
    );
  };

  const handleImportLocalToRemote = (params: ImportLocalToRemoteParams) => {
    setSaveDestinationOpen(false);
    void runToolbarAction(async () => {
      const result = await importLocalToRemote(params);
      if (!result.ok) {
        if (result.cancelled) return { ok: true };
        return { ok: false, error: result.error };
      }
      return { ok: true };
    });
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
  const handleReload = () => {
    if (state.contentEditorOpen) {
      setToolbarError('Close the content editor before reloading.');
      return;
    }
    if (dirty) {
      const proceed = window.confirm(
        'You have unsaved changes. Reload anyway? Unsaved edits will be lost.',
      );
      if (!proceed) return;
    }
    void runToolbarAction(reloadProject);
  };

  const saveShortcutStateRef = useRef({
    canSave,
    contentEditorOpen: state.contentEditorOpen,
    saveDestinationOpen,
    remoteDocId: project.remoteDocId,
    folderHandle: project.folderHandle,
  });
  saveShortcutStateRef.current = {
    canSave,
    contentEditorOpen: state.contentEditorOpen,
    saveDestinationOpen,
    remoteDocId: project.remoteDocId,
    folderHandle: project.folderHandle,
  };
  const runRemoteSaveRef = useRef(runRemoteSave);
  runRemoteSaveRef.current = runRemoteSave;
  const saveToLocalRef = useRef(saveToLocal);
  saveToLocalRef.current = saveToLocal;
  const runToolbarActionRef = useRef(runToolbarAction);
  runToolbarActionRef.current = runToolbarAction;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 's') return;
      e.preventDefault();
      const s = saveShortcutStateRef.current;
      if (!s.canSave || s.contentEditorOpen || s.saveDestinationOpen) return;
      if (s.remoteDocId) {
        void runToolbarActionRef.current(() => runRemoteSaveRef.current());
      } else if (s.folderHandle) {
        void runToolbarActionRef.current(async () => {
          const result = await saveToLocalRef.current();
          if (!result.ok && result.cancelled) return { ok: true };
          return result.ok ? { ok: true } : { ok: false, error: result.error };
        });
      } else {
        setSaveDestinationOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
            canReorder={!isEditLocked}
            canExport
            onSelectGroup={handleSelectGroupInPanel}
            onRemoveMember={(groupIndex, componentId) => {
              removeComponentFromGroupAtIndex(componentId, groupIndex);
            }}
            onReorderMember={reorderGroupMembers}
            onExportGroup={handleExportGroup}
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

          {isEditLocked && (
            <div className="edit-locked-banner" role="status">
              <span>View-only — enter the password to edit this document.</span>
            </div>
          )}

          {project.passwordProtected &&
            project.remoteDocId &&
            project.remoteHasEditLock === false && (
              <div className="edit-locked-banner edit-password-missing-banner" role="status">
                <span>
                  This document is marked password-protected, but no edit password is stored on
                  the server. You can edit freely — use Export with password protection to set
                  one.
                </span>
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
              editLocked={isEditLocked}
              loading={toolbarLoading}
              error={toolbarError}
              saveStatus={saveStatus}
              saveError={saveError}
              sourceLabel={sourceLabel}
              onSave={handleSave}
              onReload={handleReload}
              onUnlockEditing={() => {
                void runToolbarAction(async () => {
                  const result = await requestEditUnlock();
                  return result.ok ? { ok: true } : { ok: false, error: result.error };
                });
              }}
              onClose={handleClose}
            />
          </div>

          <div className="panel-row">
            <div className="page-panels-track" ref={panelTrackRef}>
            {state.panels.length === 0 && (
              <div className="empty-panels">
                {project.pages.length === 0
                  ? 'No pages yet. Use + New page in the sidebar to create the first one.'
                  : 'Select a page from the sidebar to get started.'}
              </div>
            )}
            {state.panels.map((panel, panelIndex) => {
              const isFlexSlot = panelIndex === state.panels.length - 1;
              const widthPx = isFlexSlot ? undefined : resolvePanelWidth(panel);
              const panelScrollTarget =
                state.scrollToComponent &&
                (state.scrollToComponent.pageFile == null ||
                  state.scrollToComponent.pageFile === panel.pageFile)
                  ? state.scrollToComponent
                  : null;
              const nextPanel = state.panels[panelIndex + 1];
              const nextIsFlexSlot =
                nextPanel != null && panelIndex + 1 === state.panels.length - 1;
              const pageMeta = project.pages.find((p) => p.fileName === panel.pageFile);
              const nextPageMeta = nextPanel
                ? project.pages.find((p) => p.fileName === nextPanel.pageFile)
                : null;
              const isPanelDragging = dragPanelIndex === panelIndex;
              const isPanelDropTarget =
                dropPanelIndex === panelIndex &&
                dragPanelIndex !== null &&
                dragPanelIndex !== panelIndex;
              return (
                <Fragment key={panel.pageFile}>
                  <div
                    ref={(el) => registerPanelSlot(panel.pageFile, el)}
                    className={`page-panel-slot${isFlexSlot ? ' page-panel-slot-fill' : ''}${!isFlexSlot && widthPx != null ? ' page-panel-slot-sized' : ''}${isPanelDragging ? ' page-panel-slot-dragging' : ''}${isPanelDropTarget ? ' page-panel-slot-drop-target' : ''}`}
                    style={!isFlexSlot && widthPx != null ? { width: widthPx } : undefined}
                    data-page={panel.pageFile}
                    onDragOver={(event) => handlePanelDragOver(event, panelIndex)}
                    onDrop={(event) => handlePanelDrop(event, panelIndex)}
                    onDragLeave={() => handlePanelDragLeave(panelIndex)}
                  >
                    <PagePanel
                      pageFile={panel.pageFile}
                      project={project}
                      isCurrent={state.currentPage === panel.pageFile}
                      selection={state.selection}
                      linkMode={state.linkMode}
                      linkGroupMembers={linkGroupMembers}
                      pendingImageNames={pendingRemoteImages}
                      pendingMdComponentIds={pendingRemoteMd}
                      pinned={panel.pinned ?? false}
                      canReorder={canReorderPanels}
                      onPanelDragStart={(event) => handlePanelDragStart(event, panelIndex)}
                      onPanelDragEnd={handlePanelDragEnd}
                      onTogglePin={() => togglePanelPin(panel.pageFile)}
                      onClose={() => closePagePanel(panel.pageFile)}
                      onSelect={handleComponentClick}
                      onClearSelection={clearSelection}
                      scrollToComponentId={panelScrollTarget?.componentId ?? null}
                      scrollNonce={panelScrollTarget?.nonce ?? 0}
                      scrollColdOpen={panelScrollTarget?.coldOpen ?? false}
                      scrollImmediate={panelScrollTarget?.immediate ?? false}
                      scrollSmooth={panelScrollTarget?.smooth ?? false}
                      flashedComponentId={state.flashedComponent?.componentId ?? null}
                      flashNonce={state.flashedComponent?.nonce ?? 0}
                      selectionScrollNonce={state.selectionScrollNonce}
                      commentLinkMode={commentLinkMode}
                      commentLinkPreviewAnchor={commentLinkPreviewAnchor}
                      mdLinkMode={mdLinkMode}
                      mdLinkSourceComponentId={mdLinkSourceComponentId}
                      mdLinkPreviewRange={mdLinkCapturedRange}
                      commentAnchorHighlightId={commentAnchorHighlightId}
                      outstandingCommentId={state.outstandingCommentId}
                      onCommentLinkComponent={handleCommentLinkComponent}
                      onMdLinkTarget={handleMdLinkTarget}
                      onCommentLinkMdRange={handleCommentLinkMdRange}
                      onCommentMarkClick={handleCommentMarkClick}
                      onNavigateToComponent={jumpToComponent}
                      onUnlinkMdComponentLink={handleUnlinkMdComponentLink}
                      commentUsername={state.commentUsername}
                      componentReadState={state.componentReadState}
                      onToggleComponentRead={toggleComponentRead}
                      onTogglePageReadAll={togglePageReadAll}
                      onOpenGroupDialog={toggleGroupPanel}
                      linkedListPanelOpen={groupPanelOpen}
                    />
                  </div>
                  {nextPanel ? (
                    <PanelResizeHandle
                      leftPageLabel={pageMeta?.pageName ?? panel.pageFile}
                      rightPageLabel={nextPageMeta?.pageName ?? nextPanel.pageFile}
                      onPointerDown={(event) =>
                        startResize(
                          event,
                          panel.pageFile,
                          nextPanel.pageFile,
                          nextIsFlexSlot,
                        )
                      }
                    />
                  ) : null}
                </Fragment>
              );
            })}
            </div>
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
              canEdit={!isEditLocked}
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
              !isEditLocked &&
              !state.linkMode &&
              !state.commentLinkCtrlActive &&
              !state.contentEditorOpen
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
          onImportLocalToRemote={handleImportLocalToRemote}
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
      {mdLinkToast ? <Toast message={mdLinkToast} /> : null}
    </>
  );
}
