const fs = require('fs');
const { marked } = require('marked');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync('D:/Temp/alerts-2/docs/be-tsd.tsd02.md', 'utf8');
const html = marked.parse(source);
const dom = new JSDOM(`<div id="root">${html}</div>`);
const root = dom.window.document.getElementById('root');

// New approach: lookup by data-md-offset-start
// But marked plain renderer doesn't add data-md-offset-start
// We need parseMarkdownWithOffsets output. Simulate it:
// The renderer.code sets data-md-offset-start = contentStart of fenced block
// fenced block [0] contentStart=3387, fenced block [1] contentStart=9338

// Simulate what parseMarkdownWithOffsets produces for fenced blocks
// by checking what marked does with the offset renderer

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
console.log('fencedBlocks:', fencedBlocks.map(b => `[${b.index}] ${b.contentStart}-${b.contentEnd}`));

// Simulate the annotateToken logic for code blocks
// annotateToken finds the raw token in source starting from `from`
// For a fenced block, raw = "```\n...content...\n```\n"
// mdOffset = position of opening fence in source
// contentStart = mdOffset + newline_pos + 1

// The key question: what data-md-offset-start values does parseMarkdownWithOffsets emit?
// renderer.code: contentStart = annotated.mdOffset + newline + 1
// For block [0]: opening fence at source offset 3383 (```), newline at position 3, contentStart = 3387 ✓
// For block [1]: opening fence at "```json" at source offset 9330(?), newline, contentStart = 9338 ✓

// So the <code data-md-offset-start="3387"> and <code data-md-offset-start="9338">
// will be in the HTML from parseMarkdownWithOffsets

// The indented ```json block (inside list item, lines 51-59) - does marked render it?
// Check: what does marked tokenize for it?
const tokens = marked.lexer(source);
function findCodeTokens(tokens, depth=0) {
  for (const t of tokens) {
    if (t.type === 'code') {
      console.log(`${'  '.repeat(depth)}code token: lang=${t.lang} raw[0..40]=${JSON.stringify(t.raw.slice(0,40))}`);
    }
    if (t.tokens) findCodeTokens(t.tokens, depth+1);
    if (t.items) {
      for (const item of t.items) {
        if (item.tokens) findCodeTokens(item.tokens, depth+1);
      }
    }
  }
}

console.log('\n--- Code tokens from marked lexer ---');
findCodeTokens(tokens);
