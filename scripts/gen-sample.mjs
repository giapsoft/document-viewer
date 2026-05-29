import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function comp(id, type, status, content) {
  return { id, type, status, content };
}

function filler(prefix, count, start, status = 'done') {
  return Array.from({ length: count }, (_, i) => {
    const n = String(start + i).padStart(2, '0');
    return comp(
      `${prefix}-f${n}`,
      'body',
      status,
      `[${prefix.toUpperCase()} ${n}] Filler — extends the page to test scrollbar markers.\nSecond line adds block height.`,
    );
  });
}

const intro = [
  comp('h1', 'header', 'done', 'Introduction'),
  comp('t1', 'title', 'done', 'Document Viewer project overview'),
  comp('notes', 'md', 'done', ''),
  comp('i-intro', 'img', 'done', 'overview.png'),
  ...filler('intro', 8, 1),
  comp('b1', 'body', 'done', '★ HUB b1 — trace to 2lists-bridge (detail), b4 (appendix), b6 (detail page)'),
  ...filler('intro', 6, 9),
  comp(
    'mega5',
    'body',
    'working',
    '★ HUB mega5 — 5 pages: intro, detail, integration, workflow, reference (exceeds 3-panel limit)',
  ),
  ...filler('intro', 6, 15),
  comp(
    'chain-a',
    'body',
    'done',
    '★ CHAIN chain-a — start of 5-page chain (intro → detail → appendix → specs → integration)',
  ),
  ...filler('intro', 6, 21),
  comp('l1', 'listItem', 'working', 'List item linked to l10 on specs.p'),
  comp('l2', 'listItem', 'pending', 'Standalone list item'),
  ...filler('intro', 8, 27),
  ...filler('intro', 10, 35),
  comp('t2', 'title', 'done', 'End of intro section'),
  comp('b-intro-end', 'body', 'done', 'Last component on intro.p'),
];

const detail = [
  comp('h2', 'header', 'done', 'Details'),
  ...filler('detail', 10, 1),
  comp(
    '2lists-bridge',
    'body',
    'working',
    '★ 2 LISTS — bridge node (in group A with b1,b4,b6 AND group B with b3,b7,b8,b9)',
  ),
  ...filler('detail', 6, 11),
  comp('m-detail', 'body', 'done', '★ mega5 spoke — detail page node'),
  ...filler('detail', 6, 17),
  comp('chain-b', 'body', 'working', '★ CHAIN chain-b — detail step (page 2 of 5)'),
  ...filler('detail', 6, 23),
  comp('i1', 'img', 'done', 'diagram.png'),
  ...filler('detail', 8, 29),
  comp('b6', 'body', 'done', '★ b6 — linked to b1 and 2lists-bridge (same page)'),
  ...filler('detail', 8, 37),
  comp('b3', 'body', 'done', 'b3 linked to b7 on appendix.p'),
  ...filler('detail', 10, 45),
  comp('b-detail-end', 'body', 'blocked', 'End of detail.p'),
];

const appendix = [
  comp('h3', 'header', 'blocked', 'Appendix'),
  ...filler('appendix', 12, 1),
  comp('b4', 'body', 'pending', '★ b4 — linked to b1 and b9'),
  comp('i-app', 'img', 'done', 'architecture.jpg'),
  ...filler('appendix', 8, 13),
  comp('chain-c', 'body', 'done', '★ CHAIN chain-c — appendix step (page 3 of 5)'),
  ...filler('appendix', 8, 21),
  comp('b7', 'body', 'working', '★ b7 — linked to 2lists-bridge, b9; referenced by b3'),
  ...filler('appendix', 10, 29),
  comp('b9', 'body', 'done', '★ b9 — linked to b4 and b7'),
  ...filler('appendix', 8, 39),
  comp('b5', 'body', 'done', 'Standalone component — click shows only the appendix panel'),
  ...filler('appendix', 8, 47),
  comp('b-appendix-end', 'body', 'pending', 'End of appendix.p'),
];

const specs = [
  comp('h4', 'header', 'done', 'Technical specification'),
  ...filler('specs', 12, 1),
  comp(
    'specs-hub',
    'body',
    'working',
    '★ HUB specs-hub — 4 pages: specs, integration, workflow, reference',
  ),
  ...filler('specs', 6, 13),
  comp('chain-d', 'body', 'pending', '★ CHAIN chain-d — specs step (page 4 of 5)'),
  ...filler('specs', 6, 19),
  comp('b8', 'body', 'working', '★ b8 — linked to 2lists-bridge on detail.p'),
  ...filler('specs', 8, 25),
  comp('l10', 'listItem', 'done', '★ l10 — linked to l1 on intro.p'),
  comp('i-specs', 'img', 'working', 'diagram.png'),
  ...filler('specs', 10, 33),
  comp('b10', 'body', 'pending', 'Standalone component on specs.p'),
  ...filler('specs', 8, 43),
  comp('b-specs-end', 'body', 'done', 'End of specs.p'),
];

const integration = [
  comp('h5', 'header', 'done', 'Integration'),
  ...filler('integration', 10, 1),
  comp('m-integration', 'body', 'working', '★ mega5 spoke — integration page node'),
  ...filler('integration', 6, 11),
  comp('q-integration', 'body', 'done', '★ specs-hub spoke — integration page node'),
  ...filler('integration', 6, 17),
  comp('chain-e', 'body', 'done', '★ CHAIN chain-e — integration step (page 5 of 5)'),
  ...filler('integration', 10, 23),
  comp('i-integration', 'img', 'done', 'diagram.png'),
  ...filler('integration', 10, 33),
  comp('b-integration-end', 'body', 'done', 'End of integration.p'),
];

const workflow = [
  comp('h6', 'header', 'done', 'Workflow'),
  ...filler('workflow', 12, 1),
  comp('m-workflow', 'body', 'pending', '★ mega5 spoke — workflow page node'),
  ...filler('workflow', 8, 13),
  comp('q-workflow', 'body', 'working', '★ specs-hub spoke — workflow page node'),
  ...filler('workflow', 10, 21),
  comp('wf-note', 'body', 'undefined', 'Workflow notes — standalone block for panel tests'),
  ...filler('workflow', 10, 31),
  comp('b-workflow-end', 'body', 'done', 'End of workflow.p'),
];

const reference = [
  comp('h7', 'header', 'done', 'Reference'),
  ...filler('reference', 10, 1),
  comp('m-reference', 'body', 'done', '★ mega5 spoke — reference page node'),
  ...filler('reference', 8, 11),
  comp('q-reference', 'body', 'blocked', '★ specs-hub spoke — reference page node'),
  ...filler('reference', 10, 19),
  comp('ref-table', 'listItem', 'done', 'Reference list item — no cross-page links'),
  ...filler('reference', 10, 29),
  comp('b-reference-end', 'body', 'pending', 'End of reference.p'),
];

const changelog = [
  comp('h8', 'header', 'done', 'Changelog'),
  ...filler('changelog', 12, 1),
  comp('m-changelog', 'body', 'done', 'Standalone changelog note — not part of mega5 (extra sidebar page)'),
  ...filler('changelog', 8, 13),
  comp('cl-v1', 'body', 'done', 'v0.1 — initial sample data'),
  comp('cl-v2', 'body', 'working', 'v0.2 — added multi-page link test clusters'),
  ...filler('changelog', 10, 21),
  comp('b-changelog-end', 'body', 'done', 'End of changelog.p — extra page for sidebar list'),
];

const pages = {
  'intro.p': intro,
  'detail.p': detail,
  'appendix.p': appendix,
  'specs.p': specs,
  'integration.p': integration,
  'workflow.p': workflow,
  'reference.p': reference,
  'changelog.p': changelog,
};

const localToPage = new Map();
for (const [fileName, components] of Object.entries(pages)) {
  const pageId = fileName.replace(/\.p$/i, '');
  for (const c of components) {
    localToPage.set(c.id, pageId);
  }
}

function q(localId) {
  const pageId = localToPage.get(localId);
  if (!pageId) throw new Error(`Unknown component id: ${localId}`);
  return `${pageId}.${localId}`;
}

const relations = {
  pageNames: {},
  groups: [
    [q('b1'), q('2lists-bridge'), q('b4'), q('b6'), q('i-intro')],
    [q('2lists-bridge'), q('b3'), q('b7'), q('b8'), q('b9')],
    [q('l1'), q('l10')],
    [q('mega5'), q('m-detail'), q('m-integration'), q('m-workflow'), q('m-reference')],
    [q('chain-a'), q('chain-b'), q('chain-c'), q('chain-d'), q('chain-e')],
    [q('specs-hub'), q('q-integration'), q('q-workflow'), q('q-reference')],
  ],
};

const targets = [
  join(root, 'public/sample-data/docs'),
  join(root, 'sample-data/docs'),
];

const introNotesMd = `# Markdown notes

This is a **markdown** component (\`type: md\`).

- Sidecar file: \`intro.notes.md\`
- Body is **not** stored in \`.p\` \`content\`

## Code example

\`\`\`text
echo "Hello from markdown"
\`\`\`
`;

for (const dir of targets) {
  mkdirSync(dir, { recursive: true });
  for (const [fileName, components] of Object.entries(pages)) {
    writeFileSync(join(dir, fileName), JSON.stringify(components, null, 2) + '\n');
  }
  writeFileSync(join(dir, 'intro.notes.md'), introNotesMd);
}

for (const base of [join(root, 'public/sample-data'), join(root, 'sample-data')]) {
  writeFileSync(join(base, 'relations.json'), JSON.stringify(relations, null, 2) + '\n');
}

console.log('Generated sample data (global ids in groups, local ids in .p files)');
