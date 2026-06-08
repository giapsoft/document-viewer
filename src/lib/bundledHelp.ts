import type { LoadedProject, RelationsFile } from '../types';
import { assembleProject } from './loadProject';
import relationsJson from '../bundled-help/relations.json';
import groupsJson from '../bundled-help/groups.json';
import aboutPageRaw from '../bundled-help/docs/about.p?raw';
import guidePageRaw from '../bundled-help/docs/guide.p?raw';
import aboutOverviewMd from '../bundled-help/docs/about.overview.md?raw';
import guideFullMd from '../bundled-help/docs/guide.full.md?raw';

function parsePageJson(raw: string, fileName: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Built-in help page "${fileName}" is not valid JSON.`);
  }
}

export function loadBundledHelpProject(): LoadedProject {
  const relationsMeta = relationsJson as Omit<RelationsFile, 'groups' | 'comments'>;
  const groups = (groupsJson as string[][]) ?? [];

  const relations: RelationsFile = {
    pageNames: relationsMeta.pageNames ?? {},
    pageOrder: relationsMeta.pageOrder,
    pinnedPages: relationsMeta.pinnedPages,
    groups,
    comments: [],
  };

  const pageFiles = [
    { name: 'about.p', content: parsePageJson(aboutPageRaw, 'about.p') },
    { name: 'guide.p', content: parsePageJson(guidePageRaw, 'guide.p') },
  ];

  const mdFiles = [
    { componentId: 'about.overview', content: aboutOverviewMd },
    { componentId: 'guide.full', content: guideFullMd },
  ];

  const project = assembleProject({
    pageFiles,
    relations,
    stylesPartial: null,
    imageFiles: [],
    mdFiles,
  });

  return {
    ...project,
    source: 'local',
    remoteDocId: null,
    remoteTitle: null,
    folderHandle: null,
    remoteSync: null,
    remoteUpdatedAt: null,
    bundledHelp: true,
  };
}
