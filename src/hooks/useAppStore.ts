import { useReducer, useCallback, useRef, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import type { AppAction, CommentAnchor, Component, LoadedProject, PanelState } from '../types';
import { activeComments, stripCommentTombstones } from '../lib/comments';
import { setStoredCommentUsername } from '../lib/commentSession';
import { queueFocusComponentBlock } from '../lib/keyboard';
import {
  normalizeReadUsername,
  readStateMapsEqual,
  toggleAllComponentsReadOnPage,
} from '../lib/readState';
import { toggleAllForeignCommentsRead } from '../lib/commentReadState';
import {
  collectCommentReadStatesForExport,
  loadCommentReadStateForUser,
} from '../lib/commentReadStateStorage';
import { loadReadStateForUser, collectReadStatesForExport } from '../lib/readStateStorage';
import {
  persistUserReadStates,
  cancelReadStateRemoteSave,
  setReadStateSaveStatusListener,
} from '../lib/readStatePersist';
import { findComponent } from '../lib/projectMutations';
import { findUnreadComponentGlobally } from '../lib/componentNavigation';
import { getStoredPageOrder } from '../lib/pageOrder';
import {
  loadPanelWidths,
  persistPanelWidths,
  resolvePanelWidthProjectKey,
} from '../lib/panelWidthStorage';
import {
  addLinkedPageToPanels,
  applyOpenPage,
  ensureFlexLastPanel,
  preparePanelsForOpen,
} from '../lib/pagePanels';
import { measurePanelSlotWidth } from '../lib/panelSlotRegistry';
import { appReducer, initialAppState } from '../lib/appReducer';
import type { SaveStatus, ExportProtection } from '../lib/saveProject';
import { pickSaveFolder, saveProjectToFolder, scheduleAutoSave, cancelAutoSave, setSaveStatusListener, isSaveInProgress } from '../lib/saveProject';
import { importImageFromComputer, importImageFromClipboardSource, type ImportImageResult } from '../lib/importImage';
import { clearPageScrollMemory } from '../lib/pageScrollMemory';
import {
  createDefaultPageData,
  normalizePageName,
  resolveNewPageFromName,
  suggestNewPageName,
} from '../lib/pageMutations';
import {
  deleteImageFileOnDisk,
  deleteMdFileOnDisk,
  deletePageFileOnDisk,
  getOrphanedComponentAssets,
  getOrphanedPageAssets,
} from '../lib/pageFileOps';
import {
  loadFromDirectoryHandle,
  loadPasswordProtectedProjectFromFolder,
  pickProjectFolder,
  createBlankProject,
  revokeProjectImageUrls,
} from '../lib/loadProject';
import type { PendingDocumentUnlock } from '../components/DocumentPasswordDialog';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import {
  createRemoteDocument,
  deleteRemoteDocument,
  fetchRemoteDocumentUpdatedAt,
  loadRemoteDocumentDeferred,
  saveRemoteDocument,
  applyRemoteCommentSync,
  syncRemoteComments,
  syncRemoteRelations,
  unlockRemoteDocumentDeferred,
  type DeferredRemoteLoad,
} from '../lib/remoteProject';
import {
  cancelRemoteAutoSave,
  scheduleRemoteAutoSave,
  setRemoteSaveStatusListener,
} from '../lib/remoteAutoSave';
import { isRemoteVersionStale } from '../lib/remoteConflict';
import {
  defaultRemoteTitle,
  collectReferencedImageNames,
  collectReferencedMdComponentIds,
  findImageReferences,
  formatImageDeleteBlockedMessage,
} from '../lib/projectBundle';
import { setDocIdInUrl } from '../lib/docUrl';
import { loadBundledHelpProject } from '../lib/bundledHelp';
import {
  clearWorkspaceFromUrl,
  getWorkspaceStateFromUrl,
  resolveWorkspaceUrlState,
  syncWorkspaceUrl,
} from '../lib/workspaceUrl';
import {
  clearHelpFromUrl,
  HELP_ABOUT_PAGE,
  setHelpInUrl,
} from '../lib/helpUrl';

export type PageActionResult = { ok: true } | { ok: false; error: string };
export type SaveResult =
  | { ok: true; docId?: string }
  | { ok: false; error: string; cancelled?: boolean; conflict?: boolean };

const DIRTY_ACTIONS = new Set<AppAction['type']>([
  'UPDATE_COMPONENT',
  'UPDATE_MD_CONTENT',
  'INSERT_COMPONENT',
  'APPEND_IMAGE_COMPONENT',
  'TOGGLE_LINK_MODE',
  'SET_LINK_MODE',
  'DELETE_ACTIVE_GROUP',
  'REMOVE_COMPONENT_FROM_GROUP',
  'TOGGLE_LINK_COMPONENT',
  'CREATE_PAGE',
  'RENAME_PAGE',
  'REORDER_PAGES',
  'DELETE_PAGE',
  'DELETE_COMPONENT',
  'ADD_IMAGE',
  'DELETE_IMAGE',
  'ADD_ROOT_COMMENT',
  'ADD_REPLY_COMMENT',
  'SET_COMMENT_ANCHOR',
  'CLEAR_COMMENT_ANCHOR',
  'END_COMMENT_LINK_SESSION',
  'END_LINK_SESSION',
  'UPDATE_COMMENT',
  'DELETE_COMMENT',
]);

export function useAppStore() {
  const [state, baseDispatch] = useReducer(appReducer, initialAppState);
  const projectRef = useRef(state.project);
  const appStateRef = useRef(state);
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const saveStatusRef = useRef(saveStatus);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingRemoteImages, setPendingRemoteImages] = useState<Set<string>>(() => new Set());
  const [pendingRemoteMd, setPendingRemoteMd] = useState<Set<string>>(() => new Set());
  const [pendingUnlock, setPendingUnlock] = useState<PendingDocumentUnlock | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const sessionExportPasswordRef = useRef<string | null>(null);

  const resolveExportProtection = useCallback(
    (explicit: ExportProtection | undefined, project: LoadedProject): ExportProtection => {
      if (explicit) return explicit;
      if (project.passwordProtected && sessionExportPasswordRef.current) {
        return { mode: 'protect', password: sessionExportPasswordRef.current };
      }
      return null;
    },
    [],
  );

  const rememberExportPassword = useCallback((protection: ExportProtection | undefined) => {
    if (protection?.mode === 'protect') {
      sessionExportPasswordRef.current = protection.password;
      return;
    }
    if (protection?.mode === 'remove') {
      sessionExportPasswordRef.current = null;
    }
  }, []);

  const remoteBackgroundLoadRef = useRef<{
    cancel: () => void;
    done: Promise<void>;
  } | null>(null);

  projectRef.current = state.project;
  appStateRef.current = state;
  dirtyRef.current = dirty;
  saveStatusRef.current = saveStatus;

  const runRemoteAutoSaveRef = useRef<
    () => Promise<import('../lib/remoteAutoSave').RemoteAutoSaveResult>
  >(async () => ({ ok: true, skipped: true }));
  const runLocalAutoSaveRef = useRef<
    () => Promise<import('../lib/saveProject').LocalAutoSaveResult>
  >(async () => ({ ok: true, skipped: true }));
  const jumpFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipWorkspaceUrlSyncRef = useRef(true);

  const FLASH_HIGHLIGHT_MS = 5000;

  useEffect(() => {
    return () => {
      if (jumpFlashTimerRef.current) {
        window.clearTimeout(jumpFlashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setReadStateSaveStatusListener((status, message) => {
      const project = projectRef.current;
      if (!project?.remoteDocId) return;
      setSaveStatus(status);
      if (message) setSaveError(message);
      else if (status !== 'error') setSaveError(null);
    });
    return () => setReadStateSaveStatusListener(null);
  }, []);

  useEffect(() => {
    setRemoteSaveStatusListener((status, message) => {
      const project = projectRef.current;
      if (project?.folderHandle && !project.remoteDocId) return;
      setSaveStatus(status);
      if (message) setSaveError(message);
      else if (status !== 'error') setSaveError(null);
    });
    return () => setRemoteSaveStatusListener(null);
  }, []);

  useEffect(() => {
    setSaveStatusListener((status, message) => {
      const project = projectRef.current;
      if (!project?.folderHandle || project.remoteDocId) return;
      setSaveStatus(status);
      if (message) setSaveError(message);
      else if (status !== 'error') setSaveError(null);
    });
    return () => setSaveStatusListener(null);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const dispatch = useCallback((action: AppAction) => {
    if (
      appStateRef.current.commentLinkCtrlActive &&
      (action.type === 'SET_COMMENT_ANCHOR' || action.type === 'CLEAR_COMMENT_ANCHOR')
    ) {
      return;
    }

    const prevProject = projectRef.current;
    const prevComponentReadState = appStateRef.current.componentReadState;
    const prevCommentReadState = appStateRef.current.commentReadState;
    const isDirtyAction = DIRTY_ACTIONS.has(action.type);

    flushSync(() => baseDispatch(action));

    const nextComponentReadState = appStateRef.current.componentReadState;
    const nextCommentReadState = appStateRef.current.commentReadState;
    if (
      !readStateMapsEqual(nextComponentReadState, prevComponentReadState) ||
      !readStateMapsEqual(nextCommentReadState, prevCommentReadState)
    ) {
      const project = projectRef.current;
      const username = appStateRef.current.commentUsername;
      if (project && username) {
        persistUserReadStates(
          project,
          username,
          nextComponentReadState,
          nextCommentReadState,
        );
      }
    }

    if (appStateRef.current.commentLinkCtrlActive || appStateRef.current.linkCtrlActive) {
      return;
    }

    if (!isDirtyAction) return;

    if (action.type === 'END_COMMENT_LINK_SESSION' && prevProject === projectRef.current) {
      return;
    }

    if (action.type === 'END_LINK_SESSION' && prevProject === projectRef.current) {
      return;
    }

    setDirty(true);
    setSaveError(null);
    if (saveStatusRef.current === 'saved') {
      setSaveStatus('idle');
    }

    const project = projectRef.current;
    const editorOpen = appStateRef.current.contentEditorOpen;
    if (project?.folderHandle && !project.remoteDocId) {
      scheduleAutoSave(() => runLocalAutoSaveRef.current());
    }
    if (project?.remoteDocId && isSupabaseConfigured() && !editorOpen) {
      scheduleRemoteAutoSave(() => runRemoteAutoSaveRef.current());
    }
  }, []);

  const restoreWorkspaceFromUrl = useCallback(
    (project: LoadedProject) => {
      const resolved = resolveWorkspaceUrlState(project, getWorkspaceStateFromUrl());
      if (!resolved) return;
      dispatch({
        type: 'RESTORE_WORKSPACE_FROM_URL',
        pageFiles: resolved.pageFiles,
        primaryComponentId: resolved.primaryComponentId,
      });
    },
    [dispatch],
  );

  useEffect(() => {
    if (skipWorkspaceUrlSyncRef.current) return;
    if (!state.project) {
      clearWorkspaceFromUrl();
      return;
    }
    syncWorkspaceUrl(state);
  }, [state.project, state.panels, state.selection]);

  const cancelRemoteBackgroundLoad = useCallback(() => {
    remoteBackgroundLoadRef.current?.cancel();
    remoteBackgroundLoadRef.current = null;
    setPendingRemoteImages(new Set());
    setPendingRemoteMd(new Set());
  }, []);

  const flushRemoteBackgroundLoad = useCallback(async () => {
    await remoteBackgroundLoadRef.current?.done;
  }, []);

  const dispatchRemoteMd = useCallback(
    (componentId: string, content: string, storagePath: string, fileHash: string) => {
      setPendingRemoteMd((prev) => {
        if (!prev.has(componentId)) return prev;
        const next = new Set(prev);
        next.delete(componentId);
        return next;
      });
      dispatch({
        type: 'HYDRATE_MD',
        componentId,
        content,
        storagePath,
        fileHash,
      });
    },
    [dispatch],
  );

  const startRemoteBackgroundLoad = useCallback(
    (
      load: DeferredRemoteLoad,
      onMd: (
        componentId: string,
        content: string,
        storagePath: string,
        fileHash: string,
      ) => void,
      onImage: (filename: string, blob: Blob) => void,
    ) => {
      cancelRemoteBackgroundLoad();
      setPendingRemoteMd(collectReferencedMdComponentIds(load.project));
      setPendingRemoteImages(collectReferencedImageNames(load.project));
      const cancel = load.cancelBackgroundLoad;
      remoteBackgroundLoadRef.current = {
        cancel,
        done: Promise.all([load.whenMdReady, load.whenImagesReady])
          .then(() => undefined)
          .finally(() => {
          setPendingRemoteImages(new Set());
          setPendingRemoteMd(new Set());
          if (remoteBackgroundLoadRef.current?.cancel === cancel) {
            remoteBackgroundLoadRef.current = null;
          }
          dispatch({ type: 'RECONCILE_MD_WARNINGS' });
        }),
      };
      const beginBackgroundLoad = () => {
        load.startMd(onMd);
        void load.whenMdReady.then(() => {
          if (remoteBackgroundLoadRef.current?.cancel !== cancel) return;
          load.startImages(onImage);
        });
      };
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(beginBackgroundLoad, { timeout: 500 });
      } else {
        window.setTimeout(beginBackgroundLoad, 0);
      }
    },
    [cancelRemoteBackgroundLoad, dispatch],
  );

  const dispatchRemoteImage = useCallback(
    (filename: string, blob: Blob) => {
      setPendingRemoteImages((prev) => {
        if (!prev.has(filename)) return prev;
        const next = new Set(prev);
        next.delete(filename);
        return next;
      });
      dispatch({
        type: 'HYDRATE_IMAGE',
        filename,
        objectUrl: URL.createObjectURL(blob),
        blob,
      });
    },
    [dispatch],
  );

  const beginRemoteDocumentSession = useCallback(() => {
    cancelRemoteAutoSave();
    cancelAutoSave();
    cancelReadStateRemoteSave();
    cancelRemoteBackgroundLoad();
    revokeProjectImageUrls(projectRef.current);
    clearPageScrollMemory();
    setDirty(false);
    setSaveStatus('idle');
    setSaveError(null);
  }, [cancelRemoteBackgroundLoad]);

  const loadRemoteDocumentSession = useCallback(
    async (docId: string) => {
      return loadRemoteDocumentDeferred(docId);
    },
    [],
  );

  const hydrateReadStateRef = useRef<() => Promise<void>>(async () => {});

  hydrateReadStateRef.current = async () => {
    const project = projectRef.current;
    const username = appStateRef.current.commentUsername;
    if (!project || !username) {
      baseDispatch({ type: 'SET_COMPONENT_READ_STATE', readState: {} });
      baseDispatch({ type: 'SET_COMMENT_READ_STATE', readState: {} });
      return;
    }
    const [readState, commentReadState] = await Promise.all([
      loadReadStateForUser(project, username),
      loadCommentReadStateForUser(project, username),
    ]);
    // Hydration only — do not persist back to disk/remote (avoids false "Saving" on open).
    baseDispatch({ type: 'SET_COMPONENT_READ_STATE', readState });
    baseDispatch({ type: 'SET_COMMENT_READ_STATE', readState: commentReadState });
  };

  const applyRemoteDocumentLoad = useCallback(
    (load: DeferredRemoteLoad) => {
      skipWorkspaceUrlSyncRef.current = true;
      dispatch({ type: 'SET_PROJECT', project: load.project });
      if (load.project.remoteDocId) {
        setDocIdInUrl(load.project.remoteDocId);
      }
      restoreWorkspaceFromUrl(load.project);
      skipWorkspaceUrlSyncRef.current = false;
      syncWorkspaceUrl(appStateRef.current);
      startRemoteBackgroundLoad(load, dispatchRemoteMd, dispatchRemoteImage);
      void hydrateReadStateRef.current();
    },
    [dispatch, dispatchRemoteMd, dispatchRemoteImage, startRemoteBackgroundLoad, restoreWorkspaceFromUrl],
  );

  const setProject = useCallback((project: LoadedProject) => {
    cancelRemoteAutoSave();
    cancelAutoSave();
    cancelReadStateRemoteSave();
    cancelRemoteBackgroundLoad();
    revokeProjectImageUrls(projectRef.current);
    clearPageScrollMemory();
    setDirty(false);
    setSaveStatus('idle');
    setSaveError(null);
    skipWorkspaceUrlSyncRef.current = true;
    dispatch({ type: 'SET_PROJECT', project });
    if (project.bundledHelp) {
      setDocIdInUrl(null);
      setHelpInUrl(project.pages[0]?.fileName ?? HELP_ABOUT_PAGE);
    } else if (project.remoteDocId) {
      setDocIdInUrl(project.remoteDocId);
      clearHelpFromUrl();
    } else {
      setDocIdInUrl(null);
      clearHelpFromUrl();
    }
    restoreWorkspaceFromUrl(project);
    skipWorkspaceUrlSyncRef.current = false;
    syncWorkspaceUrl(appStateRef.current);
    void hydrateReadStateRef.current();
  }, [dispatch, cancelRemoteBackgroundLoad, restoreWorkspaceFromUrl]);

  const closeProject = useCallback(() => {
    cancelRemoteAutoSave();
    cancelAutoSave();
    cancelReadStateRemoteSave();
    cancelRemoteBackgroundLoad();
    revokeProjectImageUrls(projectRef.current);
    clearPageScrollMemory();
    setDirty(false);
    setSaveStatus('idle');
    setSaveError(null);
    sessionExportPasswordRef.current = null;
    setPendingUnlock(null);
    setUnlockError(null);
    skipWorkspaceUrlSyncRef.current = true;
    setDocIdInUrl(null);
    clearHelpFromUrl();
    clearWorkspaceFromUrl();
    dispatch({ type: 'CLOSE_PROJECT' });
  }, [dispatch, cancelRemoteBackgroundLoad]);

  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  }, [dispatch]);

  const expandSidebar = useCallback(() => {
    dispatch({ type: 'EXPAND_SIDEBAR' });
  }, [dispatch]);

  const openPage = useCallback(
    (pageFile: string) => {
      const appState = appStateRef.current;
      const project = projectRef.current;
      if (!project) {
        dispatch({ type: 'OPEN_PAGE', pageFile });
        return;
      }

      if (appState.panels.some((panel) => panel.pageFile === pageFile)) {
        const opened = applyOpenPage(appState, pageFile);
        const panels = ensureFlexLastPanel(opened.panels ?? []);
        dispatch({ type: 'OPEN_PAGE', pageFile, panels });
        return;
      }

      const prevPanels = appState.panels;
      const projectKey = resolvePanelWidthProjectKey(project);
      const opened = applyOpenPage(appState, pageFile);
      const rawPanels = opened.panels ?? prevPanels;
      const panels = preparePanelsForOpen(prevPanels, rawPanels, projectKey);

      dispatch({ type: 'OPEN_PAGE', pageFile, panels });
    },
    [dispatch],
  );

  const createNewDocument = useCallback(() => {
    clearWorkspaceFromUrl();
    const project = createBlankProject();
    setProject(project);
    const firstPage = project.pages[0]?.fileName;
    if (firstPage) {
      dispatch({ type: 'OPEN_PAGE', pageFile: firstPage });
    }
  }, [dispatch, setProject]);

  const selectComponent = useCallback(
    (componentId: string, pageFile: string, scrollIntoView = false) => {
      dispatch({ type: 'SELECT_COMPONENT', componentId, pageFile, scrollIntoView });
      if (scrollIntoView) {
        queueFocusComponentBlock(componentId);
      }
    },
    [dispatch],
  );

  const jumpToComponent = useCallback(
    (componentId: string, anchorPageFile?: string | null) => {
      if (jumpFlashTimerRef.current) {
        window.clearTimeout(jumpFlashTimerRef.current);
      }

      const appState = appStateRef.current;
      const project = projectRef.current;
      let panels: PanelState[] | undefined;

      if (project) {
        const pageFile = project.index.componentToPage.get(componentId);
        if (pageFile) {
          const prevPanels = appState.panels;
          const projectKey = resolvePanelWidthProjectKey(project);
          const storedWidths = loadPanelWidths(projectKey);
          const rawPanels = addLinkedPageToPanels(
            prevPanels,
            pageFile,
            anchorPageFile ?? appState.currentPage,
            appState.maxOpenPages,
            storedWidths,
            measurePanelSlotWidth,
          );
          panels = preparePanelsForOpen(prevPanels, rawPanels, projectKey);
        }
      }

      dispatch({ type: 'JUMP_TO_COMPONENT', componentId, anchorPageFile, panels });
      jumpFlashTimerRef.current = window.setTimeout(() => {
        dispatch({ type: 'CLEAR_FLASHED_COMPONENT' });
        jumpFlashTimerRef.current = null;
      }, FLASH_HIGHLIGHT_MS);
    },
    [dispatch],
  );

  const clearSelection = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTION' });
  }, [dispatch]);

  const setMaxOpenPages = useCallback(
    (maxOpenPages: number) => {
      dispatch({ type: 'SET_MAX_OPEN_PAGES', maxOpenPages });
    },
    [dispatch],
  );

  const resizePanelSplit = useCallback(
    (
      leftPageFile: string,
      rightPageFile: string,
      leftWidthPx: number,
      rightWidthPx: number | null,
      rightIsFlex: boolean,
    ) => {
      dispatch({
        type: 'RESIZE_PANEL_SPLIT',
        leftPageFile,
        rightPageFile,
        leftWidthPx,
        rightWidthPx: rightWidthPx ?? undefined,
        rightIsFlex,
      });
      const project = projectRef.current;
      if (!project) return;
      const key = resolvePanelWidthProjectKey(project);
      const stored = { ...loadPanelWidths(key), [leftPageFile]: leftWidthPx };
      if (rightIsFlex) {
        delete stored[rightPageFile];
      } else if (rightWidthPx != null) {
        stored[rightPageFile] = rightWidthPx;
      }
      persistPanelWidths(key, stored);
    },
    [dispatch],
  );

  const setPanelWidths = useCallback(
    (widths: Record<string, number>) => {
      dispatch({ type: 'SET_PANEL_WIDTHS', widths });
      const project = projectRef.current;
      if (!project) return;
      const key = resolvePanelWidthProjectKey(project);
      persistPanelWidths(key, {
        ...loadPanelWidths(key),
        ...widths,
      });
    },
    [dispatch],
  );

  const updateComponent = useCallback(
    (pageFile: string, componentId: string, patch: Partial<Component>) => {
      dispatch({ type: 'UPDATE_COMPONENT', pageFile, componentId, patch });
    },
    [dispatch],
  );

  const updateMdContent = useCallback(
    (componentId: string, content: string) => {
      dispatch({ type: 'UPDATE_MD_CONTENT', componentId, content });
    },
    [dispatch],
  );

  const insertComponentAbove = useCallback(
    (pageFile: string, anchorComponentId: string) => {
      dispatch({
        type: 'INSERT_COMPONENT',
        pageFile,
        anchorComponentId,
        position: 'above',
      });
    },
    [dispatch],
  );

  const deleteComponent = useCallback(
    (pageFile: string, componentId: string) => {
      const project = projectRef.current;
      if (!project) return;

      const page = project.pages.find((p) => p.fileName === pageFile);
      const doomed = page?.components.find((c) => c.id === componentId);
      if (!page || !doomed) return;

      const remainingPages = project.pages.map((p) => {
        if (p.fileName !== pageFile) return p;
        return { ...p, components: p.components.filter((c) => c.id !== componentId) };
      });
      const orphaned = getOrphanedComponentAssets(doomed, remainingPages);

      dispatch({ type: 'DELETE_COMPONENT', pageFile, componentId });

      if (project.folderHandle) {
        for (const imageName of orphaned.imageFilenames) {
          void deleteImageFileOnDisk(project.folderHandle, imageName).catch(() => {
            // autosave will omit unreferenced images on next save
          });
        }
        for (const mdId of orphaned.mdComponentIds) {
          void deleteMdFileOnDisk(project.folderHandle, mdId).catch(() => {});
        }
      }
    },
    [dispatch],
  );

  const insertComponentBelow = useCallback(
    (pageFile: string, anchorComponentId: string) => {
      dispatch({
        type: 'INSERT_COMPONENT',
        pageFile,
        anchorComponentId,
        position: 'below',
      });
    },
    [dispatch],
  );

  const setLinkMode = useCallback(
    (enabled: boolean) => {
      dispatch({ type: 'SET_LINK_MODE', enabled });
    },
    [dispatch],
  );

  const setLinkCtrlActive = useCallback(
    (active: boolean, preferredGroupIndex?: number | null) => {
      dispatch({ type: 'SET_LINK_CTRL_ACTIVE', active, preferredGroupIndex });
    },
    [dispatch],
  );

  const setLinkTargetGroupIndex = useCallback((groupIndex: number) => {
    dispatch({ type: 'SET_LINK_TARGET_GROUP_INDEX', groupIndex });
  }, [dispatch]);

  const setContentEditorOpen = useCallback((open: boolean) => {
    dispatch({ type: 'SET_CONTENT_EDITOR_OPEN', open });
  }, [dispatch]);

  const clearAppToast = useCallback((id?: number) => {
    dispatch({ type: 'CLEAR_APP_TOAST', id });
  }, [dispatch]);

  const finishLinkSession = useCallback(() => {
    dispatch({ type: 'END_LINK_SESSION' });
  }, [dispatch]);

  const deleteActiveGroup = useCallback(() => {
    dispatch({ type: 'DELETE_ACTIVE_GROUP' });
  }, [dispatch]);

  const removeComponentFromGroupAtIndex = useCallback(
    (componentId: string, groupIndex: number) => {
      dispatch({ type: 'REMOVE_COMPONENT_FROM_GROUP', componentId, groupIndex });
    },
    [dispatch],
  );

  const toggleLinkComponent = useCallback(
    (componentId: string, pageFile: string) => {
      dispatch({ type: 'TOGGLE_LINK_COMPONENT', componentId, pageFile });
    },
    [dispatch],
  );

  const goBackSelection = useCallback(() => {
    dispatch({ type: 'GO_BACK_SELECTION' });
  }, [dispatch]);

  const goNextSelection = useCallback(() => {
    dispatch({ type: 'GO_NEXT_SELECTION' });
  }, [dispatch]);

  const deleteProjectImage = useCallback(async (filename: string): Promise<PageActionResult> => {
    const project = projectRef.current;
    if (!project) {
      return { ok: false, error: 'No project is open.' };
    }

    const name = filename.trim();
    if (!name) {
      return { ok: false, error: 'No image selected.' };
    }

    const refs = findImageReferences(project, name);
    if (refs.length > 0) {
      return { ok: false, error: formatImageDeleteBlockedMessage(refs) };
    }

    dispatch({ type: 'DELETE_IMAGE', filename: name });

    if (project.folderHandle) {
      try {
        await deleteImageFileOnDisk(project.folderHandle, name);
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not delete image file.',
        };
      }
    }

    return { ok: true };
  }, [dispatch]);

  const importImage = useCallback(async (): Promise<ImportImageResult> => {
    const project = projectRef.current;
    if (!project) {
      return { ok: false, error: 'No project is open.' };
    }

    const result = await importImageFromComputer(project);
    if (result.ok) {
      dispatch({
        type: 'ADD_IMAGE',
        filename: result.filename,
        objectUrl: result.objectUrl,
        blob: result.blob,
      });
    }
    return result;
  }, [dispatch]);

  const createPage = useCallback(async (pageNameInput: string): Promise<PageActionResult> => {
    const project = projectRef.current;
    if (!project) {
      return { ok: false, error: 'No project is open.' };
    }

    const resolved = resolveNewPageFromName(
      pageNameInput,
      project.pages.map((p) => p.fileName),
    );
    if (!resolved) {
      return { ok: false, error: 'Enter a page name.' };
    }

    createDefaultPageData(resolved.fileName, project.relations.pageNames);
    dispatch({
      type: 'CREATE_PAGE',
      fileName: resolved.fileName,
      pageName: resolved.pageName,
    });
    return { ok: true };
  }, [dispatch]);

  const renamePage = useCallback(
    async (fileName: string, newPageName: string): Promise<PageActionResult> => {
      const project = projectRef.current;
      if (!project) {
        return { ok: false, error: 'No project is open.' };
      }

      const page = project.pages.find((p) => p.fileName === fileName);
      if (!page) {
        return { ok: false, error: 'Page not found.' };
      }
      if (page.pageName === newPageName) {
        return { ok: true };
      }

      dispatch({ type: 'RENAME_PAGE', fileName, newPageName });
      return { ok: true };
    },
    [dispatch],
  );

  const reorderPages = useCallback(
    (orderedPageFiles: string[]) => {
      dispatch({ type: 'REORDER_PAGES', orderedPageFiles });
    },
    [dispatch],
  );

  const toggleCommentPanel = useCallback(() => {
    dispatch({ type: 'TOGGLE_COMMENT_PANEL' });
  }, [dispatch]);

  const setCommentUsername = useCallback((username: string): boolean => {
    const normalized = normalizeReadUsername(username);
    if (!normalized) return false;
    setStoredCommentUsername(normalized);
    dispatch({ type: 'SET_COMMENT_USERNAME', username: normalized });
    void hydrateReadStateRef.current();
    return true;
  }, [dispatch]);

  const toggleAllCommentsRead = useCallback(() => {
    const project = projectRef.current;
    const username = appStateRef.current.commentUsername;
    if (!project || !username) return;

    const comments = activeComments(project.relations.comments ?? []);
    const next = toggleAllForeignCommentsRead(
      comments,
      username,
      appStateRef.current.commentReadState,
    );
    dispatch({ type: 'SET_COMMENT_READ_STATE', readState: next });
  }, [dispatch]);

  const toggleCommentRead = useCallback((commentId: string) => {
    const project = projectRef.current;
    const username = appStateRef.current.commentUsername;
    if (!project || !username) return;

    const exists = (project.relations.comments ?? []).some(
      (comment) => comment.id === commentId && comment.deletedAt == null,
    );
    if (!exists) return;

    dispatch({ type: 'TOGGLE_COMMENT_READ', commentId });
  }, [dispatch]);

  const toggleComponentRead = useCallback((componentId: string) => {
    const project = projectRef.current;
    const username = appStateRef.current.commentUsername;
    if (!project || !username) return;

    const found = findComponent(project, componentId);
    if (!found) return;

    dispatch({ type: 'TOGGLE_COMPONENT_READ', componentId });
  }, [dispatch]);

  const toggleSelectedComponentRead = useCallback(() => {
    const project = projectRef.current;
    const username = appStateRef.current.commentUsername;
    const componentId = appStateRef.current.selection?.componentId;
    if (!project || !username || !componentId) return;
    toggleComponentRead(componentId);
  }, [toggleComponentRead]);

  const togglePageReadAll = useCallback((pageFile: string) => {
    const project = projectRef.current;
    const username = appStateRef.current.commentUsername;
    if (!project || !username) return;

    const page = project.pages.find((entry) => entry.fileName === pageFile);
    if (!page) return;

    const next = toggleAllComponentsReadOnPage(
      page.components,
      appStateRef.current.componentReadState,
    );
    dispatch({ type: 'SET_COMPONENT_READ_STATE', readState: next });
  }, [dispatch]);

  const navigateToUnread = useCallback((direction: 'forward' | 'backward') => {
    const project = projectRef.current;
    const appState = appStateRef.current;
    if (!project || !appState.commentUsername) return;

    const pageOrder = getStoredPageOrder(
      project.relations,
      project.pages.map((page) => page.fileName),
    );
    const target = findUnreadComponentGlobally(
      project.pages,
      pageOrder,
      appState.componentReadState,
      appState.selection?.componentId ?? null,
      direction,
    );
    if (!target) return;

    dispatch({
      type: 'FOCUS_UNREAD_COMPONENT',
      componentId: target.componentId,
      pageFile: target.pageFile,
    });
    queueFocusComponentBlock(target.componentId);
  }, [dispatch]);

  const selectComment = useCallback((commentId: string) => {
    dispatch({ type: 'SELECT_COMMENT', commentId });
  }, [dispatch]);

  const setCommentLinkPreview = useCallback((anchor: import('../types').CommentAnchor | null) => {
    dispatch({ type: 'SET_COMMENT_LINK_PREVIEW', anchor });
  }, [dispatch]);

  const setCommentLinkCtrlActive = useCallback((active: boolean) => {
    dispatch({ type: 'SET_COMMENT_LINK_CTRL_ACTIVE', active });
  }, [dispatch]);

  const finishCommentLinkSession = useCallback(() => {
    dispatch({ type: 'END_COMMENT_LINK_SESSION' });
  }, [dispatch]);

  const addRootComment = useCallback((body: string) => {
    dispatch({ type: 'ADD_ROOT_COMMENT', body });
  }, [dispatch]);

  const addReplyComment = useCallback((parentId: string, body: string) => {
    dispatch({ type: 'ADD_REPLY_COMMENT', parentId, body });
  }, [dispatch]);

  const setCommentAnchor = useCallback((commentId: string, anchor: CommentAnchor) => {
    if (appStateRef.current.commentLinkCtrlActive) return;
    dispatch({ type: 'SET_COMMENT_ANCHOR', commentId, anchor });
  }, [dispatch]);

  const clearCommentAnchorAction = useCallback((commentId: string) => {
    if (appStateRef.current.commentLinkCtrlActive) return;
    dispatch({ type: 'CLEAR_COMMENT_ANCHOR', commentId });
  }, [dispatch]);

  const focusComment = useCallback((commentId: string | null) => {
    dispatch({ type: 'FOCUS_COMMENT', commentId });
  }, [dispatch]);

  const outstandComment = useCallback((commentId: string | null) => {
    dispatch({ type: 'OUTSTANDING_COMMENT', commentId });
  }, [dispatch]);

  const updateComment = useCallback((commentId: string, body: string) => {
    dispatch({ type: 'UPDATE_COMMENT', commentId, body });
  }, [dispatch]);

  const deleteComment = useCallback((commentId: string) => {
    dispatch({ type: 'DELETE_COMMENT', commentId });
  }, [dispatch]);

  const deletePage = useCallback(async (fileName: string): Promise<PageActionResult> => {
    const project = projectRef.current;
    if (!project) {
      return { ok: false, error: 'No project is open.' };
    }
    if (project.pages.length <= 1) {
      return { ok: false, error: 'Cannot delete the only page in the project.' };
    }

    const page = project.pages.find((p) => p.fileName === fileName);
    if (!page) {
      return { ok: false, error: 'Page not found.' };
    }

    const remainingPages = project.pages.filter((p) => p.fileName !== fileName);
    const orphaned = getOrphanedPageAssets(page, remainingPages);
    dispatch({ type: 'DELETE_PAGE', fileName });

    if (project.folderHandle) {
      void deletePageFileOnDisk(project.folderHandle, fileName, orphaned).catch(() => {
        // autosave will retry cleanup on next save
      });
    }

    return { ok: true };
  }, [dispatch]);

  const importImageFromClipboardAction = useCallback(async (): Promise<ImportImageResult> => {
    const project = projectRef.current;
    if (!project) {
      return { ok: false, error: 'No project is open.' };
    }

    const result = await importImageFromClipboardSource(project);
    if (result.ok) {
      dispatch({
        type: 'ADD_IMAGE',
        filename: result.filename,
        objectUrl: result.objectUrl,
        blob: result.blob,
      });
    }
    return result;
  }, [dispatch]);

  const appendClipboardImageToPage = useCallback(
    async (pageFile: string): Promise<PageActionResult> => {
      const project = projectRef.current;
      if (!project) {
        return { ok: false, error: 'No project is open.' };
      }
      if (!project.pages.some((p) => p.fileName === pageFile)) {
        return { ok: false, error: 'Page not found.' };
      }

      const result = await importImageFromClipboardSource(project);
      if (!result.ok) {
        return { ok: false, error: result.error };
      }

      dispatch({
        type: 'APPEND_IMAGE_COMPONENT',
        pageFile,
        filename: result.filename,
        objectUrl: result.objectUrl,
        blob: result.blob,
      });
      return { ok: true };
    },
    [dispatch],
  );

  const reloadProject = useCallback(async (): Promise<PageActionResult> => {
    const project = projectRef.current;
    if (!project) {
      return { ok: false, error: 'No project is open.' };
    }

    if (project.source === 'remote') {
      if (!project.remoteDocId) {
        return { ok: false, error: 'Remote document id is missing.' };
      }
      try {
        beginRemoteDocumentSession();
        const result = await loadRemoteDocumentSession(project.remoteDocId);
        if (result.status === 'password') {
          const password = sessionExportPasswordRef.current;
          if (!password) {
            setPendingUnlock({
              source: 'remote',
              docId: result.docId,
              title: result.title,
              lock: result.lock,
              isPublished: result.isPublished,
            });
            return { ok: false, error: 'Enter the document password to reload.' };
          }
          const load = await unlockRemoteDocumentDeferred(result.docId, password, {
            id: result.docId,
            title: result.title,
            is_published: result.isPublished === false ? false : true,
          });
          dispatch({ type: 'RELOAD_PROJECT', project: load.project });
          startRemoteBackgroundLoad(load, dispatchRemoteMd, dispatchRemoteImage);
          void hydrateReadStateRef.current();
          return { ok: true };
        }
        dispatch({ type: 'RELOAD_PROJECT', project: result.load.project });
        startRemoteBackgroundLoad(result.load, dispatchRemoteMd, dispatchRemoteImage);
        void hydrateReadStateRef.current();
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not reload remote document.',
        };
      }
    }

    if (!project.folderHandle) {
      return { ok: false, error: 'Reload is only available for a local folder or remote document.' };
    }

    try {
      revokeProjectImageUrls(project);
      clearPageScrollMemory();
      const reloaded = project.passwordProtected
        ? await loadPasswordProtectedProjectFromFolder(
            project.folderHandle,
            sessionExportPasswordRef.current ?? '',
          )
        : await loadFromDirectoryHandle(project.folderHandle);
      setDirty(false);
      setSaveStatus('idle');
      setSaveError(null);
      dispatch({ type: 'RELOAD_PROJECT', project: reloaded });
      void hydrateReadStateRef.current();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not reload project from disk.',
      };
    }
  }, [dispatch, beginRemoteDocumentSession, loadRemoteDocumentSession, startRemoteBackgroundLoad, dispatchRemoteMd, dispatchRemoteImage]);

  const selectProjectFolder = useCallback(async (): Promise<PageActionResult> => {
    if (!window.showDirectoryPicker) {
      return {
        ok: false,
        error: 'Folder selection is not supported in this browser. Please use Chrome or Edge.',
      };
    }

    try {
      const result = await pickProjectFolder();
      if (!result) return { ok: true };
      if (result.status === 'password') {
        setPendingUnlock({
          source: 'local',
          title: result.folderHandle.name,
          folderHandle: result.folderHandle,
          lock: result.lock,
        });
        setUnlockError(null);
        return { ok: true };
      }
      setProject(result.project);
      return { ok: true };
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return { ok: true };
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not open project folder.',
      };
    }
  }, [setProject]);

  const cancelDocumentUnlock = useCallback(() => {
    setPendingUnlock(null);
    setUnlockError(null);
    setUnlockBusy(false);
  }, []);

  const unlockPendingDocument = useCallback(
    async (password: string): Promise<PageActionResult> => {
      const pending = pendingUnlock;
      if (!pending) return { ok: false, error: 'No document is waiting for a password.' };

      setUnlockBusy(true);
      setUnlockError(null);
      try {
        if (pending.source === 'local') {
          const project = await loadPasswordProtectedProjectFromFolder(
            pending.folderHandle,
            password,
          );
          sessionExportPasswordRef.current = password;
          setPendingUnlock(null);
          setProject(project);
          return { ok: true };
        }

        beginRemoteDocumentSession();
        const load = await unlockRemoteDocumentDeferred(pending.docId, password, {
          id: pending.docId,
          title: pending.title,
          is_published: pending.isPublished === false ? false : true,
        });
        sessionExportPasswordRef.current = password;
        setPendingUnlock(null);
        applyRemoteDocumentLoad(load);
        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Incorrect password.';
        setUnlockError(message);
        return { ok: false, error: message };
      } finally {
        setUnlockBusy(false);
      }
    },
    [pendingUnlock, setProject, applyRemoteDocumentLoad, beginRemoteDocumentSession],
  );

  const saveToLocal = useCallback(async (explicitProtection?: ExportProtection): Promise<SaveResult> => {
    const project = projectRef.current;
    if (!project) {
      return { ok: false, error: 'No project is open.' };
    }
    if (appStateRef.current.commentLinkCtrlActive || appStateRef.current.linkCtrlActive) {
      return {
        ok: false,
        error: 'Release Ctrl to finish linking before saving.',
      };
    }
    if (appStateRef.current.contentEditorOpen) {
      return {
        ok: false,
        error: 'Close the content editor before saving.',
      };
    }

    setSaveStatus('saving');
    setSaveError(null);

    try {
      let folderHandle = project.folderHandle ?? null;
      if (!folderHandle) {
        folderHandle = await pickSaveFolder();
        if (!folderHandle) {
          setSaveStatus('idle');
          return { ok: false, error: '', cancelled: true };
        }
      }

      const protection = resolveExportProtection(explicitProtection, project);
      if (project.passwordProtected && !protection) {
        setSaveStatus('idle');
        return {
          ok: false,
          error: 'This document is password-protected. Export again and enter the password.',
        };
      }

      const projectForSave: LoadedProject = { ...project, folderHandle };
      const readStates = collectReadStatesForExport(
        project,
        appStateRef.current.commentUsername,
        appStateRef.current.componentReadState,
      );
      const commentReadStates = collectCommentReadStatesForExport(
        project,
        appStateRef.current.commentUsername,
        appStateRef.current.commentReadState,
      );
      await saveProjectToFolder(projectForSave, readStates, commentReadStates, protection);

      const nextProject = stripCommentTombstones({
        ...project,
        folderHandle,
        passwordProtected: protection?.mode === 'protect'
          ? true
          : protection?.mode === 'remove'
            ? false
            : project.passwordProtected,
      });
      rememberExportPassword(protection);
      projectRef.current = nextProject;
      if (nextProject.relations !== project.relations || nextProject.folderHandle !== project.folderHandle) {
        dispatch({ type: 'PATCH_PROJECT', project: nextProject });
      }
      setDirty(false);
      setSaveStatus('saved');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save to local folder';
      setSaveStatus('error');
      setSaveError(message);
      return { ok: false, error: message };
    }
  }, [dispatch, resolveExportProtection, rememberExportPassword]);

  const saveToRemote = useCallback(
    async (
      title?: string,
      options?: { force?: boolean; protection?: ExportProtection; docId?: string; isPublished?: boolean },
    ): Promise<SaveResult> => {
    const project = projectRef.current;
    if (!project) {
      return { ok: false, error: 'No project is open.' };
    }
    if (appStateRef.current.commentLinkCtrlActive || appStateRef.current.linkCtrlActive) {
      return {
        ok: false,
        error: 'Release Ctrl to finish linking before saving.',
      };
    }
    if (appStateRef.current.contentEditorOpen) {
      return {
        ok: false,
        error: 'Close the content editor before saving.',
      };
    }
    if (!isSupabaseConfigured()) {
      return {
        ok: false,
        error: 'Remote storage is not available on this site.',
      };
    }

    setSaveStatus('saving');
    setSaveError(null);

    try {
      await flushRemoteBackgroundLoad();
      let projectToSave = project;
      const protection = resolveExportProtection(options?.protection, project);
      if (project.passwordProtected && !protection) {
        setSaveStatus('idle');
        return {
          ok: false,
          error: 'This document is password-protected. Export again and enter the password.',
        };
      }
      const readStates = collectReadStatesForExport(
        project,
        appStateRef.current.commentUsername,
        appStateRef.current.componentReadState,
      );
      const commentReadStates = collectCommentReadStatesForExport(
        project,
        appStateRef.current.commentUsername,
        appStateRef.current.commentReadState,
      );
      const saveOptions = {
        protection,
        sessionPassword: sessionExportPasswordRef.current,
        readStatesByUsername: readStates,
        commentReadStatesByUsername: commentReadStates,
        isPublished: options?.isPublished,
      };

      if (project.remoteDocId && !options?.force) {
        const serverUpdatedAt = await fetchRemoteDocumentUpdatedAt(project.remoteDocId);
        if (isRemoteVersionStale(project.remoteUpdatedAt, serverUpdatedAt)) {
          const merged = await syncRemoteComments(project);
          if (merged) {
            projectToSave = applyRemoteCommentSync(projectRef.current ?? project, merged);
            projectRef.current = projectToSave;
            dispatch({ type: 'PATCH_PROJECT', project: projectToSave });
          }
          const serverUpdatedAtAfterMerge = await fetchRemoteDocumentUpdatedAt(
            project.remoteDocId,
          );
          if (
            isRemoteVersionStale(projectToSave.remoteUpdatedAt, serverUpdatedAtAfterMerge)
          ) {
            setSaveStatus('idle');
            return {
              ok: false,
              conflict: true,
              error: 'A newer version of this document exists on the server.',
            };
          }
        }
      }

      if (project.remoteDocId) {
        const saveResult = await saveRemoteDocument(
          project.remoteDocId,
          projectToSave,
          title ?? project.remoteTitle ?? undefined,
          saveOptions,
        );
        rememberExportPassword(protection);
        const nextProject = stripCommentTombstones({
          ...saveResult.mergedProject,
          remoteTitle: title?.trim() || project.remoteTitle || defaultRemoteTitle(project),
          remoteSync: saveResult.remoteSync,
          remoteUpdatedAt: saveResult.remoteUpdatedAt,
          remotePublished:
            options?.isPublished ??
            saveResult.mergedProject.remotePublished ??
            project.remotePublished,
          passwordProtected:
            protection?.mode === 'protect'
              ? true
              : protection?.mode === 'remove'
                ? false
                : project.passwordProtected,
        });
        projectRef.current = nextProject;
        dispatch({ type: 'RELOAD_PROJECT', project: nextProject });
        setDocIdInUrl(project.remoteDocId);
        setDirty(false);
        setSaveStatus('saved');
        window.setTimeout(() => setSaveStatus('idle'), 2000);
        return { ok: true, docId: project.remoteDocId };
      }

      const nextTitle = title?.trim() || defaultRemoteTitle(project);
      if (!nextTitle) {
        setSaveStatus('error');
        setSaveError('Document title is required.');
        return { ok: false, error: 'Document title is required.' };
      }

      if (!options?.docId?.trim()) {
        setSaveStatus('error');
        setSaveError('Link ID is required when publishing to remote storage.');
        return { ok: false, error: 'Link ID is required when publishing to remote storage.' };
      }

      const created = await createRemoteDocument(project, nextTitle, {
        ...saveOptions,
        docId: options?.docId,
      });
      rememberExportPassword(protection);
      const savedProject: LoadedProject = {
        ...project,
        remoteDocId: created.docId,
        remoteTitle: nextTitle,
        remotePublished: options?.isPublished ?? true,
        remoteSync: created.remoteSync,
        remoteUpdatedAt: created.remoteUpdatedAt,
        folderHandle: project.folderHandle ?? null,
        passwordProtected: protection?.mode === 'protect',
      };
      projectRef.current = savedProject;
      dispatch({ type: 'RELOAD_PROJECT', project: savedProject });
      setDocIdInUrl(created.docId);
      setDirty(false);
      setSaveStatus('saved');
      window.setTimeout(() => setSaveStatus('idle'), 2000);
      return { ok: true, docId: created.docId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save document';
      setSaveStatus('error');
      setSaveError(message);
      return { ok: false, error: message };
    }
  },
    [dispatch, flushRemoteBackgroundLoad, resolveExportProtection, rememberExportPassword],
  );

  const saveProject = saveToRemote;

  const deleteRemoteLink = useCallback(async (): Promise<PageActionResult> => {
    const project = projectRef.current;
    if (!project?.remoteDocId) {
      return { ok: false, error: 'This document is not linked to remote storage.' };
    }
    if (!isSupabaseConfigured()) {
      return { ok: false, error: 'Remote storage is not available on this site.' };
    }

    try {
      await deleteRemoteDocument(project.remoteDocId);
      const nextProject: LoadedProject = {
        ...project,
        remoteDocId: null,
        remoteTitle: null,
        remoteSync: null,
      };
      projectRef.current = nextProject;
      dispatch({ type: 'RELOAD_PROJECT', project: nextProject });
      setDocIdInUrl(null);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not delete remote document.',
      };
    }
  }, [dispatch]);

  const checkRemoteDocumentStale = useCallback(async (): Promise<boolean> => {
    const project = projectRef.current;
    if (!project?.remoteDocId || !project.remoteUpdatedAt) return false;
    if (dirtyRef.current) return false;
    if (!isSupabaseConfigured()) return false;
    try {
      const serverUpdatedAt = await fetchRemoteDocumentUpdatedAt(project.remoteDocId);
      return isRemoteVersionStale(project.remoteUpdatedAt, serverUpdatedAt);
    } catch {
      return false;
    }
  }, []);

  const loadRemoteDoc = useCallback(
    async (docId: string): Promise<PageActionResult> => {
      if (!isSupabaseConfigured()) {
        return { ok: false, error: 'Remote storage is not available on this site.' };
      }
      try {
        beginRemoteDocumentSession();
        const result = await loadRemoteDocumentSession(docId);
        if (result.status === 'password') {
          setPendingUnlock({
            source: 'remote',
            docId: result.docId,
            title: result.title,
            lock: result.lock,
            isPublished: result.isPublished,
          });
          setUnlockError(null);
          return { ok: true };
        }
        applyRemoteDocumentLoad(result.load);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not load remote document.',
        };
      }
    },
    [beginRemoteDocumentSession, loadRemoteDocumentSession, applyRemoteDocumentLoad],
  );

  const loadRemoteDocForWelcome = useCallback(
    async (docId: string): Promise<{ ok: boolean; error?: string }> => {
      const result = await loadRemoteDoc(docId);
      return result.ok ? { ok: true } : { ok: false, error: result.error };
    },
    [loadRemoteDoc],
  );

  const loadBundledHelp = useCallback(
    async (pageFile?: string | null): Promise<{ ok: boolean; error?: string }> => {
      try {
        const project = loadBundledHelpProject();
        setProject(project);
        const page = pageFile ?? project.pages[0]?.fileName ?? HELP_ABOUT_PAGE;
        dispatch({ type: 'OPEN_PAGE', pageFile: page });
        setHelpInUrl(page);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not load built-in help.',
        };
      }
    },
    [dispatch, setProject],
  );

  const loadBundledHelpForWelcome = useCallback(
    async (pageFile?: string | null): Promise<{ ok: boolean; error?: string }> => {
      return loadBundledHelp(pageFile);
    },
    [loadBundledHelp],
  );

  const runRemoteAutoSave = useCallback(async (): Promise<
    import('../lib/remoteAutoSave').RemoteAutoSaveResult
  > => {
    if (appStateRef.current.commentLinkCtrlActive || appStateRef.current.linkCtrlActive) {
      return { ok: true, skipped: true };
    }
    if (appStateRef.current.contentEditorOpen) {
      return { ok: true, skipped: true };
    }
    await flushRemoteBackgroundLoad();
    const project = projectRef.current;
    if (!project?.remoteDocId || !isSupabaseConfigured()) {
      return { ok: true, skipped: true };
    }
    const docId = project.remoteDocId;

    try {
      await flushRemoteBackgroundLoad();
      const protection = resolveExportProtection(undefined, project);
      if (project.passwordProtected && !protection) {
        return { ok: true, skipped: true };
      }
      const readStates = collectReadStatesForExport(
        project,
        appStateRef.current.commentUsername,
        appStateRef.current.componentReadState,
      );
      const commentReadStates = collectCommentReadStatesForExport(
        project,
        appStateRef.current.commentUsername,
        appStateRef.current.commentReadState,
      );
      const saveResult = await saveRemoteDocument(
        docId,
        project,
        project.remoteTitle ?? undefined,
        {
          protection,
          sessionPassword: sessionExportPasswordRef.current,
          readStatesByUsername: readStates,
          commentReadStatesByUsername: commentReadStates,
        },
      );

      const nextProject = stripCommentTombstones({
        ...saveResult.mergedProject,
        remoteSync: saveResult.remoteSync,
        remoteUpdatedAt: saveResult.remoteUpdatedAt,
        passwordProtected:
          protection?.mode === 'protect'
            ? true
            : protection?.mode === 'remove'
              ? false
              : project.passwordProtected,
      });
      const commentsChanged =
        nextProject.relations.comments !== project.relations.comments;
      const syncChanged =
        nextProject.remoteSync !== project.remoteSync ||
        nextProject.remoteUpdatedAt !== project.remoteUpdatedAt;
      projectRef.current = nextProject;
      if (commentsChanged || syncChanged) {
        dispatch({ type: 'PATCH_PROJECT', project: nextProject });
      }

      if (saveResult.skippedUpload) {
        return { ok: true, skipped: true };
      }

      setDirty(false);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not save document',
      };
    }
  }, [dispatch, flushRemoteBackgroundLoad, resolveExportProtection]);

  runRemoteAutoSaveRef.current = runRemoteAutoSave;

  const runLocalAutoSave = useCallback(async (): Promise<
    import('../lib/saveProject').LocalAutoSaveResult
  > => {
    if (appStateRef.current.commentLinkCtrlActive || appStateRef.current.linkCtrlActive) {
      return { ok: true, skipped: true };
    }
    const project = projectRef.current;
    if (!project?.folderHandle || project.remoteDocId) {
      return { ok: true, skipped: true };
    }

    try {
      const protection = resolveExportProtection(undefined, project);
      if (project.passwordProtected && !protection) {
        return { ok: true, skipped: true };
      }
      const readStates = collectReadStatesForExport(
        project,
        appStateRef.current.commentUsername,
        appStateRef.current.componentReadState,
      );
      const commentReadStates = collectCommentReadStatesForExport(
        project,
        appStateRef.current.commentUsername,
        appStateRef.current.commentReadState,
      );
      await saveProjectToFolder(project, readStates, commentReadStates, protection);
      const nextProject = stripCommentTombstones(project);
      projectRef.current = nextProject;
      if (nextProject !== project) {
        dispatch({ type: 'PATCH_PROJECT', project: nextProject });
      }
      setDirty(false);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not save project',
      };
    }
  }, [dispatch, resolveExportProtection]);

  runLocalAutoSaveRef.current = runLocalAutoSave;

  useEffect(() => {
    const project = state.project;
    if (!project?.remoteDocId || !isSupabaseConfigured()) return;

    let cancelled = false;
    const REMOTE_COMMENT_SYNC_MS = 3_000;

    const pullRemoteChanges = async () => {
      const current = projectRef.current;
      if (!current?.remoteDocId || cancelled) return;
      if (remoteBackgroundLoadRef.current) return;
      if (isSaveInProgress(saveStatusRef.current)) return;
      if (appStateRef.current.commentLinkCtrlActive || appStateRef.current.linkCtrlActive) return;
      if (appStateRef.current.contentEditorOpen) return;

      try {
        if (dirtyRef.current) {
          // Only merge comments — never touch page/group data while user is editing
          const commentMerged = await syncRemoteComments(current);
          if (commentMerged && !cancelled) {
            const next = applyRemoteCommentSync(projectRef.current ?? current, commentMerged);
            if (next === projectRef.current) return;
            projectRef.current = next;
            dispatch({ type: 'PATCH_PROJECT', project: next });
          }
        } else {
          // Full relations sync already merges comments internally
          const relationsMerged = await syncRemoteRelations(current);
          if (relationsMerged && !cancelled) {
            projectRef.current = relationsMerged;
            dispatch({ type: 'PATCH_PROJECT', project: relationsMerged });
          }
        }
      } catch {
        // ignore background sync errors
      }
    };

    void pullRemoteChanges();
    const timer = window.setInterval(() => {
      void pullRemoteChanges();
    }, REMOTE_COMMENT_SYNC_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [state.project?.remoteDocId, dispatch]);

  return {
    state,
    dirty,
    saveStatus,
    saveError,
    pendingRemoteImages,
    pendingRemoteMd,
    pendingUnlock,
    unlockError,
    unlockBusy,
    unlockPendingDocument,
    cancelDocumentUnlock,
    setProject,
    createNewDocument,
    closeProject,
    loadRemoteDoc,
    loadRemoteDocForWelcome,
    loadBundledHelp,
    loadBundledHelpForWelcome,
    saveToLocal,
    saveToRemote,
    checkRemoteDocumentStale,
    deleteRemoteLink,
    saveProject,
    reloadProject,
    selectProjectFolder,
    toggleSidebar,
    expandSidebar,
    openPage,
    selectComponent,
    jumpToComponent,
    clearSelection,
    setMaxOpenPages,
    resizePanelSplit,
    setPanelWidths,
    updateComponent,
    updateMdContent,
    insertComponentAbove,
    insertComponentBelow,
    deleteComponent,
    setLinkMode,
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
    toggleSelectedComponentRead,
    togglePageReadAll,
    navigateToUnread,
    selectComment,
    setCommentLinkPreview,
    setCommentLinkCtrlActive,
    finishCommentLinkSession,
    addRootComment,
    addReplyComment,
    setCommentAnchor,
    clearCommentAnchor: clearCommentAnchorAction,
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
    deleteProjectImage,
    importImageFromClipboard: importImageFromClipboardAction,
    appendClipboardImageToPage,
    createPage,
    renamePage,
    reorderPages,
    deletePage,
    suggestNewPageName: () =>
      suggestNewPageName(projectRef.current?.pages.map((p) => p.fileName) ?? []),
    normalizePageName,
  };
}
