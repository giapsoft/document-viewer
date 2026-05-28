import type { AppAction, AppState, PanelState } from '../types';
import { shrinkFarthestExpanded } from '../lib/index';
import {
  updateComponentInProject,
  insertComponentRelative,
  rebuildProject,
} from './projectMutations';
import {
  linkComponentToGroup,
  unlinkComponentFromGroup,
} from './relationMutations';
import {
  appendSelectionHistory,
  applyComponentSelection,
  remapSelectionHistoryId,
  scrollToHistoryEntry,
} from './selectionNavigation';

export const initialAppState: AppState = {
  project: null,
  sidebarExpanded: true,
  panels: [],
  currentPage: null,
  selection: null,
  linkMode: false,
  linkSelection: [],
  selectionHistory: [],
  selectionHistoryIndex: -1,
  scrollToComponent: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROJECT':
      return {
        ...initialAppState,
        project: action.project,
        sidebarExpanded: true,
      };

    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarExpanded: !state.sidebarExpanded };

    case 'EXPAND_SIDEBAR':
      return { ...state, sidebarExpanded: true };

    case 'OPEN_PAGE':
      return {
        ...state,
        panels: [{ pageFile: action.pageFile, expanded: true }],
        currentPage: action.pageFile,
        selection: state.linkMode ? state.selection : null,
      };

    case 'SELECT_COMPONENT': {
      if (state.linkMode) return state;
      if (!state.project) return state;
      const { componentId, pageFile } = action;

      const applied = applyComponentSelection(state, componentId, pageFile);
      if (!applied) return state;

      const { history, index } = appendSelectionHistory(
        state.selectionHistory,
        state.selectionHistoryIndex,
        { componentId, pageFile },
      );

      return {
        ...state,
        ...applied,
        selectionHistory: history,
        selectionHistoryIndex: index,
      };
    }

    case 'GO_BACK_SELECTION': {
      if (state.linkMode || !state.project || state.selectionHistoryIndex <= 0) {
        return state;
      }

      const newIndex = state.selectionHistoryIndex - 1;
      const entry = state.selectionHistory[newIndex];
      if (!entry) return state;

      const applied = applyComponentSelection(
        state,
        entry.componentId,
        entry.pageFile,
      );
      if (!applied) return state;

      return {
        ...state,
        ...applied,
        selectionHistoryIndex: newIndex,
        scrollToComponent: scrollToHistoryEntry(state, entry),
      };
    }

    case 'GO_NEXT_SELECTION': {
      if (
        state.linkMode ||
        !state.project ||
        state.selectionHistoryIndex < 0 ||
        state.selectionHistoryIndex >= state.selectionHistory.length - 1
      ) {
        return state;
      }

      const newIndex = state.selectionHistoryIndex + 1;
      const entry = state.selectionHistory[newIndex];
      if (!entry) return state;

      const applied = applyComponentSelection(
        state,
        entry.componentId,
        entry.pageFile,
      );
      if (!applied) return state;

      return {
        ...state,
        ...applied,
        selectionHistoryIndex: newIndex,
        scrollToComponent: scrollToHistoryEntry(state, entry),
      };
    }

    case 'CLEAR_SELECTION':
      if (state.linkMode) {
        return { ...state, linkSelection: [] };
      }
      return { ...state, selection: null };

    case 'TOGGLE_PANEL': {
      const panel = state.panels.find((p) => p.pageFile === action.pageFile);
      if (!panel) return state;

      let panels: PanelState[];
      if (panel.expanded) {
        if (action.pageFile === state.currentPage) {
          return state;
        }
        panels = state.panels.map((p) =>
          p.pageFile === action.pageFile ? { ...p, expanded: false } : p,
        );
      } else {
        const expandedCount = state.panels.filter((p) => p.expanded).length;
        if (expandedCount >= 3 && state.currentPage) {
          panels = shrinkFarthestExpanded(
            state.panels,
            state.currentPage,
            action.pageFile,
          );
        } else {
          panels = state.panels.map((p) =>
            p.pageFile === action.pageFile ? { ...p, expanded: true } : p,
          );
        }
      }

      return { ...state, panels };
    }

    case 'REORDER_PANELS': {
      const map = new Map(state.panels.map((p) => [p.pageFile, p]));
      const panels = action.orderedPageFiles
        .map((f) => map.get(f))
        .filter((p): p is PanelState => !!p);
      return { ...state, panels };
    }

    case 'UPDATE_COMPONENT': {
      if (!state.project) return state;
      const { pageFile, componentId, patch } = action;
      const { project, newComponentId } = updateComponentInProject(
        state.project,
        pageFile,
        componentId,
        patch,
      );

      let selection = state.selection;
      if (selection?.componentId === componentId) {
        const relatedIds = new Set(selection.relatedIds);
        if (newComponentId !== componentId) {
          relatedIds.delete(componentId);
          relatedIds.add(newComponentId);
        }
        selection = { componentId: newComponentId, relatedIds };
      }

      let linkSelection = state.linkSelection;
      if (newComponentId !== componentId && linkSelection.includes(componentId)) {
        linkSelection = linkSelection.map((id) =>
          id === componentId ? newComponentId : id,
        );
      }

      const selectionHistory = remapSelectionHistoryId(
        state.selectionHistory,
        componentId,
        newComponentId,
      );

      return { ...state, project, selection, linkSelection, selectionHistory };
    }

    case 'INSERT_COMPONENT': {
      if (!state.project) return state;
      const { pageFile, anchorComponentId, position } = action;
      const { project, newComponent } = insertComponentRelative(
        state.project,
        pageFile,
        anchorComponentId,
        position,
      );

      if (state.linkMode) {
        return {
          ...state,
          project,
          panels: [{ pageFile, expanded: true }],
          currentPage: pageFile,
          selection: null,
          linkSelection: [...state.linkSelection, newComponent.id],
        };
      }

      const entry = { componentId: newComponent.id, pageFile };
      const { history, index } = appendSelectionHistory(
        state.selectionHistory,
        state.selectionHistoryIndex,
        entry,
      );

      return {
        ...state,
        project,
        panels: [{ pageFile, expanded: true }],
        currentPage: pageFile,
        selection: {
          componentId: newComponent.id,
          relatedIds: new Set([newComponent.id]),
        },
        selectionHistory: history,
        selectionHistoryIndex: index,
      };
    }

    case 'TOGGLE_LINK_MODE': {
      const linkMode = !state.linkMode;
      return {
        ...state,
        linkMode,
        linkSelection: linkMode ? state.linkSelection : [],
        selection: linkMode ? null : state.selection,
      };
    }

    case 'TOGGLE_LINK_COMPONENT': {
      if (!state.project || !state.linkMode) return state;

      const { componentId, pageFile } = action;
      if (!state.project.index.componentData.has(componentId)) return state;

      const linkSelection = [...state.linkSelection];
      const isSelected = linkSelection.includes(componentId);
      let relations = state.project.relations;

      if (isSelected) {
        relations = unlinkComponentFromGroup(relations, componentId, linkSelection);
        const index = linkSelection.indexOf(componentId);
        if (index >= 0) linkSelection.splice(index, 1);
      } else {
        relations = linkComponentToGroup(relations, componentId, linkSelection);
        linkSelection.push(componentId);
      }

      const project = rebuildProject({
        ...state.project,
        relations,
      });

      return {
        ...state,
        project,
        linkSelection,
        currentPage: pageFile,
        selection: null,
      };
    }

    default:
      return state;
  }
}
