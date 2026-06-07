import type { Component, DocComment, LoadedProject } from '../types';
import { createInitialActionContent } from './actionComponent';
import { removeCommentsForComponent } from './comments';
import { removeMemberIdsFromGroups } from './groupRelations';
import { buildIndex } from './index';
import { createComponentId } from './pageIds';

export function rebuildProject(project: LoadedProject): LoadedProject {
  const { index, warnings } = buildIndex(project.pages, project.relations);
  return {
    ...project,
    index,
    warnings: [...warnings],
  };
}

/** Comment edits do not affect the project index — avoid a full rebuild. */
export function updateProjectComments(
  project: LoadedProject,
  comments: DocComment[],
): LoadedProject {
  return {
    ...project,
    relations: { ...project.relations, comments },
  };
}

export function createDefaultComponent(pageId: string, components: Component[]): Component {
  return {
    id: createComponentId(pageId, components),
    type: 'body',
    status: 'undefined',
    content: '',
  };
}

export function updateComponentInProject(
  project: LoadedProject,
  pageFile: string,
  componentId: string,
  patch: Partial<Omit<Component, 'id'>>,
): { project: LoadedProject; newComponentId: string } {
  const page = project.pages.find((p) => p.fileName === pageFile);
  const existing = page?.components.find((c) => c.id === componentId);

  let mdFiles = project.mdFiles;
  if (existing && patch.type !== undefined && patch.type !== existing.type) {
    mdFiles = new Map(project.mdFiles);
    if (existing.type === 'md' && patch.type !== 'md') {
      mdFiles.delete(componentId);
    } else if (patch.type === 'md' && existing.type !== 'md') {
      mdFiles.set(componentId, mdFiles.get(componentId) ?? '');
    }
  }

  const pages = project.pages.map((page) => {
    if (page.fileName !== pageFile) return page;
    return {
      ...page,
      components: page.components.map((c) => {
        if (c.id !== componentId) return c;
        const next = { ...c, ...patch };
        if (next.type === 'md') {
          next.content = '';
        } else if (patch.type === 'action' && c.type !== 'action') {
          next.content = createInitialActionContent();
        } else if (patch.type !== undefined && c.type === 'action' && patch.type !== 'action') {
          next.content = '';
        }
        return next;
      }),
    };
  });

  return {
    project: rebuildProject({ ...project, pages, mdFiles }),
    newComponentId: componentId,
  };
}

export function insertComponentRelative(
  project: LoadedProject,
  pageFile: string,
  anchorComponentId: string,
  position: 'above' | 'below',
  component?: Partial<Omit<Component, 'id'>>,
): { project: LoadedProject; newComponent: Component } {
  const page = project.pages.find((p) => p.fileName === pageFile);
  const newComponent: Component = {
    ...createDefaultComponent(page?.pageId ?? 'page', page?.components ?? []),
    ...component,
  };

  const pages = project.pages.map((p) => {
    if (p.fileName !== pageFile) return p;
    const index = p.components.findIndex((c) => c.id === anchorComponentId);
    if (index < 0) return p;

    const insertAt = position === 'above' ? index : index + 1;
    const components = [...p.components];
    components.splice(insertAt, 0, newComponent);
    return { ...p, components };
  });

  return {
    project: rebuildProject({ ...project, pages }),
    newComponent,
  };
}

export function appendImageComponent(
  project: LoadedProject,
  pageFile: string,
  filename: string,
): { project: LoadedProject; newComponent: Component } {
  const page = project.pages.find((p) => p.fileName === pageFile);
  if (!page) {
    throw new Error(`Page not found: ${pageFile}`);
  }

  const newComponent: Component = {
    ...createDefaultComponent(page.pageId, page.components),
    type: 'img',
    content: filename,
  };

  const pages = project.pages.map((p) => {
    if (p.fileName !== pageFile) return p;
    return { ...p, components: [...p.components, newComponent] };
  });

  return {
    project: rebuildProject({ ...project, pages }),
    newComponent,
  };
}

export function deleteComponentFromProject(
  project: LoadedProject,
  pageFile: string,
  componentId: string,
): LoadedProject | null {
  const page = project.pages.find((p) => p.fileName === pageFile);
  if (!page) return null;
  if (page.components.length <= 1) return null;

  const doomed = page.components.find((c) => c.id === componentId);

  let pages = project.pages.map((p) => {
    if (p.fileName !== pageFile) return p;
    return {
      ...p,
      components: p.components.filter((c) => c.id !== componentId),
    };
  });

  const groups = removeMemberIdsFromGroups(project.relations.groups, [componentId]);
  const comments = removeCommentsForComponent(
    project.relations.comments ?? [],
    componentId,
  );

  const mdFiles = new Map(project.mdFiles);
  if (doomed?.type === 'md') {
    mdFiles.delete(componentId);
  }

  return rebuildProject({
    ...project,
    pages,
    relations: { ...project.relations, groups, comments },
    mdFiles,
  });
}

export function findComponent(
  project: LoadedProject,
  componentId: string,
): { pageFile: string; component: Component } | null {
  const pageFile = project.index.componentToPage.get(componentId);
  if (!pageFile) return null;
  const page = project.pages.find((p) => p.fileName === pageFile);
  const component = page?.components.find((c) => c.id === componentId);
  if (!component) return null;
  return { pageFile, component };
}
