import type { AppAction, AppState, PanelState } from '../types';
import { shrinkFarthestExpanded } from '../lib/index';
import {
  updateComponentInProject,
  insertComponentRelative,
  appendImageComponent,
  deleteComponentFromProject,
  rebuildProject,
  updateProjectComments,
  findComponent,
} from './projectMutations';
import {
  addComponentToGroup,
  removeComponentFromGroup,
  removeGroupAtIndex,
  createGroup,
  getGroupIndicesForComponent,
  withRelationsGroups,
  cloneGroups,
  groupsEqual,
} from './groupRelations';
import {
  appendSelectionHistory,
  applyComponentSelection,
  buildSelectionStateForComponent,
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
import { addPageToPanels, applyOpenPage, getSidebarOrder } from './pagePanels';
import { getFirstHighlightedComponentId } from './selectionHighlight';
import {
  addReplyComment,
  addRootComment,
  canOwnComment,
  clearCommentAnchor,
  commentAnchorsEqual,
  deleteCommentSubtree,
  pickComponentAnchorCommentId,
  setCommentAnchor,
  updateCommentBody,
} from './comments';
import { getOrCreateCommentAuthorId, getStoredCommentUsername } from './commentSession';

function applyExitLinkMode(state: AppState): AppState {
  if (!state.linkMode) return state;

  const focusId = state.linkFocusComponentId;
  let nextState: AppState = {
    ...state,
    linkMode: false,
    linkTargetGroupIndex: null,
    linkFocusComponentId: null,
    linkPreviewGroups: null,
    linkCtrlActive: false,
  };

  if (!focusId || !state.project) return nextState;

  const pageFile =
    state.project.index.componentToPage.get(focusId) ?? state.currentPage;
  if (!pageFile) return nextState;

  const applied = applyComponentSelection(nextState, focusId, pageFile);
  return applied ? { ...nextState, ...applied } : nextState;
}

function bumpOutstandingComment(
  state: AppState,
  commentId: string | null,
): Partial<AppState> {
  if (!commentId) {
    return { outstandingCommentId: null };
  }
  return {
    outstandingCommentId: commentId,
    commentPanelExpanded: true,
    commentPanelScrollNonce: state.commentPanelScrollNonce + 1,
  };
}

function applyEnterLinkPreview(state: AppState): AppState {
  if (state.linkMode || !state.project) return state;

  let linkPreviewGroups = cloneGroups(state.project.relations.groups);
  const selectedId = state.selection?.componentId ?? null;
  let linkTargetGroupIndex: number | null = null;
  let linkFocusComponentId: string | null = selectedId;

  if (selectedId) {
    const matching = getGroupIndicesForComponent(linkPreviewGroups, selectedId);
    if (matching.length > 0) {
      linkTargetGroupIndex = matching[0];
    } else {
      linkPreviewGroups = createGroup(linkPreviewGroups, [selectedId]);
      linkTargetGroupIndex = linkPreviewGroups.length - 1;
    }
  } else {
    linkFocusComponentId = null;
  }

  return {
    ...state,
    linkMode: true,
    linkCtrlActive: true,
    linkPreviewGroups,
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
  linkPreviewGroups: null,
  linkCtrlActive: false,
  selectionHistory: [],
  selectionHistoryIndex: -1,
  scrollToComponent: null,
  selectionScrollNonce: 0,
  commentPanelExpanded: false,
  commentUsername: null,
  commentAuthorId: getOrCreateCommentAuthorId(),
  selectedCommentId: null,
  outstandingCommentId: null,
  commentPanelScrollNonce: 0,
  commentLinkPreviewAnchor: null,
  commentLinkCtrlActive: false,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROJECT': {
      const nextState: AppState = {
        ...initialAppState,
        project: action.project,
        sidebarExpanded: true,
        commentUsername: getStoredCommentUsername(),
        commentAuthorId: getOrCreateCommentAuthorId(),
      };
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
        linkPreviewGroups: null,
        linkCtrlActive: false,
        selectionHistory: [],
        selectionHistoryIndex: -1,
        scrollToComponent: null,
        selectionScrollNonce: 0,
      };

      const panels = state.panels.filter((p) => pageFiles.has(p.pageFile));
      nextState = {
        ...nextState,
        panels,
        currentPage:
          currentPage && panels.some((p) => p.pageFile === currentPage)
            ? currentPage
            : panels[0]?.pageFile ?? currentPage,
      };

      return nextState;
    }

    case 'PATCH_PROJECT':
      return { ...state, project: action.project };

    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarExpanded: !state.sidebarExpanded };

    case 'EXPAND_SIDEBAR':
      return { ...state, sidebarExpanded: true };

    case 'OPEN_PAGE': {
      const opened = applyOpenPage(state, action.pageFile);
      const nextState: AppState = { ...state, ...opened };

      if (!state.linkMode && state.selection && nextState.currentPage === action.pageFile) {
        const page = state.project?.pages.find((p) => p.fileName === action.pageFile);
        const scrollTarget = page
          ? getFirstHighlightedComponentId(page, state.selection, true)
          : null;
        if (scrollTarget) {
          return {
            ...nextState,
            selectionScrollNonce: state.selectionScrollNonce + 1,
            scrollToComponent: {
              componentId: scrollTarget,
              nonce: (state.scrollToComponent?.nonce ?? 0) + 1,
            },
          };
        }
      }

      return nextState;
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

      const shouldScrollSecondaryPanels = applied.selection.relatedIds.size > 1;

      const resolved = findComponent(state.project, componentId);
      const isMd = resolved?.component.type === 'md';
      const anchorCommentId = !isMd
        ? pickComponentAnchorCommentId(state.project.relations.comments ?? [], componentId)
        : null;

      return {
        ...state,
        ...applied,
        selectionHistory: history,
        selectionHistoryIndex: index,
        scrollToComponent: null,
        ...(isMd ? { outstandingCommentId: null } : bumpOutstandingComment(state, anchorCommentId)),
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
        const remapped = buildSelectionStateForComponent(
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

      if (state.linkMode && state.linkPreviewGroups) {
        let linkPreviewGroups = cloneGroups(state.linkPreviewGroups);
        let linkTargetGroupIndex = state.linkTargetGroupIndex;

        if (linkTargetGroupIndex === null) {
          linkPreviewGroups = createGroup(linkPreviewGroups, [newComponent.id]);
          linkTargetGroupIndex = linkPreviewGroups.length - 1;
        } else {
          linkPreviewGroups = addComponentToGroup(
            linkPreviewGroups,
            linkTargetGroupIndex,
            newComponent.id,
          );
        }

        const nextState: AppState = {
          ...state,
          project,
          linkPreviewGroups,
          currentPage: pageFile,
          selection: null,
          linkTargetGroupIndex,
          linkFocusComponentId: newComponent.id,
        };

        const sidebarOrder = getSidebarOrder(nextState);
        return {
          ...nextState,
          panels: addPageToPanels(nextState.panels, pageFile, sidebarOrder),
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
      return state.linkMode ? applyExitLinkMode(state) : applyEnterLinkPreview(state);

    case 'SET_LINK_MODE':
      return action.enabled ? applyEnterLinkPreview(state) : applyExitLinkMode(state);

    case 'SET_LINK_CTRL_ACTIVE': {
      if (!action.active) {
        return { ...state, linkCtrlActive: false };
      }
      if (state.commentLinkCtrlActive || state.linkMode) return state;
      return applyEnterLinkPreview(state);
    }

    case 'END_LINK_SESSION': {
      if (!state.project || !state.linkMode) {
        return { ...state, linkCtrlActive: false };
      }
      const preview = state.linkPreviewGroups;
      const saved = state.project.relations.groups;

      if (!preview || groupsEqual(preview, saved)) {
        return applyExitLinkMode({ ...state, linkCtrlActive: false });
      }

      const project = rebuildProject({
        ...state.project,
        relations: withRelationsGroups(state.project.relations, preview),
      });
      return applyExitLinkMode({ ...state, project, linkCtrlActive: false });
    }

    case 'DELETE_ACTIVE_GROUP': {
      if (!state.project) return state;

      if (state.linkMode) {
        if (state.linkTargetGroupIndex === null || !state.linkPreviewGroups) return state;
        return {
          ...state,
          linkPreviewGroups: removeGroupAtIndex(
            state.linkPreviewGroups,
            state.linkTargetGroupIndex,
          ),
          linkTargetGroupIndex: null,
        };
      }

      let groups = state.project.relations.groups;

      if (!state.selection?.matchingGroupIndices.length) {
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

      if (state.selection) {
        const { componentId } = state.selection;
        const pageFile =
          state.project.index.componentToPage.get(componentId) ?? state.currentPage;
        if (pageFile) {
          const applied = applyComponentSelection(nextState, componentId, pageFile);
          if (applied) {
            nextState = {
              ...nextState,
              currentPage: applied.currentPage,
              selection: applied.selection,
              selectionScrollNonce: state.selectionScrollNonce + 1,
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

      return nextState;
    }

    case 'TOGGLE_LINK_COMPONENT': {
      if (!state.project || !state.linkMode || !state.linkPreviewGroups) return state;

      const { componentId, pageFile } = action;
      if (!state.project.index.componentData.has(componentId)) return state;

      let groups = cloneGroups(state.linkPreviewGroups);
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

      return {
        ...state,
        linkPreviewGroups: groups,
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

    case 'TOGGLE_COMMENT_PANEL':
      return { ...state, commentPanelExpanded: !state.commentPanelExpanded };

    case 'SET_COMMENT_USERNAME': {
      const username = action.username.trim();
      if (!username) return state;
      return { ...state, commentUsername: username };
    }

    case 'SELECT_COMMENT': {
      if (!state.project) return state;
      const { commentId } = action;
      const comments = state.project.relations.comments ?? [];
      const comment = comments.find((c) => c.id === commentId);
      if (!comment) return state;

      if (!canOwnComment(comment, state.commentAuthorId, state.commentUsername)) {
        return state;
      }

      if (state.selectedCommentId === commentId) {
        return {
          ...state,
          selectedCommentId: null,
          outstandingCommentId: null,
          commentLinkPreviewAnchor: null,
          commentLinkCtrlActive: false,
        };
      }

      return {
        ...state,
        selectedCommentId: commentId,
        outstandingCommentId: null,
        commentLinkPreviewAnchor: comment.anchor ?? null,
        commentLinkCtrlActive: false,
        linkMode: false,
        linkTargetGroupIndex: null,
        linkFocusComponentId: null,
        linkPreviewGroups: null,
        linkCtrlActive: false,
      };
    }

    case 'SET_COMMENT_LINK_PREVIEW':
      if (!state.selectedCommentId) return state;
      return { ...state, commentLinkPreviewAnchor: action.anchor };

    case 'SET_COMMENT_LINK_CTRL_ACTIVE': {
      if (!state.selectedCommentId || !state.project) return state;
      if (!action.active) {
        return { ...state, commentLinkCtrlActive: false };
      }
      const selected = (state.project.relations.comments ?? []).find(
        (c) => c.id === state.selectedCommentId,
      );
      if (
        !selected ||
        !canOwnComment(selected, state.commentAuthorId, state.commentUsername)
      ) {
        return state;
      }
      return {
        ...state,
        commentLinkCtrlActive: true,
        commentLinkPreviewAnchor: selected.anchor ?? null,
        linkMode: false,
        linkTargetGroupIndex: null,
        linkFocusComponentId: null,
        linkPreviewGroups: null,
        linkCtrlActive: false,
      };
    }

    case 'END_COMMENT_LINK_SESSION': {
      if (!state.project || !state.selectedCommentId) {
        return { ...state, commentLinkCtrlActive: false };
      }
      const commentId = state.selectedCommentId;
      const preview = state.commentLinkPreviewAnchor;
      const saved = (state.project.relations.comments ?? []).find(
        (c) => c.id === commentId,
      );
      const savedAnchor = saved?.anchor;

      if (commentAnchorsEqual(preview, savedAnchor)) {
        return {
          ...state,
          commentLinkCtrlActive: false,
          commentLinkPreviewAnchor: savedAnchor ?? null,
        };
      }

      const comments = preview
        ? setCommentAnchor(
            state.project.relations.comments ?? [],
            commentId,
            preview,
            state.commentAuthorId,
            state.commentUsername,
          )
        : clearCommentAnchor(
            state.project.relations.comments ?? [],
            commentId,
            state.commentAuthorId,
            state.commentUsername,
          );
      const project = updateProjectComments(state.project, comments);
      return {
        ...state,
        project,
        selectedCommentId: null,
        commentLinkPreviewAnchor: null,
        commentLinkCtrlActive: false,
      };
    }

    case 'FOCUS_COMMENT': {
      if (!action.commentId || !state.project) {
        return { ...state, outstandingCommentId: null };
      }
      const comment = (state.project.relations.comments ?? []).find(
        (c) => c.id === action.commentId,
      );
      if (!comment) {
        return { ...state, ...bumpOutstandingComment(state, action.commentId) };
      }

      const componentId = comment.anchor?.componentId ?? null;
      if (!componentId) {
        return { ...state, ...bumpOutstandingComment(state, action.commentId) };
      }

      const found = findComponent(state.project, componentId);
      if (!found) {
        return { ...state, ...bumpOutstandingComment(state, action.commentId) };
      }

      const { pageFile } = found;
      const scrollToComponent = {
        componentId,
        nonce: (state.scrollToComponent?.nonce ?? 0) + 1,
      };
      const sidebarOrder = getSidebarOrder(state);
      const panels = addPageToPanels(state.panels, pageFile, sidebarOrder);

      const base = {
        ...state,
        ...bumpOutstandingComment(state, action.commentId),
        currentPage: pageFile,
        panels,
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

    case 'OUTSTANDING_COMMENT': {
      if (!state.project) return state;
      if (!action.commentId) {
        return { ...state, outstandingCommentId: null };
      }
      const exists = (state.project.relations.comments ?? []).some(
        (c) => c.id === action.commentId && c.deletedAt == null,
      );
      if (!exists) return state;
      return { ...state, ...bumpOutstandingComment(state, action.commentId) };
    }

    case 'ADD_ROOT_COMMENT': {
      if (!state.project || !state.commentUsername) return state;
      const comments = addRootComment(
        state.project.relations.comments ?? [],
        state.commentUsername,
        state.commentAuthorId,
        action.body,
      );
      const project = updateProjectComments(state.project, comments);
      const newId = comments[comments.length - 1]?.id ?? null;
      return {
        ...state,
        project,
        selectedCommentId: newId,
        commentLinkPreviewAnchor: null,
        commentLinkCtrlActive: false,
      };
    }

    case 'ADD_REPLY_COMMENT': {
      if (!state.project || !state.commentUsername) return state;
      const comments = addReplyComment(
        state.project.relations.comments ?? [],
        action.parentId,
        state.commentUsername,
        state.commentAuthorId,
        action.body,
      );
      const project = updateProjectComments(state.project, comments);
      return { ...state, project };
    }

    case 'SET_COMMENT_ANCHOR': {
      if (state.commentLinkCtrlActive || !state.project) return state;
      const comments = setCommentAnchor(
        state.project.relations.comments ?? [],
        action.commentId,
        action.anchor,
        state.commentAuthorId,
        state.commentUsername,
      );
      const project = updateProjectComments(state.project, comments);
      return { ...state, project };
    }

    case 'CLEAR_COMMENT_ANCHOR': {
      if (state.commentLinkCtrlActive || !state.project) return state;
      const comments = clearCommentAnchor(
        state.project.relations.comments ?? [],
        action.commentId,
        state.commentAuthorId,
        state.commentUsername,
      );
      const project = updateProjectComments(state.project, comments);
      return { ...state, project };
    }

    case 'UPDATE_COMMENT': {
      if (!state.project) return state;
      const comments = updateCommentBody(
        state.project.relations.comments ?? [],
        action.commentId,
        state.commentAuthorId,
        state.commentUsername,
        action.body,
      );
      const project = updateProjectComments(state.project, comments);
      return { ...state, project };
    }

    case 'DELETE_COMMENT': {
      if (!state.project) return state;
      const before = state.project.relations.comments ?? [];
      const comments = deleteCommentSubtree(
        before,
        action.commentId,
        state.commentAuthorId,
        state.commentUsername,
      );
      const beforeById = new Map(before.map((comment) => [comment.id, comment]));
      const removedIds = new Set(
        comments
          .filter(
            (comment) =>
              comment.deletedAt != null &&
              beforeById.get(comment.id)?.deletedAt == null,
          )
          .map((comment) => comment.id),
      );
      const project = updateProjectComments(state.project, comments);
      return {
        ...state,
        project,
        selectedCommentId:
          state.selectedCommentId && removedIds.has(state.selectedCommentId)
            ? null
            : state.selectedCommentId,
        outstandingCommentId:
          state.outstandingCommentId && removedIds.has(state.outstandingCommentId)
            ? null
            : state.outstandingCommentId,
        commentLinkPreviewAnchor:
          state.selectedCommentId && removedIds.has(state.selectedCommentId)
            ? null
            : state.commentLinkPreviewAnchor,
        commentLinkCtrlActive:
          state.selectedCommentId && removedIds.has(state.selectedCommentId)
            ? false
            : state.commentLinkCtrlActive,
      };
    }

    default:
      return state;
  }
}
