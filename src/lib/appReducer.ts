import type { AppAction, AppState, PanelState } from '../types';
import { shrinkFarthestExpanded } from '../lib/index';
import {
  updateComponentInProject,
  insertComponentRelative,
  rebuildProject,
} from './projectMutations';
import {
  addComponentToGroup,
  removeComponentFromGroup,
  createGroup,
  renameComponentInGroups,
  adjustGroupIndexAfterRemoval,
} from './groupRelations';
import {
  appendSelectionHistory,
  applyComponentSelection,
  buildSelectionForComponent,
  cycleSelectionGroup,
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
  linkTargetGroupIndex: null,
  selectionHistory: [],
  selectionHistoryIndex: -1,
  scrollToComponent: null,
};

function clampLinkTargetIndex(groupsLength: number, index: number | null): number | null {
  if (groupsLength === 0) return null;
  if (index === null || index < 0 || index >= groupsLength) return 0;
  return index;
}

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

    case 'GO_PREV_GROUP':
    case 'GO_NEXT_GROUP': {
      if (state.linkMode || !state.project || !state.selection) return state;
      const applied = cycleSelectionGroup(
        state,
        action.type === 'GO_PREV_GROUP' ? 'prev' : 'next',
      );
      if (!applied || !state.currentPage) return state;
      return {
        ...state,
        ...applied,
        currentPage: state.currentPage,
      };
    }

    case 'GO_PREV_LINK_GROUP':
    case 'GO_NEXT_LINK_GROUP': {
      if (!state.linkMode || !state.project) return state;
      const groupsLength = state.project.relations.groups.length;
      if (groupsLength === 0) return state;

      const current = clampLinkTargetIndex(groupsLength, state.linkTargetGroupIndex) ?? 0;
      const next =
        action.type === 'GO_PREV_LINK_GROUP'
          ? (current - 1 + groupsLength) % groupsLength
          : (current + 1) % groupsLength;

      return { ...state, linkTargetGroupIndex: next };
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
        return { ...state, linkTargetGroupIndex: null };
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

      let relations = project.relations;
      if (newComponentId !== componentId) {
        relations = {
          groups: renameComponentInGroups(relations.groups, componentId, newComponentId),
        };
      }
      const rebuilt = rebuildProject({ ...project, relations });

      let selection = state.selection;
      if (selection?.componentId === componentId) {
        const remapped = buildSelectionForComponent(
          { ...state, project: rebuilt },
          newComponentId,
          pageFile,
          selection.activeGroupIndex,
        );
        selection = remapped?.selection ?? selection;
      }

      const selectionHistory = remapSelectionHistoryId(
        state.selectionHistory,
        componentId,
        newComponentId,
      );

      return {
        ...state,
        project: rebuilt,
        selection,
        selectionHistory,
      };
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
        let relations = project.relations;
        let linkTargetGroupIndex = state.linkTargetGroupIndex;

        if (linkTargetGroupIndex === null) {
          relations = { groups: createGroup(relations.groups, [newComponent.id]) };
          linkTargetGroupIndex = relations.groups.length - 1;
        } else {
          relations = {
            groups: addComponentToGroup(
              relations.groups,
              linkTargetGroupIndex,
              newComponent.id,
            ),
          };
        }

        const rebuilt = rebuildProject({ ...project, relations });

        return {
          ...state,
          project: rebuilt,
          panels: [{ pageFile, expanded: true }],
          currentPage: pageFile,
          selection: null,
          linkTargetGroupIndex,
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
          activeGroupIndex: null,
          matchingGroupIndices: [],
        },
        selectionHistory: history,
        selectionHistoryIndex: index,
      };
    }

    case 'TOGGLE_LINK_MODE': {
      const linkMode = !state.linkMode;
      if (!linkMode) {
        return {
          ...state,
          linkMode: false,
          linkTargetGroupIndex: null,
          selection: state.selection,
        };
      }

      const groupsLength = state.project?.relations.groups.length ?? 0;
      let linkTargetGroupIndex: number | null = null;
      if (state.selection?.activeGroupIndex != null) {
        linkTargetGroupIndex = state.selection.activeGroupIndex;
      } else if (groupsLength > 0) {
        linkTargetGroupIndex = 0;
      }

      return {
        ...state,
        linkMode: true,
        linkTargetGroupIndex,
        selection: null,
      };
    }

    case 'TOGGLE_LINK_COMPONENT': {
      if (!state.project || !state.linkMode) return state;

      const { componentId, pageFile } = action;
      if (!state.project.index.componentData.has(componentId)) return state;

      let groups = state.project.relations.groups;
      let linkTargetGroupIndex = state.linkTargetGroupIndex;
      let removedGroupIndex: number | null = null;

      if (linkTargetGroupIndex === null) {
        groups = createGroup(groups, [componentId]);
        linkTargetGroupIndex = groups.length - 1;
      } else {
        const group = groups[linkTargetGroupIndex] ?? [];
        if (group.includes(componentId)) {
          const result = removeComponentFromGroup(
            groups,
            linkTargetGroupIndex,
            componentId,
          );
          groups = result.groups;
          removedGroupIndex = result.removedGroupIndex;
          if (removedGroupIndex !== null) {
            linkTargetGroupIndex = adjustGroupIndexAfterRemoval(
              linkTargetGroupIndex,
              removedGroupIndex,
            );
          }
        } else {
          groups = addComponentToGroup(groups, linkTargetGroupIndex, componentId);
        }
      }

      const project = rebuildProject({
        ...state.project,
        relations: { groups },
      });

      linkTargetGroupIndex = clampLinkTargetIndex(
        project.relations.groups.length,
        linkTargetGroupIndex,
      );

      return {
        ...state,
        project,
        linkTargetGroupIndex,
        currentPage: pageFile,
        selection: null,
      };
    }

    default:
      return state;
  }
}
