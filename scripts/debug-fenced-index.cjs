const fs = require('fs');
const { marked } = require('marked');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync('D:/Temp/alerts-2/docs/be-tsd.tsd02.md', 'utf8');

// Render plain markdown (no offset renderer, just to count elements)
const html = marked.parse(source);

const dom = new JSDOM(`<div id="root">${html}</div>`);
const root = dom.window.document.getElementById('root');

const preCodes = Array.from(root.querySelectorAll('pre > code'));
const inlineCodes = Array.from(root.querySelectorAll('code')).filter(el => !el.closest('pre'));

console.log('pre>code count:', preCodes.length);
console.log('inline code count:', inlineCodes.length);

preCodes.forEach((el, i) => {
  const text = el.textContent || '';
  console.log(`  preCode[${i}]: first 60 chars: ${JSON.stringify(text.slice(0, 60))}`);
});

// Now simulate findFencedCodeBlocks result
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

const fencedBlocks = findFencedCodeBlocks(source);
console.log('\nfencedBlocks count:', fencedBlocks.length);
fencedBlocks.forEach(b => {
  console.log(`  [${b.index}] ${b.contentStart}-${b.contentEnd}`);
  console.log(`    preview: ${JSON.stringify(source.slice(b.contentStart, Math.min(b.contentStart+60, b.contentEnd)))}`);
});

// KEY CHECK: does block.index match preCodes array index?
// block [0] should match preCodes[0], block [1] -> preCodes[1]
console.log('\n--- Index alignment check ---');
fencedBlocks.forEach(b => {
  const codeEl = preCodes[b.index];
  if (!codeEl) { console.log(`  block[${b.index}]: NO matching DOM element!`); return; }
  const domText = codeEl.textContent.slice(0, 60);
  const srcText = source.slice(b.contentStart, Math.min(b.contentStart+60, b.contentEnd));
  const match = domText.trim() === srcText.trim();
  console.log(`  block[${b.index}] vs preCodes[${b.index}]: match=${match}`);
  console.log(`    src: ${JSON.stringify(srcText)}`);
  console.log(`    dom: ${JSON.stringify(domText)}`);
});

// Simulate highlight at anchor offset
const anchor = { start: 3513, end: 3540, excerpt: ' UserResponseSupport.preloa', segments: [{start:3513,end:3540}] };
const block = fencedBlocks.find(b => anchor.start >= b.contentStart && anchor.end <= b.contentEnd);
if (block) {
  const relStart = anchor.start - block.contentStart;
  const relEnd = anchor.end - block.contentStart;
  console.log('\nAnchor maps to fenced block', block.index);
  console.log('relStart=', relStart, 'relEnd=', relEnd);

  const codeEl = preCodes[block.index];
  if (codeEl) {
    const domText = codeEl.textContent;
    console.log('DOM text at relStart:', JSON.stringify(domText.slice(relStart, relEnd)));
    console.log('Expected:', JSON.stringify(anchor.excerpt));
    console.log('Match:', domText.slice(relStart, relEnd) === anchor.excerpt);
  }
}
