import { useReducer, useCallback, useRef, useEffect, useState } from 'react';
import type { AppAction, Component, LoadedProject } from '../types';
import { appReducer, initialAppState } from '../lib/appReducer';
import {
  scheduleAutoSave,
  setSaveStatusListener,
  cancelAutoSave,
  type SaveStatus,
} from '../lib/saveProject';

const PERSIST_ACTIONS = new Set<AppAction['type']>([
  'UPDATE_COMPONENT',
  'INSERT_COMPONENT',
  'TOGGLE_LINK_COMPONENT',
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
      dispatch({ type: 'UPDATE_COMPONENT', pageFile, componentId, patch });
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

  const goPrevLinkGroup = useCallback(() => {
    dispatch({ type: 'GO_PREV_LINK_GROUP' });
  }, [dispatch]);

  const goNextLinkGroup = useCallback(() => {
    dispatch({ type: 'GO_NEXT_LINK_GROUP' });
  }, [dispatch]);

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
    insertComponentAbove,
    insertComponentBelow,
    toggleLinkMode,
    toggleLinkComponent,
    goBackSelection,
    goNextSelection,
    goPrevGroup,
    goNextGroup,
    goPrevLinkGroup,
    goNextLinkGroup,
  };
}
