import type { AppState, LoadedProject, PageData, RelationsFile } from '../types';
import { rebuildProject } from './projectMutations';
import { createComponentId, resolvePageId, resolvePageName } from './pageIds';
import { buildPanelsForPageContext, refreshPanelsWithPins, removePinnedPage } from './pagePins';
import { getOrphanedPageAssets } from './pageAssetCleanup';

const PAGE_FILE_RE = /^[a-z0-9][a-z0-9._-]*\.p$/i;

export function normalizePageFileName(input: string): string | null {
  let name = input.trim().replace(/[<>:"|?*\x00-\x1f]/g, '-');
  if (!name) return null;
  if (!/\.p$/i.test(name)) {
    name = `${name}.p`;
  }
  if (!PAGE_FILE_RE.test(name)) return null;
  return name;
}

export function suggestNewPageFileName(existingFiles: string[]): string {
  let n = 1;
  while (existingFiles.includes(`page-${n}.p`)) n += 1;
  return `page-${n}.p`;
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

function removeIdsFromGroups(groups: string[][], ids: Set<string>): string[][] {
  return groups
    .map((group) => group.filter((id) => !ids.has(id)))
    .filter((group) => group.length > 0);
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
): LoadedProject | null {
  if (project.pages.some((p) => p.fileName === fileName)) return null;

  const page = createDefaultPageData(fileName, project.relations.pageNames);
  const pages = [...project.pages, page].sort((a, b) => a.fileName.localeCompare(b.fileName));

  return rebuildProject({ ...project, pages });
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
  const groups = removeIdsFromGroups(project.relations.groups, removedIds);
  const pinnedPages = removePinnedPage(project.relations.pinnedPages, fileName);

  return rebuildProject({
    ...project,
    pages,
    relations: { ...project.relations, pageNames, groups, pinnedPages },
    mdFiles,
    imageUrls,
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

export function applyCreatePageState(state: AppState, fileName: string): AppState {
  if (!state.project) return state;
  const project = createPageInProject(state.project, fileName);
  if (!project) return state;

  const nextState: AppState = {
    ...state,
    project,
    currentPage: fileName,
    selection: state.linkMode ? state.selection : null,
    panels: [{ pageFile: fileName, expanded: true }],
  };
  const panels = buildPanelsForPageContext(nextState, fileName);
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

  const refreshed = refreshPanelsWithPins(nextState);
  if (refreshed) {
    nextState = { ...nextState, panels: refreshed };
  }

  return nextState;
}
