const fs = require('fs');
const { marked } = require('marked');
const { JSDOM } = require('jsdom');

// Test both files
const files = [
  { file: 'D:/Temp/alerts-2/docs/be-tsd.tsd02.md', componentId: 'be-tsd.tsd02' },
  { file: 'D:/Temp/alerts-2/docs/app-tsd.tsd03.md', componentId: 'app-tsd.tsd03' },
];
const comments = JSON.parse(fs.readFileSync('D:/Temp/alerts-2/comments.json', 'utf8'));

function findFencedCodeBlocks(source) {
  const blocks = [];
  const len = source.length;
  let i = 0, index = 0;
  while (i < len) {
    const lineEnd = source.indexOf('\n', i);
    const lineEndPos = lineEnd === -1 ? len : lineEnd;
    const line = source.slice(i, lineEndPos);
    const openMatch = line.match(/^(`{3,}|~{3,})(?:\s*[\w-]+)?\s*$/);
    if (openMatch) {
      const fc = openMatch[1][0];
      const ml = openMatch[1].length;
      const contentStart = lineEndPos === len ? len : lineEndPos + 1;
      let j = contentStart, closed = false;
      while (j < len) {
        const cle = source.indexOf('\n', j);
        const clep = cle === -1 ? len : cle;
        const cl = source.slice(j, clep);
        const re = new RegExp('^' + (fc === '`' ? '`' : '~') + '{' + ml + ',}\\s*$');
        if (re.test(cl)) {
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

for (const { file, componentId } of files) {
  console.log('\n========', componentId, '========');
  const source = fs.readFileSync(file, 'utf8');
  const anchors = comments.filter(c => c.anchor && c.anchor.componentId === componentId).map(c => c.anchor);
  console.log('Anchors:', anchors.map(a => `start=${a.start} excerpt=${JSON.stringify(a.excerpt)}`));

  const html = marked.parse(source);
  const dom = new JSDOM(`<div id="root">${html}</div>`);
  const root = dom.window.document.getElementById('root');
  const domFencedCodes = Array.from(root.querySelectorAll('pre > code'));
  const fencedBlocks = findFencedCodeBlocks(source);

  console.log('fencedBlocks:', fencedBlocks.length, '| domFencedCodes:', domFencedCodes.length);

  // NEW: match by textContent
  const fencedCodeByBlock = new Map();
  for (const block of fencedBlocks) {
    const blockText = source.slice(block.contentStart, block.contentEnd);
    const match = domFencedCodes.find(el => {
      const t = el.textContent || '';
      return t === blockText || t === blockText + '\n' || t.trimEnd() === blockText.trimEnd();
    });
    if (match) {
      fencedCodeByBlock.set(block.contentStart, match);
      console.log(`  block[${block.index}] cs=${block.contentStart} MATCHED DOM el`);
      console.log(`    blockText[0..50]: ${JSON.stringify(blockText.slice(0, 50))}`);
      console.log(`    domText[0..50]:   ${JSON.stringify((match.textContent || '').slice(0, 50))}`);
    } else {
      console.log(`  block[${block.index}] cs=${block.contentStart} NO MATCH`);
      console.log(`    blockText[0..50]: ${JSON.stringify(blockText.slice(0, 50))}`);
      domFencedCodes.forEach((el, i) => {
        console.log(`    domCode[${i}][0..50]: ${JSON.stringify((el.textContent || '').slice(0, 50))}`);
      });
    }
  }

  // Simulate highlight for each anchor
  for (const anchor of anchors) {
    const block = fencedBlocks.find(b => anchor.start >= b.contentStart && anchor.end <= b.contentEnd);
    if (!block) {
      console.log(`Anchor ${JSON.stringify(anchor.excerpt)}: NOT in fenced block → prose path`);
      continue;
    }
    const codeEl = fencedCodeByBlock.get(block.contentStart);
    const relStart = anchor.start - block.contentStart;
    const relEnd = anchor.end - block.contentStart;
    const domText = codeEl ? (codeEl.textContent || '') : '';
    const highlighted = domText.slice(relStart, relEnd);
    console.log(`Anchor ${JSON.stringify(anchor.excerpt)}: fenced block[${block.index}]`);
    console.log(`  relStart=${relStart} relEnd=${relEnd}`);
    console.log(`  highlighted text: ${JSON.stringify(highlighted)}`);
    console.log(`  CORRECT: ${highlighted === anchor.excerpt}`);
  }
}
