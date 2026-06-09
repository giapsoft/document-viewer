import type { AppAction, AppState, DocComment } from '../types';
import {
  updateComponentInProject,
  insertComponentRelative,
  appendImageComponent,
  deleteComponentFromProject,
  rebuildProject,
  updateProjectComments,
  findComponent,
} from './projectMutations';
import { reconcileMdWarnings } from './loadProject';
import {
  addComponentToGroup,
  removeComponentFromGroup,
  removeGroupAtIndex,
  createGroup,
  getGroupIndicesForComponent,
  withRelationsGroups,
  cloneGroups,
  groupsEqual,
  canAddComponentToGroupByPageLimit,
  LINK_GROUP_MAX_PAGES_TOAST,
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
import { addLinkedPageToPanels, addPageToPanels, applyOpenPage, getMainSelectionPageFile } from './pagePanels';
import { getPersistedGroupIndicesForComponent } from './mdVirtualGroups';
import { getFirstHighlightedComponentId } from './selectionHighlight';
import { applyWorkspaceRestore } from './workspaceUrl';
import {
  activeComments,
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
import {
  getCommentRevision,
  isCommentRead,
  isOwnComment,
  markCommentRead,
  markCommentUnread,
  pruneCommentReadState,
  type CommentReadState,
} from './commentReadState';
import { getOrCreateCommentAuthorId, getStoredCommentUsername } from './commentSession';
import {
  clampMaxOpenPages,
  getStoredMaxOpenPages,
  persistMaxOpenPages,
} from './maxOpenPagesStorage';
import { enforcePanelLimit } from './index';
import { bumpComponentVersion, getComponentVersion } from './componentVersion';
import {
  isComponentRead,
  markComponentRead,
  markComponentUnread,
  normalizeReadUsername,
  type ComponentReadState,
} from './readState';

function authorReadStateForComponent(
  readState: ComponentReadState,
  username: string | null,
  componentId: string,
  version: number,
): ComponentReadState {
  if (!username) return readState;
  return markComponentRead(readState, componentId, version);
}

function authorReadStateForComment(
  readState: CommentReadState,
  username: string | null,
  commentId: string,
  revision: number,
): CommentReadState {
  if (!username) return readState;
  return markCommentRead(readState, commentId, revision);
}

function findActiveComment(
  comments: DocComment[] | undefined,
  commentId: string,
): DocComment | undefined {
  return activeComments(comments ?? []).find((comment) => comment.id === commentId);
}

function showAppToast(state: AppState, message: string): Pick<AppState, 'appToast'> {
  return {
    appToast: {
      message,
      id: (state.appToast?.id ?? 0) + 1,
    },
  };
}

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
  if (!applied) return nextState;

  return {
    ...nextState,
    selection: applied.selection,
  };
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

function applyEnterLinkPreview(
  state: AppState,
  preferredGroupIndex?: number | null,
): AppState {
  if (state.linkMode || !state.project) return state;

  let linkPreviewGroups = cloneGroups(state.project.relations.groups);
  const selectedId = state.selection?.componentId ?? null;
  let linkTargetGroupIndex: number | null = null;
  let linkFocusComponentId: string | null = selectedId;

  if (selectedId) {
    const matching = getGroupIndicesForComponent(linkPreviewGroups, selectedId);
    if (matching.length > 0) {
      linkTargetGroupIndex =
        preferredGroupIndex != null && matching.includes(preferredGroupIndex)
          ? preferredGroupIndex
          : matching[0];
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
  maxOpenPages: getStoredMaxOpenPages(),
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
  flashedComponent: null,
  selectionScrollNonce: 0,
  commentPanelExpanded: false,
  commentUsername: null,
  componentReadState: {},
  commentReadState: {},
  commentAuthorId: getOrCreateCommentAuthorId(),
  selectedCommentId: null,
  outstandingCommentId: null,
  commentPanelScrollNonce: 0,
  commentLinkPreviewAnchor: null,
  commentLinkCtrlActive: false,
  contentEditorOpen: false,
  appToast: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROJECT': {
      const nextState: AppState = {
        ...initialAppState,
        project: action.project,
        sidebarExpanded: true,
        commentUsername: getStoredCommentUsername(),
        componentReadState: {},
        commentReadState: {},
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

    case 'RESTORE_WORKSPACE_FROM_URL':
      return applyWorkspaceRestore(
        state,
        action.pageFiles,
        action.primaryComponentId,
      );

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
        scrollToComponent: action.scrollIntoView
          ? {
              componentId,
              nonce: (state.scrollToComponent?.nonce ?? 0) + 1,
            }
          : null,
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
      if (state.contentEditorOpen) return state;
      if (state.linkMode) {
        return {
          ...state,
          linkTargetGroupIndex: null,
          linkFocusComponentId: null,
        };
      }
      return { ...state, selection: null };

    case 'SET_MAX_OPEN_PAGES': {
      const maxOpenPages = clampMaxOpenPages(action.maxOpenPages);
      if (maxOpenPages === state.maxOpenPages) return state;
      persistMaxOpenPages(maxOpenPages);
      const selectionPage = getMainSelectionPageFile(state);
      const keepPages =
        maxOpenPages > 1
          ? [selectionPage, state.currentPage].filter((pageFile): pageFile is string =>
              Boolean(pageFile),
            )
          : state.currentPage
            ? [state.currentPage]
            : [];
      const panels = enforcePanelLimit(
        state.panels,
        maxOpenPages,
        keepPages.length > 0 ? keepPages : undefined,
      );
      let currentPage = state.currentPage;
      if (currentPage && !panels.some((panel) => panel.pageFile === currentPage)) {
        currentPage = panels[0]?.pageFile ?? null;
      }
      return { ...state, maxOpenPages, panels, currentPage };
    }

    case 'REORDER_PANELS':
      return state;

    case 'REORDER_PAGES': {
      if (!state.project) return state;
      const project = reorderPagesInProject(state.project, action.orderedPageFiles);
      if (!project) return state;
      return { ...state, project };
    }

    case 'UPDATE_COMPONENT': {
      if (!state.project) return state;
      const { pageFile, componentId, patch } = action;
      const before = findComponent(state.project, componentId);
      const oldVersion = before ? getComponentVersion(before.component) : -1;

      const { project, newComponentId } = updateComponentInProject(
        state.project,
        pageFile,
        componentId,
        patch,
      );

      const rebuilt = rebuildProject(project);
      const after = findComponent(rebuilt, newComponentId);
      const newVersion = after ? getComponentVersion(after.component) : oldVersion;

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

      const componentReadState =
        newVersion > oldVersion
          ? authorReadStateForComponent(
              state.componentReadState,
              state.commentUsername,
              newComponentId,
              newVersion,
            )
          : state.componentReadState;

      return {
        ...state,
        project: rebuilt,
        selection,
        selectionHistory,
        componentReadState,
      };
    }

    case 'UPDATE_MD_CONTENT': {
      if (!state.project) return state;
      const previous = state.project.mdFiles.get(action.componentId) ?? '';
      if (previous === action.content) return state;

      const mdFiles = new Map(state.project.mdFiles);
      mdFiles.set(action.componentId, action.content);

      let bumpedVersion = 0;
      const pages = state.project.pages.map((page) => ({
        ...page,
        components: page.components.map((component) => {
          if (component.id !== action.componentId) return component;
          const bumped = bumpComponentVersion(component);
          bumpedVersion = getComponentVersion(bumped);
          return bumped;
        }),
      }));

      const componentReadState = authorReadStateForComponent(
        state.componentReadState,
        state.commentUsername,
        action.componentId,
        bumpedVersion,
      );

      return {
        ...state,
        project: rebuildProject({ ...state.project, pages, mdFiles }),
        componentReadState,
      };
    }

    case 'DELETE_COMPONENT': {
      if (!state.project) return state;
      const { pageFile, componentId } = action;
      const project = deleteComponentFromProject(state.project, pageFile, componentId);
      if (!project) return state;

      const panels = state.panels.filter((p) => p.pageFile !== pageFile);
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
          const group = linkPreviewGroups[linkTargetGroupIndex] ?? [];
          if (
            canAddComponentToGroupByPageLimit(
              group,
              newComponent.id,
              project.index.componentToPage,
            )
          ) {
            linkPreviewGroups = addComponentToGroup(
              linkPreviewGroups,
              linkTargetGroupIndex,
              newComponent.id,
            );
          }
        }

        const linkGroupPageLimitExceeded =
          linkTargetGroupIndex !== null &&
          !(linkPreviewGroups[linkTargetGroupIndex] ?? []).includes(newComponent.id);

        const componentReadState = authorReadStateForComponent(
          state.componentReadState,
          state.commentUsername,
          newComponent.id,
          getComponentVersion(newComponent),
        );

        const nextState: AppState = {
          ...state,
          project,
          linkPreviewGroups,
          currentPage: pageFile,
          selection: null,
          linkTargetGroupIndex,
          linkFocusComponentId: newComponent.id,
          componentReadState,
          ...(linkGroupPageLimitExceeded
            ? showAppToast(state, LINK_GROUP_MAX_PAGES_TOAST)
            : null),
        };

        return {
          ...nextState,
          panels: addPageToPanels(nextState.panels, pageFile, state.maxOpenPages),
        };
      }

      const entry = { componentId: newComponent.id, pageFile };
      const { history, index } = appendSelectionHistory(
        state.selectionHistory,
        state.selectionHistoryIndex,
        entry,
      );

      const componentReadState = authorReadStateForComponent(
        state.componentReadState,
        state.commentUsername,
        newComponent.id,
        getComponentVersion(newComponent),
      );

      const baseState: AppState = {
        ...state,
        project,
        currentPage: pageFile,
        componentReadState,
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
      if (state.contentEditorOpen) return state;
      return state.linkMode ? applyExitLinkMode(state) : applyEnterLinkPreview(state);

    case 'SET_LINK_MODE':
      if (state.contentEditorOpen) return state;
      return action.enabled ? applyEnterLinkPreview(state) : applyExitLinkMode(state);

    case 'SET_LINK_CTRL_ACTIVE': {
      if (!action.active) {
        return { ...state, linkCtrlActive: false };
      }
      if (state.contentEditorOpen || state.commentLinkCtrlActive || state.linkMode) return state;
      return applyEnterLinkPreview(state, action.preferredGroupIndex);
    }

    case 'SET_LINK_TARGET_GROUP_INDEX': {
      if (!state.linkMode || !state.linkPreviewGroups) return state;
      const { groupIndex } = action;
      if (groupIndex < 0 || groupIndex >= state.linkPreviewGroups.length) return state;
      return { ...state, linkTargetGroupIndex: groupIndex };
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

    case 'REMOVE_COMPONENT_FROM_GROUP': {
      if (!state.project) return state;

      const { componentId, groupIndex } = action;
      const groups = state.project.relations.groups;
      if (groupIndex < 0 || groupIndex >= groups.length) return state;
      if (!groups[groupIndex]?.includes(componentId)) return state;

      const result = removeComponentFromGroup(groups, groupIndex, componentId);
      const project = rebuildProject({
        ...state.project,
        relations: withRelationsGroups(state.project.relations, result.groups),
      });

      let nextState: AppState = { ...state, project };

      if (state.selection) {
        const selectedId = state.selection.componentId;
        const pageFile =
          project.index.componentToPage.get(selectedId) ?? state.currentPage;
        if (pageFile) {
          const applied = applyComponentSelection(nextState, selectedId, pageFile);
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
                relatedIds: new Set([selectedId]),
                activeGroupIndex: null,
                matchingGroupIndices: getGroupIndicesForComponent(result.groups, selectedId),
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
          if (
            !canAddComponentToGroupByPageLimit(
              group,
              componentId,
              state.project.index.componentToPage,
            )
          ) {
            return { ...state, ...showAppToast(state, LINK_GROUP_MAX_PAGES_TOAST) };
          }
          groups = addComponentToGroup(groups, linkTargetGroupIndex, componentId);
        }
      }

      return {
        ...state,
        linkPreviewGroups: groups,
        linkTargetGroupIndex,
        currentPage: pageFile,
        selection: null,
      };
    }

    case 'ADD_IMAGE':
    case 'HYDRATE_IMAGE': {
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

    case 'DELETE_IMAGE': {
      if (!state.project) return state;
      const filename = action.filename.trim();
      if (!filename) return state;
      const imageUrls = new Map(state.project.imageUrls);
      const imageBlobs = new Map(state.project.imageBlobs);
      const objectUrl = imageUrls.get(filename);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      imageUrls.delete(filename);
      imageBlobs.delete(filename);
      return {
        ...state,
        project: { ...state.project, imageUrls, imageBlobs },
      };
    }

    case 'HYDRATE_MD': {
      if (!state.project) return state;
      const mdFiles = new Map(state.project.mdFiles);
      mdFiles.set(action.componentId, action.content);
      let remoteSync = state.project.remoteSync;
      if (action.storagePath && action.fileHash && state.project.remoteSync) {
        const fileHashes = new Map(state.project.remoteSync.fileHashes);
        fileHashes.set(action.storagePath, action.fileHash);
        remoteSync = { fileHashes };
      }
      const shouldScrollToMd =
        state.scrollToComponent?.componentId === action.componentId ||
        state.selection?.componentId === action.componentId;
      return {
        ...state,
        project: { ...state.project, mdFiles, remoteSync },
        ...(shouldScrollToMd
          ? {
              scrollToComponent: {
                componentId: action.componentId,
                nonce: (state.scrollToComponent?.nonce ?? 0) + 1,
              },
            }
          : {}),
      };
    }

    case 'RECONCILE_MD_WARNINGS': {
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          warnings: reconcileMdWarnings(state.project.warnings, state.project),
        },
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

      const shouldScroll = state.panels.some((panel) => panel.pageFile === pageFile);

      const componentReadState = authorReadStateForComponent(
        state.componentReadState,
        state.commentUsername,
        newComponent.id,
        getComponentVersion(newComponent),
      );

      return {
        ...state,
        project: withComponent,
        componentReadState,
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
      const username = normalizeReadUsername(action.username);
      if (!username) return state;
      if (state.commentUsername === username) return state;
      return {
        ...state,
        commentUsername: username,
        componentReadState: {},
        commentReadState: {},
      };
    }

    case 'SET_COMPONENT_READ_STATE':
      return { ...state, componentReadState: action.readState };

    case 'SET_COMMENT_READ_STATE':
      return { ...state, commentReadState: action.readState };

    case 'TOGGLE_COMMENT_READ': {
      if (!state.project || !state.commentUsername) return state;
      const comment = findActiveComment(state.project.relations.comments, action.commentId);
      if (!comment || isOwnComment(comment, state.commentUsername)) return state;

      const revision = getCommentRevision(comment);
      const currentlyRead = isCommentRead(
        action.commentId,
        revision,
        state.commentReadState,
      );
      const commentReadState = currentlyRead
        ? markCommentUnread(state.commentReadState, action.commentId)
        : markCommentRead(state.commentReadState, action.commentId, revision);

      return { ...state, commentReadState };
    }

    case 'FOCUS_UNREAD_COMPONENT': {
      if (!state.project || !state.commentUsername) return state;
      const { componentId, pageFile } = action;
      const applied = applyComponentSelection(state, componentId, pageFile);
      if (!applied) return state;

      const { history, index } = appendSelectionHistory(
        state.selectionHistory,
        state.selectionHistoryIndex,
        { componentId, pageFile },
      );

      const resolved = findComponent(state.project, componentId);
      const isMd = resolved?.component.type === 'md';
      const anchorCommentId = !isMd
        ? pickComponentAnchorCommentId(state.project.relations.comments ?? [], componentId)
        : null;

      return {
        ...state,
        ...applied,
        panels: [{ pageFile, expanded: true }],
        currentPage: pageFile,
        selectionHistory: history,
        selectionHistoryIndex: index,
        scrollToComponent: {
          componentId,
          nonce: (state.scrollToComponent?.nonce ?? 0) + 1,
        },
        linkMode: false,
        linkTargetGroupIndex: null,
        linkFocusComponentId: null,
        linkPreviewGroups: null,
        linkCtrlActive: false,
        ...(isMd ? { outstandingCommentId: null } : bumpOutstandingComment(state, anchorCommentId)),
      };
    }

    case 'TOGGLE_COMPONENT_READ': {
      if (!state.project || !state.commentUsername) return state;
      const found = findComponent(state.project, action.componentId);
      if (!found) return state;

      const version = getComponentVersion(found.component);
      const currentlyRead = isComponentRead(
        action.componentId,
        version,
        state.componentReadState,
      );
      const componentReadState = currentlyRead
        ? markComponentUnread(state.componentReadState, action.componentId)
        : markComponentRead(state.componentReadState, action.componentId, version);

      return { ...state, componentReadState };
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
      if (state.contentEditorOpen) return state;
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
      const panels = addPageToPanels(state.panels, pageFile, state.maxOpenPages);

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

      const matchingGroupIndices = getPersistedGroupIndicesForComponent(
        state.project.index,
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

    case 'JUMP_TO_COMPONENT': {
      if (!state.project) return state;
      const pageFile = state.project.index.componentToPage.get(action.componentId);
      if (!pageFile) return state;

      const targetWasOpen = state.panels.some((panel) => panel.pageFile === pageFile);
      const anchorPageFile = action.anchorPageFile ?? state.currentPage;
      const panels = addLinkedPageToPanels(
        state.panels,
        pageFile,
        anchorPageFile,
        state.maxOpenPages,
      );

      const keepCurrentPage =
        anchorPageFile && panels.some((panel) => panel.pageFile === anchorPageFile)
          ? anchorPageFile
          : pageFile;

      return {
        ...state,
        currentPage: keepCurrentPage,
        panels,
        scrollToComponent: {
          componentId: action.componentId,
          nonce: (state.scrollToComponent?.nonce ?? 0) + 1,
          coldOpen: !targetWasOpen,
        },
        flashedComponent: {
          componentId: action.componentId,
          nonce: (state.flashedComponent?.nonce ?? 0) + 1,
        },
      };
    }

    case 'CLEAR_FLASHED_COMPONENT':
      return { ...state, flashedComponent: null };

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
      const newComment = comments[comments.length - 1];
      const newId = newComment?.id ?? null;
      const commentReadState =
        newComment != null
          ? authorReadStateForComment(
              state.commentReadState,
              state.commentUsername,
              newComment.id,
              getCommentRevision(newComment),
            )
          : state.commentReadState;
      return {
        ...state,
        project,
        selectedCommentId: newId,
        commentLinkPreviewAnchor: null,
        commentLinkCtrlActive: false,
        commentReadState,
      };
    }

    case 'ADD_REPLY_COMMENT': {
      if (!state.project || !state.commentUsername) return state;
      const before = state.project.relations.comments ?? [];
      const beforeIds = new Set(before.map((comment) => comment.id));
      const comments = addReplyComment(
        before,
        action.parentId,
        state.commentUsername,
        state.commentAuthorId,
        action.body,
      );
      const project = updateProjectComments(state.project, comments);
      const added = comments.find((comment) => !beforeIds.has(comment.id));
      const commentReadState =
        added != null
          ? authorReadStateForComment(
              state.commentReadState,
              state.commentUsername,
              added.id,
              getCommentRevision(added),
            )
          : state.commentReadState;
      return { ...state, project, commentReadState };
    }

    case 'SET_COMMENT_ANCHOR': {
      if (state.commentLinkCtrlActive || !state.project) return state;
      const before = findActiveComment(state.project.relations.comments, action.commentId);
      const oldRevision = before ? getCommentRevision(before) : -1;
      const comments = setCommentAnchor(
        state.project.relations.comments ?? [],
        action.commentId,
        action.anchor,
        state.commentAuthorId,
        state.commentUsername,
      );
      const project = updateProjectComments(state.project, comments);
      const after = findActiveComment(comments, action.commentId);
      const newRevision = after ? getCommentRevision(after) : oldRevision;
      const commentReadState =
        after != null && newRevision > oldRevision
          ? authorReadStateForComment(
              state.commentReadState,
              state.commentUsername,
              action.commentId,
              newRevision,
            )
          : state.commentReadState;
      return { ...state, project, commentReadState };
    }

    case 'CLEAR_COMMENT_ANCHOR': {
      if (state.commentLinkCtrlActive || !state.project) return state;
      const before = findActiveComment(state.project.relations.comments, action.commentId);
      const oldRevision = before ? getCommentRevision(before) : -1;
      const comments = clearCommentAnchor(
        state.project.relations.comments ?? [],
        action.commentId,
        state.commentAuthorId,
        state.commentUsername,
      );
      const project = updateProjectComments(state.project, comments);
      const after = findActiveComment(comments, action.commentId);
      const newRevision = after ? getCommentRevision(after) : oldRevision;
      const commentReadState =
        after != null && newRevision > oldRevision
          ? authorReadStateForComment(
              state.commentReadState,
              state.commentUsername,
              action.commentId,
              newRevision,
            )
          : state.commentReadState;
      return { ...state, project, commentReadState };
    }

    case 'UPDATE_COMMENT': {
      if (!state.project) return state;
      const before = findActiveComment(state.project.relations.comments, action.commentId);
      const oldRevision = before ? getCommentRevision(before) : -1;
      const comments = updateCommentBody(
        state.project.relations.comments ?? [],
        action.commentId,
        state.commentAuthorId,
        state.commentUsername,
        action.body,
      );
      const project = updateProjectComments(state.project, comments);
      const after = findActiveComment(comments, action.commentId);
      const newRevision = after ? getCommentRevision(after) : oldRevision;
      const commentReadState =
        after != null && newRevision > oldRevision
          ? authorReadStateForComment(
              state.commentReadState,
              state.commentUsername,
              action.commentId,
              newRevision,
            )
          : state.commentReadState;
      return { ...state, project, commentReadState };
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
      const commentReadState = pruneCommentReadState(state.commentReadState, removedIds);
      return {
        ...state,
        project,
        commentReadState,
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

    case 'SET_CONTENT_EDITOR_OPEN':
      return { ...state, contentEditorOpen: action.open };

    case 'CLEAR_APP_TOAST':
      if (action.id !== undefined && state.appToast?.id !== action.id) return state;
      return { ...state, appToast: null };

    default:
      return state;
  }
}
