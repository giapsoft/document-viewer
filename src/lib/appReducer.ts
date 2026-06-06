import type { AppAction, AppState, PanelState } from '../types';
import { shrinkFarthestExpanded } from '../lib/index';
import { syncPanelExpandMemory } from './pageExpandMemory';
import {
  updateComponentInProject,
  insertComponentRelative,
  appendImageComponent,
  deleteComponentFromProject,
  rebuildProject,
  findComponent,
} from './projectMutations';
import {
  addComponentToGroup,
  removeComponentFromGroup,
  removeGroupAtIndex,
  createGroup,
  getGroupIndicesForComponent,
  withRelationsGroups,
} from './groupRelations';
import {
  appendSelectionHistory,
  applyComponentSelection,
  buildSelectionForComponent,
  remapSelectionHistoryId,
  scrollToHistoryEntry,
} from './selectionNavigation';
import {
  applyCreatePageState,
  applyDeletePageState,
  applyRenamePageState,
  reorderPagesInProject,
} from './pageMutations';
import { reorderPanelsBySidebar } from './pageOrder';
import {
  buildPanelsForPageContext,
  buildPanelsForPinList,
  hasPinnedPages,
  refreshPanelsWithPins,
  shouldAutoScrollPanels,
  togglePinnedPage,
} from './pagePins';
import { addReplyComment, addRootComment, clearCommentAnchor, setCommentAnchor } from './comments';
import { getStoredCommentUsername } from './commentSession';

function applyExitLinkMode(state: AppState): AppState {
  if (!state.linkMode) return state;
  return {
    ...state,
    linkMode: false,
    linkTargetGroupIndex: null,
    linkFocusComponentId: null,
  };
}

function applyEnterLinkMode(state: AppState): AppState {
  if (state.linkMode || !state.project) return state;

  let project = state.project;
  const groups = project.relations.groups;
  const selectedId = state.selection?.componentId ?? null;
  let linkTargetGroupIndex: number | null = null;
  let linkFocusComponentId: string | null = selectedId;

  if (selectedId) {
    const matching = getGroupIndicesForComponent(groups, selectedId);
    if (matching.length > 0) {
      linkTargetGroupIndex = matching[0];
    } else {
      const nextGroups = createGroup(groups, [selectedId]);
      linkTargetGroupIndex = nextGroups.length - 1;
      project = rebuildProject({
        ...project,
        relations: withRelationsGroups(project.relations, nextGroups),
      });
    }
  } else {
    linkFocusComponentId = null;
  }

  return {
    ...state,
    project,
    linkMode: true,
    linkTargetGroupIndex,
    linkFocusComponentId,
    selection: null,
  };
}

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
  commentPanelExpanded: true,
  commentUsername: null,
  commentLinkTargetId: null,
  focusedCommentId: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROJECT': {
      const nextState: AppState = {
        ...initialAppState,
        project: action.project,
        sidebarExpanded: true,
        commentUsername: getStoredCommentUsername(),
      };
      if (hasPinnedPages(action.project.relations)) {
        return { ...nextState, panels: buildPanelsForPinList(nextState) };
      }
      return nextState;
    }

    case 'CLOSE_PROJECT':
      return initialAppState;

    case 'RELOAD_PROJECT': {
      const project = action.project;
      const pageFiles = new Set(project.pages.map((p) => p.fileName));
      let currentPage = state.currentPage;
      if (!currentPage || !pageFiles.has(currentPage)) {
        currentPage = project.pages[0]?.fileName ?? null;
      }

      let nextState: AppState = {
        ...state,
        project,
        panels: [],
        currentPage,
        selection: null,
        linkMode: false,
        linkTargetGroupIndex: null,
        linkFocusComponentId: null,
        selectionHistory: [],
        selectionHistoryIndex: -1,
        scrollToComponent: null,
        selectionScrollNonce: 0,
      };

      if (hasPinnedPages(project.relations)) {
        nextState = {
          ...nextState,
          panels: buildPanelsForPinList(nextState),
        };
      } else if (currentPage) {
        nextState = {
          ...nextState,
          panels: buildPanelsForPageContext(nextState, currentPage),
        };
      }

      return nextState;
    }

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

      const shouldScrollSecondaryPanels =
        shouldAutoScrollPanels(state) && applied.selection.relatedIds.size > 1;

      return {
        ...state,
        ...applied,
        selectionHistory: history,
        selectionHistoryIndex: index,
        scrollToComponent: null,
        selectionScrollNonce: shouldScrollSecondaryPanels
          ? state.selectionScrollNonce + 1
          : state.selectionScrollNonce,
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
        scrollToComponent: shouldAutoScrollPanels(state)
          ? scrollToHistoryEntry(state, entry)
          : null,
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
        scrollToComponent: shouldAutoScrollPanels(state)
          ? scrollToHistoryEntry(state, entry)
          : null,
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

      syncPanelExpandMemory(panels);
      return { ...state, panels };
    }

    case 'REORDER_PANELS': {
      if (!state.project) return state;
      const sidebarOrder = action.orderedPageFiles;
      const panels = reorderPanelsBySidebar(state.panels, sidebarOrder);
      return { ...state, panels };
    }

    case 'REORDER_PAGES': {
      if (!state.project) return state;
      const project = reorderPagesInProject(state.project, action.orderedPageFiles);
      if (!project) return state;
      const sidebarOrder = project.relations.pageOrder ?? action.orderedPageFiles;
      const panels = reorderPanelsBySidebar(state.panels, sidebarOrder);
      return { ...state, project, panels };
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
          relations = withRelationsGroups(
            relations,
            createGroup(relations.groups, [newComponent.id]),
          );
          linkTargetGroupIndex = relations.groups.length - 1;
        } else {
          relations = withRelationsGroups(
            relations,
            addComponentToGroup(
              relations.groups,
              linkTargetGroupIndex,
              newComponent.id,
            ),
          );
        }

        const rebuilt = rebuildProject({ ...project, relations });

        const nextState: AppState = {
          ...state,
          project: rebuilt,
          currentPage: pageFile,
          selection: null,
          linkTargetGroupIndex,
          linkFocusComponentId: newComponent.id,
        };

        return {
          ...nextState,
          panels: buildPanelsForPageContext(nextState, pageFile),
        };
      }

      const entry = { componentId: newComponent.id, pageFile };
      const { history, index } = appendSelectionHistory(
        state.selectionHistory,
        state.selectionHistoryIndex,
        entry,
      );

      const baseState: AppState = {
        ...state,
        project,
        currentPage: pageFile,
      };
      const applied = applyComponentSelection(baseState, newComponent.id, pageFile);
      if (!applied) return baseState;

      return {
        ...baseState,
        ...applied,
        selectionHistory: history,
        selectionHistoryIndex: index,
      };
    }

    case 'TOGGLE_LINK_MODE':
      return state.linkMode ? applyExitLinkMode(state) : applyEnterLinkMode(state);

    case 'SET_LINK_MODE':
      return action.enabled ? applyEnterLinkMode(state) : applyExitLinkMode(state);

    case 'DELETE_ACTIVE_GROUP': {
      if (!state.project) return state;

      let groups = state.project.relations.groups;

      if (state.linkMode) {
        if (state.linkTargetGroupIndex === null) return state;
        groups = removeGroupAtIndex(groups, state.linkTargetGroupIndex);
      } else if (!state.selection?.matchingGroupIndices.length) {
        return state;
      } else {
        const indicesToRemove = [...state.selection.matchingGroupIndices].sort(
          (a, b) => b - a,
        );
        for (const groupIndex of indicesToRemove) {
          groups = removeGroupAtIndex(groups, groupIndex);
        }
      }
      const project = rebuildProject({
        ...state.project,
        relations: withRelationsGroups(state.project.relations, groups),
      });

      let nextState: AppState = { ...state, project };

      if (state.linkMode) {
        nextState = {
          ...nextState,
          linkTargetGroupIndex: null,
        };
      } else if (state.selection) {
        const { componentId } = state.selection;
        const pageFile =
          state.project.index.componentToPage.get(componentId) ?? state.currentPage;
        if (pageFile) {
          const applied = applyComponentSelection(nextState, componentId, pageFile);
          if (applied) {
            nextState = {
              ...nextState,
              ...applied,
              selectionScrollNonce: shouldAutoScrollPanels(state)
                ? state.selectionScrollNonce + 1
                : state.selectionScrollNonce,
            };
          } else {
            nextState = {
              ...nextState,
              selection: {
                ...state.selection,
                relatedIds: new Set([componentId]),
                activeGroupIndex: null,
                matchingGroupIndices: [],
              },
            };
          }
        }
      }

      const panels = refreshPanelsWithPins(nextState);
      if (panels) {
        nextState = { ...nextState, panels };
      }

      return nextState;
    }

    case 'TOGGLE_LINK_COMPONENT': {
      if (!state.project || !state.linkMode) return state;

      const { componentId, pageFile } = action;
      if (!state.project.index.componentData.has(componentId)) return state;

      let groups = state.project.relations.groups;
      let linkTargetGroupIndex = state.linkTargetGroupIndex;

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
          if (result.removedGroupIndex !== null) {
            linkTargetGroupIndex = null;
          }
        } else {
          groups = addComponentToGroup(groups, linkTargetGroupIndex, componentId);
        }
      }

      const project = rebuildProject({
        ...state.project,
        relations: withRelationsGroups(state.project.relations, groups),
      });

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
      const imageBlobs = new Map(state.project.imageBlobs);
      imageUrls.set(action.filename, action.objectUrl);
      imageBlobs.set(action.filename, action.blob);
      return {
        ...state,
        project: { ...state.project, imageUrls, imageBlobs },
      };
    }

    case 'APPEND_IMAGE_COMPONENT': {
      if (!state.project) return state;
      const { pageFile, filename, objectUrl, blob } = action;

      const imageUrls = new Map(state.project.imageUrls);
      const imageBlobs = new Map(state.project.imageBlobs);
      imageUrls.set(filename, objectUrl);
      imageBlobs.set(filename, blob);

      const { project: withComponent, newComponent } = appendImageComponent(
        { ...state.project, imageUrls },
        pageFile,
        filename,
      );

      const targetPanel = state.panels.find((p) => p.pageFile === pageFile);
      const shouldScroll = Boolean(targetPanel?.expanded);

      return {
        ...state,
        project: withComponent,
        scrollToComponent: shouldScroll
          ? {
              componentId: newComponent.id,
              nonce: (state.scrollToComponent?.nonce ?? 0) + 1,
            }
          : state.scrollToComponent,
      };
    }

    case 'CREATE_PAGE':
      return applyCreatePageState(state, action.fileName, action.pageName);

    case 'RENAME_PAGE':
      return applyRenamePageState(state, action.fileName, action.newPageName);

    case 'DELETE_PAGE':
      return applyDeletePageState(state, action.fileName);

    case 'TOGGLE_PIN_PAGE': {
      if (!state.project) return state;
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

    case 'CLEAR_ALL_PINS': {
      if (!state.project) return state;
      const project = rebuildProject({
        ...state.project,
        relations: { ...state.project.relations, pinnedPages: [] },
      });
      const nextState: AppState = { ...state, project };
      const panels = state.currentPage
        ? buildPanelsForPageContext(nextState, state.currentPage)
        : [];
      return { ...nextState, panels };
    }

    case 'TOGGLE_COMMENT_PANEL':
      return { ...state, commentPanelExpanded: !state.commentPanelExpanded };

    case 'SET_COMMENT_USERNAME': {
      const username = action.username.trim();
      if (!username) return state;
      return { ...state, commentUsername: username };
    }

    case 'SELECT_COMMENT_LINK_TARGET':
      return {
        ...state,
        commentLinkTargetId: action.commentId,
      };

    case 'FOCUS_COMMENT': {
      if (!action.commentId || !state.project) {
        return { ...state, focusedCommentId: null };
      }
      const comment = (state.project.relations.comments ?? []).find(
        (c) => c.id === action.commentId,
      );
      if (!comment) {
        return { ...state, focusedCommentId: action.commentId };
      }

      const componentId = comment.anchor?.componentId ?? null;
      if (!componentId) {
        return { ...state, focusedCommentId: action.commentId };
      }

      const found = findComponent(state.project, componentId);
      if (!found) {
        return { ...state, focusedCommentId: action.commentId };
      }

      const { pageFile } = found;
      const scrollToComponent = {
        componentId,
        nonce: (state.scrollToComponent?.nonce ?? 0) + 1,
      };
      const singlePagePanels: PanelState[] = [{ pageFile, expanded: true }];

      const base = {
        ...state,
        focusedCommentId: action.commentId,
        currentPage: pageFile,
        panels: singlePagePanels,
        scrollToComponent,
      };

      if (state.linkMode) {
        return base;
      }

      const matchingGroupIndices = getGroupIndicesForComponent(
        state.project.relations.groups,
        componentId,
      );
      const { history, index } = appendSelectionHistory(
        state.selectionHistory,
        state.selectionHistoryIndex,
        { componentId, pageFile },
      );

      return {
        ...base,
        selection: {
          componentId,
          relatedIds: new Set([componentId]),
          activeGroupIndex: null,
          matchingGroupIndices,
        },
        selectionHistory: history,
        selectionHistoryIndex: index,
      };
    }

    case 'ADD_ROOT_COMMENT': {
      if (!state.project || !state.commentUsername) return state;
      const comments = addRootComment(
        state.project.relations.comments ?? [],
        state.commentUsername,
        action.body,
      );
      const project = rebuildProject({
        ...state.project,
        relations: { ...state.project.relations, comments },
      });
      const newId = comments[comments.length - 1]?.id ?? null;
      return {
        ...state,
        project,
        commentLinkTargetId: newId,
        focusedCommentId: newId,
      };
    }

    case 'ADD_REPLY_COMMENT': {
      if (!state.project || !state.commentUsername) return state;
      const comments = addReplyComment(
        state.project.relations.comments ?? [],
        action.parentId,
        state.commentUsername,
        action.body,
      );
      const project = rebuildProject({
        ...state.project,
        relations: { ...state.project.relations, comments },
      });
      const newId = comments[comments.length - 1]?.id ?? null;
      return { ...state, project, focusedCommentId: newId };
    }

    case 'SET_COMMENT_ANCHOR': {
      if (!state.project) return state;
      const comments = setCommentAnchor(
        state.project.relations.comments ?? [],
        action.commentId,
        action.anchor,
      );
      const project = rebuildProject({
        ...state.project,
        relations: { ...state.project.relations, comments },
      });
      return { ...state, project };
    }

    case 'CLEAR_COMMENT_ANCHOR': {
      if (!state.project) return state;
      const comments = clearCommentAnchor(
        state.project.relations.comments ?? [],
        action.commentId,
      );
      const project = rebuildProject({
        ...state.project,
        relations: { ...state.project.relations, comments },
      });
      return { ...state, project };
    }

    default:
      return state;
  }
}
