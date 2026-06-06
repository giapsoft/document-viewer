import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const DEFAULT_RELATIONS =
  'D:\\giapsoft\\gits\\xfarm-app-flutter-2\\.documents\\alerts\\tree\\relations.json';

function getPageIdPrefix(componentId) {
  const dot = componentId.indexOf('.');
  return dot >= 0 ? componentId.slice(0, dot) : componentId;
}

function canBridgeAsLink(componentId, selectedId) {
  if (componentId === selectedId) return true;
  return getPageIdPrefix(componentId) !== getPageIdPrefix(selectedId);
}

function shouldIncludeInLinks(componentId, selectedId) {
  if (componentId === selectedId) return true;
  return getPageIdPrefix(componentId) !== getPageIdPrefix(selectedId);
}

function pageHasLinkedMembers(page, memberOrder) {
  return memberOrder.some((id) => getPageIdPrefix(id) === page);
}

function countGroupMembersOnPageInLinks(group, page, links, selectedId) {
  return group.filter(
    (member) =>
      getPageIdPrefix(member) === page &&
      (links.has(member) || member === selectedId),
  ).length;
}

/**
 * Same algorithm as src/lib/index.ts → getLinkedComponentIds
 */
function getLinkedComponentIds(selectedId, groups, excludes = []) {
  const excludeSet = new Set(excludes);
  const selectedPage = getPageIdPrefix(selectedId);
  const remaining = groups.map((group) => [...group]);
  const links = new Set();
  const memberOrder = [];
  const lockedPages = new Set();
  const phase1Pages = new Set();
  const firstHopPages = new Map();

  const canUseAsBridge = (id) =>
    links.has(id) && canBridgeAsLink(id, selectedId);

  const recordFirstHop = (page, anchorPage) => {
    const hops = firstHopPages.get(page) ?? new Set();
    hops.add(anchorPage);
    firstHopPages.set(page, hops);
  };

  const canExpandToPage = (page, anchorPage) => {
    if (!pageHasLinkedMembers(page, memberOrder)) return true;
    if (phase1Pages.has(page)) return false;
    if (phase1Pages.has(anchorPage)) return true;

    const hops = firstHopPages.get(page);
    if (!hops) return true;
    return hops.has(anchorPage);
  };

  const pickAnchor = (memberId, group, anchors, touchedInMerge) => {
    const page = getPageIdPrefix(memberId);
    const crossPageAnchors = anchors.filter(
      (anchor) => getPageIdPrefix(anchor) !== page,
    );
    if (crossPageAnchors.length > 0) return crossPageAnchors[0];

    if (
      !pageHasLinkedMembers(page, memberOrder) &&
      !touchedInMerge.has(page) &&
      countGroupMembersOnPageInLinks(group, page, links, selectedId) === 1
    ) {
      return anchors.find((anchor) => getPageIdPrefix(anchor) === page) ?? null;
    }

    return null;
  };

  const mergeGroup = (group, phase1) => {
    const anchors = phase1
      ? []
      : group.filter(
          (id) =>
            (links.has(id) || id === selectedId) &&
            canBridgeAsLink(id, selectedId),
        );
    if (!phase1 && anchors.length === 0) return;

    const touchedInMerge = new Set();

    for (const id of group) {
      if (excludeSet.has(id) || links.has(id)) continue;
      if (!shouldIncludeInLinks(id, selectedId)) continue;

      const page = getPageIdPrefix(id);
      if (lockedPages.has(page)) continue;

      if (phase1) {
        links.add(id);
        memberOrder.push(id);
        phase1Pages.add(page);
        continue;
      }

      const anchor = pickAnchor(id, group, anchors, touchedInMerge);
      if (!anchor) continue;

      const anchorPage = getPageIdPrefix(anchor);
      if (!canExpandToPage(page, anchorPage)) continue;

      const wasEmpty =
        !pageHasLinkedMembers(page, memberOrder) && !touchedInMerge.has(page);
      links.add(id);
      memberOrder.push(id);
      if (wasEmpty) recordFirstHop(page, anchorPage);
      touchedInMerge.add(page);
    }
  };

  const lockPagesAfterPhase1 = () => {
    lockedPages.add(selectedPage);
    for (const page of phase1Pages) {
      const count = memberOrder.filter((id) => getPageIdPrefix(id) === page).length;
      if (count > 1) lockedPages.add(page);
    }
  };

  for (let i = remaining.length - 1; i >= 0; i--) {
    const current = remaining[i];
    if (!current.includes(selectedId)) continue;
    mergeGroup(current, true);
    remaining.splice(i, 1);
  }

  lockPagesAfterPhase1();

  while (remaining.length > 0) {
    let found = false;

    for (let i = remaining.length - 1; i >= 0; i--) {
      const current = remaining[i];
      if (!current.some((id) => canUseAsBridge(id))) continue;
      mergeGroup(current, false);
      remaining.splice(i, 1);
      found = true;
    }

    if (!found) break;
  }

  return { links, memberOrder };
}

function printResult(selectedId, groups) {
  const { links, memberOrder } = getLinkedComponentIds(selectedId, groups);

  console.log(`\nSelected: ${selectedId}`);
  console.log(`Linked count: ${links.size}`);
  console.log('Linked component IDs (discovery order):');
  for (const id of memberOrder) {
    console.log(`  ${id}`);
  }
  console.log('');
}

function loadRelations(relationsPath) {
  const raw = readFileSync(relationsPath, 'utf8');
  const relations = JSON.parse(raw);
  if (!Array.isArray(relations.groups)) {
    throw new Error('relations.json must have a "groups" array');
  }
  return relations.groups;
}

function runInteractive(groups, relationsPath) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log(`Relations file: ${relationsPath}`);
  console.log(`Groups: ${groups.length}`);
  console.log('Enter a component ID to find linked components (empty line to quit).\n');

  const ask = () => {
    rl.question('Selected component ID> ', (line) => {
      const selected = line.trim();
      if (!selected) {
        rl.close();
        return;
      }
      printResult(selected, groups);
      ask();
    });
  };

  ask();
}

const relationsPath = process.argv[2] ?? DEFAULT_RELATIONS;
const selectedArg = process.argv[3];

let groups;
try {
  groups = loadRelations(relationsPath);
} catch (err) {
  console.error(`Failed to load relations: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

if (selectedArg) {
  printResult(selectedArg, groups);
} else {
  runInteractive(groups, relationsPath);
}
