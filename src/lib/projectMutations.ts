import type { Component, LoadedProject } from '../types';
import { buildIndex } from './index';

export function rebuildProject(project: LoadedProject): LoadedProject {
  const { index, warnings } = buildIndex(project.pages, project.relations);
  return {
    ...project,
    index,
    warnings: [...warnings],
  };
}

export function createDefaultComponent(suffix = Date.now()): Component {
  return {
    id: `new-${suffix}`,
    type: 'body',
    status: 'undefined',
    content: '',
  };
}

export function updateComponentInProject(
  project: LoadedProject,
  pageFile: string,
  componentId: string,
  patch: Partial<Component>,
): { project: LoadedProject; newComponentId: string } {
  const pages = project.pages.map((page) => {
    if (page.fileName !== pageFile) return page;
    return {
      ...page,
      components: page.components.map((c) =>
        c.id === componentId ? { ...c, ...patch, id: patch.id?.trim() || c.id } : c,
      ),
    };
  });

  const newComponentId = patch.id?.trim() || componentId;
  return { project: rebuildProject({ ...project, pages }), newComponentId };
}

export function insertComponentRelative(
  project: LoadedProject,
  pageFile: string,
  anchorComponentId: string,
  position: 'above' | 'below',
  component?: Partial<Component>,
): { project: LoadedProject; newComponent: Component } {
  const newComponent: Component = {
    ...createDefaultComponent(),
    ...component,
    id: component?.id?.trim() || createDefaultComponent().id,
  };

  const pages = project.pages.map((page) => {
    if (page.fileName !== pageFile) return page;
    const index = page.components.findIndex((c) => c.id === anchorComponentId);
    if (index < 0) return page;

    const insertAt = position === 'above' ? index : index + 1;
    const components = [...page.components];
    components.splice(insertAt, 0, newComponent);
    return { ...page, components };
  });

  return {
    project: rebuildProject({ ...project, pages }),
    newComponent,
  };
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
