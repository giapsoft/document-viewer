const fs = require('fs');
const { marked } = require('marked');
const { JSDOM } = require('jsdom');

const comments = JSON.parse(fs.readFileSync('D:/Temp/alerts-2/comments.json', 'utf8'));

function findFencedCodeBlocks(source) {
  const blocks = [];
  const len = source.length;
  let i = 0, index = 0;
  while (i < len) {
    const lineEnd = source.indexOf('\n', i);
    const lineEndPos = lineEnd === -1 ? len : lineEnd;
    const line = source.slice(i, lineEndPos);
    const openMatch = line.match(/^( {0,3})(`{3,}|~{3,})(?:\s*[\w-]+)?\s*$/);
    if (openMatch) {
      const indent = openMatch[1];
      const fc = openMatch[2][0];
      const ml = openMatch[2].length;
      const contentStart = lineEndPos === len ? len : lineEndPos + 1;
      let j = contentStart, closed = false;
      while (j < len) {
        const cle = source.indexOf('\n', j);
        const clep = cle === -1 ? len : cle;
        const cl = source.slice(j, clep);
        const stripped = cl.startsWith(indent) ? cl.slice(indent.length) : cl;
        const re = new RegExp('^' + (fc === '`' ? '`' : '~') + '{' + ml + ',}\\s*$');
        if (re.test(stripped)) {
          blocks.push({ contentStart, contentEnd: j, index: index++ });
          closed = true;
          i = clep === len ? len : clep + 1;
          break;
        }
        j = clep === len ? len : clep + 1;
      }
      if (!closed) { blocks.push({ contentStart, contentEnd: len, index: index++ }); break; }
      continue;
    }
    i = lineEndPos === len ? len : lineEndPos + 1;
  }
  return blocks;
}

function buildFencedCodeByBlock(source, fencedBlocks, domFencedCodes) {
  const map = new Map();
  for (const block of fencedBlocks) {
    const blockText = source.slice(block.contentStart, block.contentEnd);
    const directMatch = domFencedCodes.find(el => {
      const t = el.textContent || '';
      return t === blockText || t === blockText + '\n' || t.trimEnd() === blockText.trimEnd();
    });
    if (directMatch) { map.set(block.contentStart, { el: directMatch, strippedIndent: 0 }); continue; }
    const lines = blockText.split('\n');
    const nonEmpty = lines.filter(l => l.trim().length > 0);
    if (nonEmpty.length > 0) {
      const ci = nonEmpty.reduce((min, l) => Math.min(min, (l.match(/^ */) || [''])[0].length), Infinity);
      if (ci > 0) {
        const deindented = lines.map(l => l.slice(ci)).join('\n');
        const indentMatch = domFencedCodes.find(el => {
          const t = el.textContent || '';
          return t === deindented || t === deindented + '\n' || t.trimEnd() === deindented.trimEnd();
        });
        if (indentMatch) map.set(block.contentStart, { el: indentMatch, strippedIndent: ci });
      }
    }
  }
  return map;
}

function adjustOffset(blockText, relOffset, strippedIndent) {
  if (strippedIndent === 0) return relOffset;
  const lines = blockText.split('\n');
  const mapping = new Int32Array(blockText.length + 1);
  let origPos = 0, deindPos = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    for (let ci = 0; ci < line.length; ci++) {
      mapping[origPos++] = deindPos;
      if (ci >= strippedIndent) deindPos++;
    }
    if (li < lines.length - 1) { mapping[origPos++] = deindPos++; }
  }
  mapping[origPos] = deindPos;
  return mapping[relOffset] ?? relOffset;
}

const testCases = [
  { file: 'D:/Temp/alerts-2/docs/be-tsd.tsd02.md', componentId: 'be-tsd.tsd02' },
  { file: 'D:/Temp/alerts-2/docs/app-tsd.tsd03.md', componentId: 'app-tsd.tsd03' },
];

for (const { file, componentId } of testCases) {
  console.log('\n===', componentId, '===');
  const source = fs.readFileSync(file, 'utf8');
  const anchors = comments.filter(c => c.anchor && c.anchor.componentId === componentId).map(c => c.anchor);
  const html = marked.parse(source);
  const dom = new JSDOM(`<div id="root">${html}</div>`);
  const root = dom.window.document.getElementById('root');
  const domFencedCodes = Array.from(root.querySelectorAll('pre > code'));
  const fencedBlocks = findFencedCodeBlocks(source);
  const fencedCodeByBlock = buildFencedCodeByBlock(source, fencedBlocks, domFencedCodes);

  console.log(`blocks=${fencedBlocks.length} domCodes=${domFencedCodes.length} mapped=${fencedCodeByBlock.size}`);

  for (const anchor of anchors) {
    const block = fencedBlocks.find(b => anchor.start >= b.contentStart && anchor.end <= b.contentEnd);
    if (!block) { console.log(`  "${anchor.excerpt}": prose path`); continue; }
    const entry = fencedCodeByBlock.get(block.contentStart);
    if (!entry) { console.log(`  "${anchor.excerpt}": NO DOM match!`); continue; }
    const relStart = anchor.start - block.contentStart;
    const relEnd = anchor.end - block.contentStart;
    const blockText = source.slice(block.contentStart, block.contentEnd);
    const adjStart = adjustOffset(blockText, relStart, entry.strippedIndent);
    const adjEnd = adjustOffset(blockText, relEnd, entry.strippedIndent);
    const domText = entry.el.textContent || '';
    const highlighted = domText.slice(adjStart, adjEnd);
    const ok = highlighted === anchor.excerpt;
    console.log(`  "${anchor.excerpt}": block[${block.index}] adj=${adjStart}..${adjEnd} -> "${highlighted}" ${ok ? '✓' : '✗ WRONG'}`);
  }
}
