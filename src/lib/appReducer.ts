import type { AppAction, AppState, PanelState } from '../types';
import { shrinkFarthestExpanded } from '../lib/index';
import {
  updateComponentInProject,
  insertComponentRelative,
  deleteComponentFromProject,
  rebuildProject,
} from './projectMutations';
import {
  addComponentToGroup,
  removeComponentFromGroup,
  createGroup,
  adjustGroupIndexAfterRemoval,
  getGroupIndicesForComponent,
} from './groupRelations';
import {
  appendSelectionHistory,
  applyComponentSelection,
  buildSelectionForComponent,
  cycleSelectionGroup,
  remapSelectionHistoryId,
  scrollToHistoryEntry,
} from './selectionNavigation';
import {
  applyCreatePageState,
  applyDeletePageState,
  applyRenamePageState,
} from './pageMutations';
import { buildPanelsForPageContext, refreshPanelsWithPins, togglePinnedPage } from './pagePins';

export const initialAppState: AppState = {
  project: null,
  sidebarExpanded: true,
  panels: [],
  currentPage: null,
  selection: null,
  linkMode: false,
  linkTargetGroupIndex: null,
  linkFocusComponentId: null,
  selectionHistory: [],
  selectionHistoryIndex: -1,
  scrollToComponent: null,
  selectionScrollNonce: 0,
};

function clampLinkTargetIndex(groupsLength: number, index: number | null): number | null {
  if (groupsLength === 0) return null;
  if (index === null || index < 0 || index >= groupsLength) return 0;
  return index;
}

function resolveLinkTargetForComponent(
  groups: string[][],
  componentId: string | null,
  preferredIndex: number | null,
): number | null {
  if (!componentId) return preferredIndex;
  const matching = getGroupIndicesForComponent(groups, componentId);
  if (matching.length === 0) return preferredIndex;
  if (preferredIndex !== null && matching.includes(preferredIndex)) {
    return preferredIndex;
  }
  return matching[0];
}

function cycleLinkTargetAmongMatching(
  groups: string[][],
  componentId: string | null,
  currentTarget: number | null,
  direction: 'prev' | 'next',
): number | null {
  if (!componentId) return currentTarget;
  const matching = getGroupIndicesForComponent(groups, componentId);
  if (matching.length <= 1) return matching[0] ?? currentTarget;

  let pos = currentTarget !== null ? matching.indexOf(currentTarget) : -1;
  if (pos < 0) pos = 0;

  const nextPos =
    direction === 'prev'
      ? (pos - 1 + matching.length) % matching.length
      : (pos + 1) % matching.length;

  return matching[nextPos];
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

    case 'OPEN_PAGE': {
      const nextState: AppState = {
        ...state,
        currentPage: action.pageFile,
        selection: state.linkMode ? state.selection : null,
        panels: [{ pageFile: action.pageFile, expanded: true }],
      };
      const panels = buildPanelsForPageContext(nextState, action.pageFile);
      return { ...nextState, panels };
    }

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
        scrollToComponent: null,
        selectionScrollNonce: state.selectionScrollNonce + 1,
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
        scrollToComponent: null,
        selectionScrollNonce: state.selectionScrollNonce + 1,
      };
    }

    case 'GO_PREV_LINK_GROUP':
    case 'GO_NEXT_LINK_GROUP': {
      if (!state.linkMode || !state.project) return state;

      const next = cycleLinkTargetAmongMatching(
        state.project.relations.groups,
        state.linkFocusComponentId,
        state.linkTargetGroupIndex,
        action.type === 'GO_PREV_LINK_GROUP' ? 'prev' : 'next',
      );

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
        return {
          ...state,
          linkTargetGroupIndex: null,
          linkFocusComponentId: null,
        };
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

      const rebuilt = rebuildProject(project);

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

    case 'UPDATE_MD_CONTENT': {
      if (!state.project) return state;
      const mdFiles = new Map(state.project.mdFiles);
      mdFiles.set(action.componentId, action.content);
      return {
        ...state,
        project: { ...state.project, mdFiles },
      };
    }

    case 'DELETE_COMPONENT': {
      if (!state.project) return state;
      const { pageFile, componentId } = action;
      const project = deleteComponentFromProject(state.project, pageFile, componentId);
      if (!project) return state;

      const panels = state.panels.filter((p) => p.pageFile !== pageFile || p.expanded);
      let currentPage = state.currentPage;
      if (!panels.some((p) => p.pageFile === currentPage)) {
        currentPage = pageFile;
      }

      const page = project.pages.find((p) => p.fileName === pageFile);
      const firstId = page?.components[0]?.id ?? null;

      return {
        ...state,
        project,
        selection: null,
        panels: panels.length > 0 ? panels : [{ pageFile, expanded: true }],
        currentPage,
        selectionHistory: state.selectionHistory.filter(
          (e) => e.componentId !== componentId,
        ),
        scrollToComponent: firstId
          ? { componentId: firstId, nonce: (state.scrollToComponent?.nonce ?? 0) + 1 }
          : null,
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
          linkFocusComponentId: newComponent.id,
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
          linkFocusComponentId: null,
          selection: state.selection,
        };
      }

      const groups = state.project?.relations.groups ?? [];
      const linkFocusComponentId = state.selection?.componentId ?? null;
      const matching = linkFocusComponentId
        ? getGroupIndicesForComponent(groups, linkFocusComponentId)
        : [];
      const preferred =
        state.selection?.activeGroupIndex !== null &&
        state.selection?.activeGroupIndex !== undefined &&
        matching.includes(state.selection.activeGroupIndex)
          ? state.selection.activeGroupIndex
          : (matching[0] ?? null);
      const linkTargetGroupIndex =
        matching.length > 0 ? preferred : null;

      return {
        ...state,
        linkMode: true,
        linkTargetGroupIndex,
        linkFocusComponentId,
        selection: null,
      };
    }

    case 'TOGGLE_LINK_COMPONENT': {
      if (!state.project || !state.linkMode) return state;

      const { componentId, pageFile } = action;
      if (!state.project.index.componentData.has(componentId)) return state;

      let groups = state.project.relations.groups;
      let linkTargetGroupIndex = resolveLinkTargetForComponent(
        groups,
        componentId,
        state.linkTargetGroupIndex,
      );
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

      linkTargetGroupIndex = resolveLinkTargetForComponent(
        project.relations.groups,
        componentId,
        clampLinkTargetIndex(project.relations.groups.length, linkTargetGroupIndex),
      );

      return {
        ...state,
        project,
        linkTargetGroupIndex,
        linkFocusComponentId: componentId,
        currentPage: pageFile,
        selection: null,
      };
    }

    case 'ADD_IMAGE': {
      if (!state.project) return state;
      const imageUrls = new Map(state.project.imageUrls);
      imageUrls.set(action.filename, action.objectUrl);
      return {
        ...state,
        project: { ...state.project, imageUrls },
      };
    }

    case 'CREATE_PAGE':
      return applyCreatePageState(state, action.fileName);

    case 'RENAME_PAGE':
      return applyRenamePageState(state, action.fileName, action.newPageName);

    case 'DELETE_PAGE':
      return applyDeletePageState(state, action.fileName);

    case 'TOGGLE_PIN_PAGE': {
      if (!state.project || !state.currentPage) return state;
      const pinnedPages = togglePinnedPage(
        state.project.relations.pinnedPages,
        action.pageFile,
      );
      const project = rebuildProject({
        ...state.project,
        relations: { ...state.project.relations, pinnedPages },
      });
      const nextState: AppState = { ...state, project };
      const panels = refreshPanelsWithPins(nextState);
      return panels ? { ...nextState, panels } : nextState;
    }

    default:
      return state;
  }
}
