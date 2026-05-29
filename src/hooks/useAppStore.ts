import { useReducer, useCallback, useRef, useEffect, useState } from 'react';
import type { AppAction, Component, LoadedProject } from '../types';
import { appReducer, initialAppState } from '../lib/appReducer';
import {
  scheduleAutoSave,
  setSaveStatusListener,
  cancelAutoSave,
  type SaveStatus,
} from '../lib/saveProject';
import { importImageFromComputer, importImageFromClipboardSource, type ImportImageResult } from '../lib/importImage';
import {
  createDefaultPageData,
  normalizePageFileName,
  normalizePageName,
  suggestNewPageFileName,
} from '../lib/pageMutations';
import { createPageFileOnDisk, deletePageFileOnDisk, deleteMdFileOnDisk } from '../lib/pageFileOps';
import { getOrphanedPageAssets } from '../lib/pageAssetCleanup';
import { findComponent } from '../lib/projectMutations';

export type PageActionResult = { ok: true } | { ok: false; error: string };

const PERSIST_ACTIONS = new Set<AppAction['type']>([
  'UPDATE_COMPONENT',
  'UPDATE_MD_CONTENT',
  'INSERT_COMPONENT',
  'APPEND_IMAGE_COMPONENT',
  'TOGGLE_LINK_MODE',
  'TOGGLE_LINK_COMPONENT',
  'CREATE_PAGE',
  'RENAME_PAGE',
  'DELETE_PAGE',
  'TOGGLE_PIN_PAGE',
  'DELETE_COMPONENT',
]);

export function useAppStore() {
  const [state, baseDispatch] = useReducer(appReducer, initialAppState);
  const projectRef = useRef(state.project);
  const shouldPersistRef = useRef(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  projectRef.current = state.project;

  useEffect(() => {
    setSaveStatusListener((status, message) => {
      setSaveStatus(status);
      setSaveError(message ?? null);
      if (status === 'saved') {
        window.setTimeout(() => setSaveStatus('idle'), 2000);
      }
    });
    return () => {
      setSaveStatusListener(null);
      cancelAutoSave();
    };
  }, []);

  useEffect(() => {
    if (!shouldPersistRef.current) return;
    shouldPersistRef.current = false;
    if (!state.project?.folderHandle) return;
    scheduleAutoSave(() => projectRef.current);
  }, [state.project]);

  const dispatch = useCallback((action: AppAction) => {
    if (PERSIST_ACTIONS.has(action.type)) {
      shouldPersistRef.current = true;
    }
    baseDispatch(action);
  }, []);

  const setProject = useCallback((project: LoadedProject) => {
    dispatch({ type: 'SET_PROJECT', project });
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
      const project = projectRef.current;
      if (project?.folderHandle && patch.type && patch.type !== 'md') {
        const located = findComponent(project, componentId);
        if (located?.component.type === 'md') {
          void deleteMdFileOnDisk(project.folderHandle, componentId);
        }
      }
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
      if (project?.folderHandle) {
        const located = findComponent(project, componentId);
        if (located?.component.type === 'md') {
          void deleteMdFileOnDisk(project.folderHandle, componentId);
        }
      }
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

  const toggleLinkMode = useCallback(() => {
    dispatch({ type: 'TOGGLE_LINK_MODE' });
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

  const goPrevGroup = useCallback(() => {
    dispatch({ type: 'GO_PREV_GROUP' });
  }, [dispatch]);

  const goNextGroup = useCallback(() => {
    dispatch({ type: 'GO_NEXT_GROUP' });
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
      });
    }
    return result;
  }, [dispatch]);

  const requireWritableProject = (): LoadedProject | null => {
    const project = projectRef.current;
    if (!project?.folderHandle) return null;
    return project;
  };

  const createPage = useCallback(async (fileName: string): Promise<PageActionResult> => {
    const project = requireWritableProject();
    if (!project) {
      return { ok: false, error: 'Open a local project folder to create pages.' };
    }

    const page = createDefaultPageData(fileName, project.relations.pageNames);
    try {
      await createPageFileOnDisk(
        project.folderHandle!,
        fileName,
        page.components,
        page.pageId,
      );
      shouldPersistRef.current = true;
      dispatch({ type: 'CREATE_PAGE', fileName });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not create page file.',
      };
    }
  }, [dispatch]);

  const renamePage = useCallback(
    async (fileName: string, newPageName: string): Promise<PageActionResult> => {
      const project = requireWritableProject();
      if (!project) {
        return { ok: false, error: 'Open a local project folder to rename pages.' };
      }

      const page = project.pages.find((p) => p.fileName === fileName);
      if (!page) {
        return { ok: false, error: 'Page not found.' };
      }
      if (page.pageName === newPageName) {
        return { ok: true };
      }

      shouldPersistRef.current = true;
      dispatch({ type: 'RENAME_PAGE', fileName, newPageName });
      return { ok: true };
    },
    [dispatch],
  );

  const togglePinPage = useCallback((fileName: string) => {
    if (!projectRef.current?.pages.some((p) => p.fileName === fileName)) return;
    shouldPersistRef.current = true;
    dispatch({ type: 'TOGGLE_PIN_PAGE', pageFile: fileName });
  }, [dispatch]);

  const deletePage = useCallback(async (fileName: string): Promise<PageActionResult> => {
    const project = requireWritableProject();
    if (!project) {
      return { ok: false, error: 'Open a local project folder to delete pages.' };
    }
    if (project.pages.length <= 1) {
      return { ok: false, error: 'Cannot delete the only page in the project.' };
    }

    try {
      const page = project.pages.find((p) => p.fileName === fileName);
      if (!page) {
        return { ok: false, error: 'Page not found.' };
      }
      const remainingPages = project.pages.filter((p) => p.fileName !== fileName);
      const orphaned = getOrphanedPageAssets(page, remainingPages);
      await deletePageFileOnDisk(project.folderHandle!, fileName, orphaned);
      shouldPersistRef.current = true;
      dispatch({ type: 'DELETE_PAGE', fileName });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Could not delete page file.',
      };
    }
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
      });
    }
    return result;
  }, [dispatch]);

  const appendClipboardImageToPage = useCallback(
    async (pageFile: string): Promise<PageActionResult> => {
      const project = requireWritableProject();
      if (!project) {
        return { ok: false, error: 'Open a local project folder to add images.' };
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
      });
      return { ok: true };
    },
    [dispatch],
  );

  return {
    state,
    saveStatus,
    saveError,
    setProject,
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
    toggleLinkComponent,
    goBackSelection,
    goNextSelection,
    goPrevGroup,
    goNextGroup,
    importImage,
    importImageFromClipboard: importImageFromClipboardAction,
    appendClipboardImageToPage,
    createPage,
    renamePage,
    togglePinPage,
    deletePage,
    suggestNewPageFileName: () =>
      suggestNewPageFileName(projectRef.current?.pages.map((p) => p.fileName) ?? []),
    normalizePageFileName,
    normalizePageName,
  };
}
