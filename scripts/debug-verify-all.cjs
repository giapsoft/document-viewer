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
    let match = domFencedCodes.find(el => {
      const t = el.textContent || '';
      return t === blockText || t === blockText + '\n' || t.trimEnd() === blockText.trimEnd();
    });
    if (!match) {
      // Try de-indenting
      const lines = blockText.split('\n');
      const nonEmpty = lines.filter(l => l.trim().length > 0);
      if (nonEmpty.length > 0) {
        const commonIndent = nonEmpty.reduce((min, l) => {
          const ind = (l.match(/^ */) || [''])[0].length;
          return Math.min(min, ind);
        }, Infinity);
        if (commonIndent > 0) {
          const deindented = lines.map(l => l.slice(commonIndent)).join('\n');
          match = domFencedCodes.find(el => {
            const t = el.textContent || '';
            return t === deindented || t === deindented + '\n' || t.trimEnd() === deindented.trimEnd();
          });
        }
      }
    }
    if (match) map.set(block.contentStart, match);
  }
  return map;
}

const files = [
  { file: 'D:/Temp/alerts-2/docs/be-tsd.tsd02.md', componentId: 'be-tsd.tsd02' },
  { file: 'D:/Temp/alerts-2/docs/app-tsd.tsd03.md', componentId: 'app-tsd.tsd03' },
];

for (const { file, componentId } of files) {
  console.log('\n========', componentId, '========');
  const source = fs.readFileSync(file, 'utf8');
  const anchors = comments.filter(c => c.anchor && c.anchor.componentId === componentId).map(c => c.anchor);

  const html = marked.parse(source);
  const dom = new JSDOM(`<div id="root">${html}</div>`);
  const root = dom.window.document.getElementById('root');
  const domFencedCodes = Array.from(root.querySelectorAll('pre > code'));
  const fencedBlocks = findFencedCodeBlocks(source);
  const fencedCodeByBlock = buildFencedCodeByBlock(source, fencedBlocks, domFencedCodes);

  console.log(`fencedBlocks: ${fencedBlocks.length} | domFencedCodes: ${domFencedCodes.length} | mapped: ${fencedCodeByBlock.size}`);

  for (const anchor of anchors) {
    const block = fencedBlocks.find(b => anchor.start >= b.contentStart && anchor.end <= b.contentEnd);
    if (!block) {
      console.log(`  Anchor ${JSON.stringify(anchor.excerpt)}: prose path (not in fenced block)`);
      continue;
    }
    const codeEl = fencedCodeByBlock.get(block.contentStart);
    if (!codeEl) {
      console.log(`  Anchor ${JSON.stringify(anchor.excerpt)}: in block[${block.index}] but NO DOM match!`);
      continue;
    }
    const relStart = anchor.start - block.contentStart;
    const relEnd = anchor.end - block.contentStart;
    // De-indent offset: count how many chars stripped per line
    const blockText = source.slice(block.contentStart, block.contentEnd);
    const lines = blockText.split('\n');
    const nonEmpty = lines.filter(l => l.trim().length > 0);
    const commonIndent = nonEmpty.length > 0
      ? nonEmpty.reduce((min, l) => Math.min(min, (l.match(/^ */) || [''])[0].length), Infinity)
      : 0;
    // Recalculate relStart/relEnd in de-indented text
    const deindented = lines.map(l => l.slice(commonIndent)).join('\n');
    const domText = codeEl.textContent || '';
    const highlighted = domText.slice(relStart - commonIndent * /* approx line */ 0, relEnd);
    // More accurate: find line number at relStart, subtract commonIndent * lineNum
    let charCount = 0, lineNum = 0, adjStart = relStart, adjEnd = relEnd;
    for (let li = 0; li < lines.length; li++) {
      const origLineLen = lines[li].length + 1; // +1 for \n
      if (charCount + origLineLen > relStart && adjStart === relStart) {
        adjStart = relStart - commonIndent * li;
      }
      if (charCount + origLineLen > relEnd && adjEnd === relEnd) {
        adjEnd = relEnd - commonIndent * li;
        break;
      }
      charCount += origLineLen;
      lineNum++;
    }
    const highlightedText = domText.slice(adjStart, adjEnd);
    console.log(`  Anchor ${JSON.stringify(anchor.excerpt)}: block[${block.index}] relStart=${relStart} relEnd=${relEnd}`);
    console.log(`  commonIndent=${commonIndent} adjStart=${adjStart} adjEnd=${adjEnd}`);
    console.log(`  highlighted: ${JSON.stringify(highlightedText)}`);
    console.log(`  CORRECT: ${highlightedText.trim() === anchor.excerpt.trim()}`);
  }
}
