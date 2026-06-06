import { useReducer, useCallback, useRef, useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import type { AppAction, CommentAnchor, Component, LoadedProject } from '../types';
import { stripCommentTombstones } from '../lib/comments';
import { setStoredCommentUsername } from '../lib/commentSession';
import { appReducer, initialAppState } from '../lib/appReducer';
import type { SaveStatus } from '../lib/saveProject';
import { pickSaveFolder, saveProjectToFolder, scheduleAutoSave } from '../lib/saveProject';
import { importImageFromComputer, importImageFromClipboardSource, type ImportImageResult } from '../lib/importImage';
import { clearPageExpandMemory } from '../lib/pageExpandMemory';
import { clearPageScrollMemory } from '../lib/pageScrollMemory';
import {
  createDefaultPageData,
  normalizePageName,
  resolveNewPageFromName,
  suggestNewPageName,
} from '../lib/pageMutations';
import { getOrphanedPageAssets } from '../lib/pageFileOps';
import {
  loadFromDirectoryHandle,
  pickProjectFolder,
  revokeProjectImageUrls,
} from '../lib/loadProject';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import {
  createRemoteDocument,
  deleteRemoteDocument,
  fetchRemoteDocumentUpdatedAt,
  loadRemoteDocument,
  saveRemoteDocument,
  syncRemoteComments,
  syncRemoteRelations,
} from '../lib/remoteProject';
import {
  cancelRemoteAutoSave,
  scheduleRemoteAutoSave,
  setRemoteSaveStatusListener,
} from '../lib/remoteAutoSave';
import { isRemoteVersionStale } from '../lib/remoteConflict';
import { defaultRemoteTitle } from '../lib/projectBundle';
import { setDocIdInUrl } from '../lib/docUrl';

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
  'TOGGLE_LINK_COMPONENT',
  'CREATE_PAGE',
  'RENAME_PAGE',
  'REORDER_PAGES',
  'DELETE_PAGE',
  'TOGGLE_PIN_PAGE',
  'CLEAR_ALL_PINS',
  'DELETE_COMPONENT',
  'ADD_IMAGE',
  'ADD_ROOT_COMMENT',
  'ADD_REPLY_COMMENT',
  'SET_COMMENT_ANCHOR',
  'CLEAR_COMMENT_ANCHOR',
  'UPDATE_COMMENT',
  'DELETE_COMMENT',
]);

export function useAppStore() {
  const [state, baseDispatch] = useReducer(appReducer, initialAppState);
  const projectRef = useRef(state.project);
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  projectRef.current = state.project;
  dirtyRef.current = dirty;

  const runRemoteAutoSaveRef = useRef<
    () => Promise<import('../lib/remoteAutoSave').RemoteAutoSaveResult>
  >(async () => ({ ok: true, skipped: true }));

  useEffect(() => {
    setRemoteSaveStatusListener((status, message) => {
      setSaveStatus(status);
      if (message) setSaveError(message);
      else if (status !== 'error') setSaveError(null);
    });
    return () => setRemoteSaveStatusListener(null);
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
    if (DIRTY_ACTIONS.has(action.type)) {
      setDirty(true);
      setSaveStatus('idle');
      setSaveError(null);
    }
    flushSync(() => baseDispatch(action));

    const project = projectRef.current;
    if (DIRTY_ACTIONS.has(action.type) && project?.folderHandle) {
      scheduleAutoSave(() => projectRef.current);
    }
    if (
      DIRTY_ACTIONS.has(action.type) &&
      project?.remoteDocId &&
      isSupabaseConfigured()
    ) {
      scheduleRemoteAutoSave(() => runRemoteAutoSaveRef.current());
    }
  }, []);

  const setProject = useCallback((project: LoadedProject) => {
    cancelRemoteAutoSave();
    revokeProjectImageUrls(projectRef.current);
    clearPageScrollMemory();
    clearPageExpandMemory();
    setDirty(false);
    setSaveStatus('idle');
    setSaveError(null);
    dispatch({ type: 'SET_PROJECT', project });
    if (project.remoteDocId) {
      setDocIdInUrl(project.remoteDocId);
    } else {
      setDocIdInUrl(null);
    }
  }, [dispatch]);

  const closeProject = useCallback(() => {
    cancelRemoteAutoSave();
    revokeProjectImageUrls(projectRef.current);
    clearPageScrollMemory();
    clearPageExpandMemory();
    setDirty(false);
    setSaveStatus('idle');
    setSaveError(null);
    setDocIdInUrl(null);
    dispatch({ type: 'CLOSE_PROJECT' });
  }, [dispatch]);

  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  }, [dispatch]);

  const expandSidebar = useCallback(() => {
    dispatch({ type: 'EXPAND_SIDEBAR' });
  }, [dispatch]);

  const openPage = useCallback(
    (pageFile: string) => {
      dispatch({ type: 'OPEN_PAGE', pageFile });
    },
    [dispatch],
  );

  const selectComponent = useCallback(
    (componentId: string, pageFile: string) => {
      dispatch({ type: 'SELECT_COMPONENT', componentId, pageFile });
    },
    [dispatch],
  );

  const clearSelection = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTION' });
  }, [dispatch]);

  const togglePanel = useCallback(
    (pageFile: string) => {
      dispatch({ type: 'TOGGLE_PANEL', pageFile });
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
      dispatch({ type: 'DELETE_COMPONENT', pageFile, componentId });
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

  const deleteActiveGroup = useCallback(() => {
    dispatch({ type: 'DELETE_ACTIVE_GROUP' });
  }, [dispatch]);

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

  const togglePinPage = useCallback((fileName: string) => {
    if (!projectRef.current?.pages.some((p) => p.fileName === fileName)) return;
    dispatch({ type: 'TOGGLE_PIN_PAGE', pageFile: fileName });
  }, [dispatch]);

  const clearAllPins = useCallback(() => {
    if (!projectRef.current) return;
    dispatch({ type: 'CLEAR_ALL_PINS' });
  }, [dispatch]);

  const toggleCommentPanel = useCallback(() => {
    dispatch({ type: 'TOGGLE_COMMENT_PANEL' });
  }, [dispatch]);

  const setCommentUsername = useCallback((username: string) => {
    setStoredCommentUsername(username);
    dispatch({ type: 'SET_COMMENT_USERNAME', username });
  }, [dispatch]);

  const selectCommentLinkTarget = useCallback((commentId: string | null) => {
    dispatch({ type: 'SELECT_COMMENT_LINK_TARGET', commentId });
  }, [dispatch]);

  const addRootComment = useCallback((body: string) => {
    dispatch({ type: 'ADD_ROOT_COMMENT', body });
  }, [dispatch]);

  const addReplyComment = useCallback((parentId: string, body: string) => {
    dispatch({ type: 'ADD_REPLY_COMMENT', parentId, body });
  }, [dispatch]);

  const setCommentAnchor = useCallback((commentId: string, anchor: CommentAnchor) => {
    dispatch({ type: 'SET_COMMENT_ANCHOR', commentId, anchor });
  }, [dispatch]);

  const clearCommentAnchorAction = useCallback((commentId: string) => {
    dispatch({ type: 'CLEAR_COMMENT_ANCHOR', commentId });
  }, [dispatch]);

  const focusComment = useCallback((commentId: string | null) => {
    dispatch({ type: 'FOCUS_COMMENT', commentId });
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

    void getOrphanedPageAssets(page, project.pages.filter((p) => p.fileName !== fileName));
    dispatch({ type: 'DELETE_PAGE', fileName });
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
        revokeProjectImageUrls(project);
        clearPageScrollMemory();
        clearPageExpandMemory();
        const reloaded = await loadRemoteDocument(project.remoteDocId);
        setDirty(false);
        setSaveStatus('idle');
        setSaveError(null);
        dispatch({ type: 'RELOAD_PROJECT', project: reloaded });
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
      clearPageExpandMemory();
      const reloaded = await loadFromDirectoryHandle(project.folderHandle);
      setDirty(false);
      setSaveStatus('idle');
      setSaveError(null);
      dispatch({ type: 'RELOAD_PROJECT', project: reloaded });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not reload project from disk.',
      };
    }
  }, [dispatch]);

  const selectProjectFolder = useCallback(async (): Promise<PageActionResult> => {
    if (!window.showDirectoryPicker) {
      return {
        ok: false,
        error: 'Folder selection is not supported in this browser. Please use Chrome or Edge.',
      };
    }

    try {
      const project = await pickProjectFolder();
      if (!project) return { ok: true };
      setProject(project);
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

  const saveToLocal = useCallback(async (): Promise<SaveResult> => {
    const project = projectRef.current;
    if (!project) {
      return { ok: false, error: 'No project is open.' };
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

      const projectForSave: LoadedProject = { ...project, folderHandle };
      await saveProjectToFolder(projectForSave);

      const nextProject = stripCommentTombstones({
        ...project,
        folderHandle,
      });
      projectRef.current = nextProject;
      dispatch({ type: 'RELOAD_PROJECT', project: nextProject });
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
  }, [dispatch]);

  const saveToRemote = useCallback(
    async (title?: string, options?: { force?: boolean }): Promise<SaveResult> => {
    const project = projectRef.current;
    if (!project) {
      return { ok: false, error: 'No project is open.' };
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
      let projectToSave = project;

      if (project.remoteDocId && !options?.force) {
        const serverUpdatedAt = await fetchRemoteDocumentUpdatedAt(project.remoteDocId);
        if (isRemoteVersionStale(project.remoteUpdatedAt, serverUpdatedAt)) {
          const merged = await syncRemoteComments(project);
          if (merged) {
            projectToSave = merged;
            projectRef.current = merged;
            dispatch({ type: 'PATCH_PROJECT', project: merged });
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
        );
        const nextProject = stripCommentTombstones({
          ...saveResult.mergedProject,
          remoteTitle: title?.trim() || project.remoteTitle || defaultRemoteTitle(project),
          remoteSync: saveResult.remoteSync,
          remoteUpdatedAt: saveResult.remoteUpdatedAt,
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

      const created = await createRemoteDocument(project, nextTitle);
      const savedProject: LoadedProject = {
        ...project,
        remoteDocId: created.docId,
        remoteTitle: nextTitle,
        remoteSync: created.remoteSync,
        remoteUpdatedAt: created.remoteUpdatedAt,
        folderHandle: project.folderHandle ?? null,
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
    [dispatch],
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
        const project = await loadRemoteDocument(docId);
        setProject(project);
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Could not load remote document.',
        };
      }
    },
    [setProject],
  );

  const runRemoteAutoSave = useCallback(async (): Promise<
    import('../lib/remoteAutoSave').RemoteAutoSaveResult
  > => {
    const project = projectRef.current;
    if (!project?.remoteDocId || !isSupabaseConfigured()) {
      return { ok: true, skipped: true };
    }
    const docId = project.remoteDocId;

    try {
      // Single save call: merges remote comments then uploads all changed files atomically.
      const saveResult = await saveRemoteDocument(
        docId,
        project,
        project.remoteTitle ?? undefined,
      );

      const nextProject = stripCommentTombstones({
        ...saveResult.mergedProject,
        remoteSync: saveResult.remoteSync,
        remoteUpdatedAt: saveResult.remoteUpdatedAt,
      });
      projectRef.current = nextProject;
      dispatch({ type: 'PATCH_PROJECT', project: nextProject });

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
  }, [dispatch]);

  runRemoteAutoSaveRef.current = runRemoteAutoSave;

  useEffect(() => {
    const project = state.project;
    if (!project?.remoteDocId || !isSupabaseConfigured()) return;

    let cancelled = false;
    const REMOTE_COMMENT_SYNC_MS = 3_000;

    const pullRemoteChanges = async () => {
      const current = projectRef.current;
      if (!current?.remoteDocId || cancelled) return;

      try {
        if (dirtyRef.current) {
          // Only merge comments — never touch page/group data while user is editing
          const commentMerged = await syncRemoteComments(current);
          if (commentMerged && !cancelled) {
            projectRef.current = commentMerged;
            dispatch({ type: 'PATCH_PROJECT', project: commentMerged });
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
    setProject,
    closeProject,
    loadRemoteDoc,
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
    clearSelection,
    togglePanel,
    updateComponent,
    updateMdContent,
    insertComponentAbove,
    insertComponentBelow,
    deleteComponent,
    setLinkMode,
    clearAllPins,
    toggleCommentPanel,
    setCommentUsername,
    selectCommentLinkTarget,
    addRootComment,
    addReplyComment,
    setCommentAnchor,
    clearCommentAnchor: clearCommentAnchorAction,
    focusComment,
    updateComment,
    deleteComment,
    deleteActiveGroup,
    toggleLinkComponent,
    goBackSelection,
    goNextSelection,
    importImage,
    importImageFromClipboard: importImageFromClipboardAction,
    appendClipboardImageToPage,
    createPage,
    renamePage,
    reorderPages,
    togglePinPage,
    deletePage,
    suggestNewPageName: () =>
      suggestNewPageName(projectRef.current?.pages.map((p) => p.fileName) ?? []),
    normalizePageName,
  };
}
