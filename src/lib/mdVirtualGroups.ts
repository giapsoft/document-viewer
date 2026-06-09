import { marked, type Token, type Tokens } from 'marked';
import type { LoadedProject, PageData, ProjectIndex } from '../types';
import { getGroupIndicesForComponent } from './groupRelations';
import { resolveMarkdownComponentLink } from './mdComponentLinks';

function collectLinkHrefs(tokens: Token[], hrefs: string[]): void {
  for (const token of tokens) {
    if (token.type === 'link') {
      hrefs.push((token as Tokens.Link).href);
    }
    const nested = (token as { tokens?: Token[] }).tokens;
    if (nested?.length) {
      collectLinkHrefs(nested, hrefs);
    }
  }
}

/** Resolve in-app component ids linked from a markdown body. */
export function extractMarkdownComponentLinks(
  mdSource: string,
  sourcePageFile: string,
  project: Pick<LoadedProject, 'index'>,
): string[] {
  if (!mdSource.trim()) return [];

  const hrefs: string[] = [];
  const tokens = marked.lexer(mdSource);
  collectLinkHrefs(tokens, hrefs);

  const linked: string[] = [];
  const seen = new Set<string>();
  for (const href of hrefs) {
    const componentId = resolveMarkdownComponentLink(
      href,
      sourcePageFile,
      project as LoadedProject,
    );
    if (!componentId || seen.has(componentId)) continue;
    seen.add(componentId);
    linked.push(componentId);
  }
  return linked;
}

/** Display-only groups: each md component plus components it links to in its body. */
export function buildMdVirtualGroups(
  project: Pick<LoadedProject, 'pages' | 'mdFiles' | 'index'>,
): string[][] {
  const virtual: string[][] = [];

  for (const page of project.pages) {
    for (const component of page.components) {
      if (component.type !== 'md') continue;

      const mdSource = project.mdFiles.get(component.id) ?? '';
      const links = extractMarkdownComponentLinks(mdSource, page.fileName, project);
      if (links.length === 0) continue;

      const members = [component.id];
      for (const linkId of links) {
        if (linkId !== component.id) {
          members.push(linkId);
        }
      }

      if (members.length >= 2) {
        virtual.push(members);
      }
    }
  }

  return virtual;
}

export function getDisplayGroups(index: ProjectIndex): string[][] {
  return index.displayGroups ?? index.groups;
}

/** Persisted groups from groups.json — excludes md virtual groups. */
export function getPersistedGroups(index: ProjectIndex): string[][] {
  return index.groups;
}

export function getPersistedGroupIndicesForComponent(
  index: ProjectIndex,
  componentId: string,
): number[] {
  return getGroupIndicesForComponent(index.groups, componentId);
}

export function getDirectDisplayGroupMemberIds(
  index: ProjectIndex,
  componentId: string,
): Set<string> {
  const ids = new Set<string>();
  for (const group of getDisplayGroups(index)) {
    if (!group.includes(componentId)) continue;
    for (const memberId of group) {
      if (memberId !== componentId) ids.add(memberId);
    }
  }
  return ids;
}

export function isVirtualGroupIndex(index: ProjectIndex, groupIndex: number): boolean {
  return groupIndex >= index.persistedGroupCount;
}

function buildComponentToDisplayGroups(displayGroups: string[][]): Map<string, number[]> {
  const componentToDisplayGroups = new Map<string, number[]>();
  displayGroups.forEach((group, groupIndex) => {
    const seenInGroup = new Set<string>();
    for (const id of group) {
      if (seenInGroup.has(id)) continue;
      seenInGroup.add(id);
      const existing = componentToDisplayGroups.get(id) ?? [];
      existing.push(groupIndex);
      componentToDisplayGroups.set(id, existing);
    }
  });
  return componentToDisplayGroups;
}

export function attachDisplayGroupsToIndex(
  index: ProjectIndex,
  mdVirtualGroups: string[][],
): ProjectIndex {
  const persistedGroupCount = index.groups.length;
  const displayGroups = [...index.groups, ...mdVirtualGroups];

  return {
    ...index,
    displayGroups,
    persistedGroupCount,
    componentToDisplayGroups: buildComponentToDisplayGroups(displayGroups),
  };
}

export function rebuildIndexWithMdVirtualGroups(
  pages: PageData[],
  project: Pick<LoadedProject, 'pages' | 'mdFiles' | 'index'>,
  baseIndex: ProjectIndex,
): ProjectIndex {
  const withPages = { ...project, pages, index: baseIndex };
  const mdVirtualGroups = buildMdVirtualGroups(withPages as LoadedProject);
  return attachDisplayGroupsToIndex(baseIndex, mdVirtualGroups);
}
