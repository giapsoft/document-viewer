import { useReducer, useCallback } from 'react';
import type { Component, LoadedProject } from '../types';
import { appReducer, initialAppState } from '../lib/appReducer';

export function useAppStore() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);

  const setProject = useCallback((project: LoadedProject) => {
    dispatch({ type: 'SET_PROJECT', project });
  }, []);

  const toggleSidebar = useCallback(() => {
    dispatch({ type: 'TOGGLE_SIDEBAR' });
  }, []);

  const expandSidebar = useCallback(() => {
    dispatch({ type: 'EXPAND_SIDEBAR' });
  }, []);

  const openPage = useCallback((pageFile: string) => {
    dispatch({ type: 'OPEN_PAGE', pageFile });
  }, []);

  const selectComponent = useCallback((componentId: string, pageFile: string) => {
    dispatch({ type: 'SELECT_COMPONENT', componentId, pageFile });
  }, []);

  const clearSelection = useCallback(() => {
    dispatch({ type: 'CLEAR_SELECTION' });
  }, []);

  const togglePanel = useCallback((pageFile: string) => {
    dispatch({ type: 'TOGGLE_PANEL', pageFile });
  }, []);

  const updateComponent = useCallback(
    (pageFile: string, componentId: string, patch: Partial<Component>) => {
      dispatch({ type: 'UPDATE_COMPONENT', pageFile, componentId, patch });
    },
    [],
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
    [],
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
    [],
  );

  const toggleLinkMode = useCallback(() => {
    dispatch({ type: 'TOGGLE_LINK_MODE' });
  }, []);

  const toggleLinkComponent = useCallback(
    (componentId: string, pageFile: string) => {
      dispatch({ type: 'TOGGLE_LINK_COMPONENT', componentId, pageFile });
    },
    [],
  );

  const goBackSelection = useCallback(() => {
    dispatch({ type: 'GO_BACK_SELECTION' });
  }, []);

  const goNextSelection = useCallback(() => {
    dispatch({ type: 'GO_NEXT_SELECTION' });
  }, []);

  return {
    state,
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
  };
}
