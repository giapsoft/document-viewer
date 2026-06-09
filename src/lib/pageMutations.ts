import type { AppState, LoadedProject, PageData, RelationsFile } from '../types';
import { removeMemberIdsFromGroups } from './groupRelations';
import {
  appendPageToOrder,
  getStoredPageOrder,
  removePageFromOrder,
  sortPagesByOrder,
} from './pageOrder';
import { rebuildProject } from './projectMutations';
import { castPageId, createComponentId, resolvePageId, resolvePageName } from './pageIds';
import { addPageToPanels } from './pagePanels';
import { getOrphanedPageAssets } from './pageFileOps';

function uniquePageFileName(baseId: string, existingFiles: Iterable<string>): string {
  const taken = new Set(existingFiles);
  let pageId = baseId;
  let n = 2;
  while (taken.has(`${pageId}.p`)) {
    pageId = `${baseId}${n}`;
    n += 1;
  }
  return `${pageId}.p`;
}

/** Map a free-form page name to disk file + display label. */
export function resolveNewPageFromName(
  input: string,
  existingFiles: string[],
): { fileName: string; pageName: string } | null {
  if (!input.trim()) return null;

  const pageName = input;
  let baseId = castPageId(pageName);
  if (!baseId) baseId = 'page';

  const fileName = uniquePageFileName(baseId, existingFiles);
  return { fileName, pageName };
}

export function suggestNewPageName(existingFiles: string[]): string {
  let n = 1;
  while (n < 10_000) {
    const pageName = `Page ${n}`;
    const resolved = resolveNewPageFromName(pageName, existingFiles);
    if (resolved && !existingFiles.includes(resolved.fileName)) return pageName;
    n += 1;
  }
  return 'New page';
}

export { normalizePageName } from './pageIds';

export function createDefaultPageData(
  fileName: string,
  pageNames: RelationsFile['pageNames'],
): PageData {
  const pageId = resolvePageId(fileName);
  const pageName = resolvePageName(fileName, pageNames);
  const components = [
    {
      id: createComponentId(pageId, []),
      type: 'header' as const,
      status: 'undefined' as const,
      content: 'New page',
    },
  ];
  return { fileName, pageId, pageName, components };
}

function collectComponentIdsOnPage(page: PageData): Set<string> {
  return new Set(page.components.map((c) => c.id));
}

export function renamePageNameInProject(
  project: LoadedProject,
  fileName: string,
  newPageName: string,
): LoadedProject | null {
  const page = project.pages.find((p) => p.fileName === fileName);
  if (!page) return null;

  const pageNames = { ...(project.relations.pageNames ?? {}) };
  const defaultName = resolvePageId(fileName);
  if (newPageName === defaultName) {
    delete pageNames[fileName];
  } else {
    pageNames[fileName] = newPageName;
  }

  const pages = project.pages.map((p) =>
    p.fileName === fileName ? { ...p, pageName: newPageName } : p,
  );

  return rebuildProject({
    ...project,
    pages,
    relations: { ...project.relations, pageNames },
  });
}

export function createPageInProject(
  project: LoadedProject,
  fileName: string,
  displayPageName?: string,
): LoadedProject | null {
  if (project.pages.some((p) => p.fileName === fileName)) return null;

  const pageNames = { ...(project.relations.pageNames ?? {}) };
  const pageId = resolvePageId(fileName);
  const trimmedDisplay = displayPageName?.trim();
  if (trimmedDisplay && trimmedDisplay !== pageId) {
    pageNames[fileName] = displayPageName!;
  }

  const page = createDefaultPageData(fileName, pageNames);
  const pageOrder = appendPageToOrder(
    getStoredPageOrder(
      project.relations,
      project.pages.map((p) => p.fileName),
    ),
    fileName,
  );
  const pages = sortPagesByOrder([...project.pages, page], pageOrder);

  return rebuildProject({
    ...project,
    pages,
    relations: { ...project.relations, pageNames, pageOrder },
  });
}

export function deletePageFromProject(
  project: LoadedProject,
  fileName: string,
): LoadedProject | null {
  if (project.pages.length <= 1) return null;

  const page = project.pages.find((p) => p.fileName === fileName);
  if (!page) return null;

  const removedIds = collectComponentIdsOnPage(page);
  const remainingPages = project.pages.filter((p) => p.fileName !== fileName);
  const orphaned = getOrphanedPageAssets(page, remainingPages);

  const pageNames = { ...(project.relations.pageNames ?? {}) };
  delete pageNames[fileName];

  const mdFiles = new Map(project.mdFiles);
  for (const componentId of orphaned.mdComponentIds) {
    mdFiles.delete(componentId);
  }

  const imageUrls = new Map(project.imageUrls);
  for (const imageName of orphaned.imageFilenames) {
    const url = imageUrls.get(imageName);
    if (url) URL.revokeObjectURL(url);
    imageUrls.delete(imageName);
  }

  const pages = remainingPages;
  const groups = removeMemberIdsFromGroups(project.relations.groups, removedIds);
  const pageOrder = removePageFromOrder(
    getStoredPageOrder(
      project.relations,
      remainingPages.map((p) => p.fileName),
    ),
    fileName,
  );

  return rebuildProject({
    ...project,
    pages: sortPagesByOrder(pages, pageOrder),
    relations: { ...project.relations, pageNames, groups, pageOrder },
    mdFiles,
    imageUrls,
  });
}

export function reorderPagesInProject(
  project: LoadedProject,
  orderedPageFiles: string[],
): LoadedProject | null {
  const valid = new Set(project.pages.map((p) => p.fileName));
  if (
    orderedPageFiles.length !== valid.size ||
    !orderedPageFiles.every((fileName) => valid.has(fileName))
  ) {
    return null;
  }

  const pageOrder = [...orderedPageFiles];
  const pages = sortPagesByOrder(project.pages, pageOrder);

  return rebuildProject({
    ...project,
    pages,
    relations: { ...project.relations, pageOrder },
  });
}

export function applyRenamePageState(
  state: AppState,
  fileName: string,
  newPageName: string,
): AppState {
  if (!state.project) return state;
  const project = renamePageNameInProject(state.project, fileName, newPageName);
  if (!project) return state;
  return { ...state, project };
}

export function applyCreatePageState(
  state: AppState,
  fileName: string,
  pageName?: string,
): AppState {
  if (!state.project) return state;
  const project = createPageInProject(state.project, fileName, pageName);
  if (!project) return state;

  const nextState: AppState = {
    ...state,
    project,
    currentPage: fileName,
    selection: state.linkMode ? state.selection : null,
    panels: state.panels,
  };
  const panels = addPageToPanels(nextState.panels, fileName, state.maxOpenPages);
  return { ...nextState, panels };
}

export function applyDeletePageState(state: AppState, fileName: string): AppState {
  if (!state.project) return state;
  const doomed = state.project.pages.find((p) => p.fileName === fileName);
  const removedIds = doomed ? collectComponentIdsOnPage(doomed) : new Set<string>();

  const project = deletePageFromProject(state.project, fileName);
  if (!project) return state;

  const panels = state.panels.filter((p) => p.pageFile !== fileName);
  const selectionHistory = state.selectionHistory.filter((e) => e.pageFile !== fileName);

  let currentPage = state.currentPage;
  if (currentPage === fileName) {
    currentPage = project.pages[0]?.fileName ?? null;
  }

  let selection = state.selection;
  if (selection && removedIds.has(selection.componentId)) {
    selection = null;
  }

  let nextState: AppState = {
    ...state,
    project,
    panels,
    currentPage,
    selection: state.linkMode ? selection : null,
    selectionHistory,
  };

  if (currentPage && !panels.some((p) => p.pageFile === currentPage)) {
    nextState = {
      ...nextState,
      panels: [{ pageFile: currentPage, expanded: true }],
    };
  }

  return nextState;
}
