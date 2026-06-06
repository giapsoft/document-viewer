import fs from 'fs';

const source = fs.readFileSync('D:/Temp/alerts-2/docs/app-tsd.tsd02.md', 'utf8');
console.log('Source length:', source.length);

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
      const fenceChar = openMatch[1][0];
      const minLen = openMatch[1].length;
      const contentStart = lineEndPos === len ? len : lineEndPos + 1;
      let j = contentStart, closed = false;
      while (j < len) {
        const closeLineEnd = source.indexOf('\n', j);
        const closeLineEndPos = closeLineEnd === -1 ? len : closeLineEnd;
        const closeLine = source.slice(j, closeLineEndPos);
        // build close regex dynamically
        const closeRe = new RegExp('^' + (fenceChar === '`' ? '`' : '~') + '{' + minLen + ',}\\s*$');
        if (closeRe.test(closeLine)) {
          blocks.push({ contentStart, contentEnd: j, index: index++ });
          closed = true;
          i = closeLineEndPos === len ? len : closeLineEndPos + 1;
          break;
        }
        j = closeLineEndPos === len ? len : closeLineEndPos + 1;
      }
      if (!closed) { blocks.push({ contentStart, contentEnd: len, index: index++ }); break; }
      continue;
    }
    i = lineEndPos === len ? len : lineEndPos + 1;
  }
  return blocks;
}

const blocks = findFencedCodeBlocks(source);
console.log('\nFenced blocks:');
blocks.forEach(b => {
  const preview = source.slice(b.contentStart, Math.min(b.contentStart + 60, b.contentEnd));
  console.log(`  [${b.index}] ${b.contentStart}-${b.contentEnd} (${b.contentEnd - b.contentStart} chars)`);
  console.log(`    preview: ${JSON.stringify(preview)}`);
});

// Check anchor for app-tsd.tsd02: start=13525, end=13558
const anchor = { start: 13525, end: 13558, excerpt: 'Plan-scoped alerts are view-only.' };
console.log('\n--- Anchor check ---');
console.log('source.slice(13525,13558):', JSON.stringify(source.slice(13525, 13558)));
const inFenced = blocks.some(b => anchor.start >= b.contentStart && anchor.end <= b.contentEnd);
console.log('inFenced:', inFenced);

// The BIG fenced block — the flow diagram
const bigBlock = blocks.find(b => b.contentEnd - b.contentStart > 500);
if (bigBlock) {
  console.log('\nBig block:', bigBlock.contentStart, '-', bigBlock.contentEnd);
  console.log('Does big block contain 13525?', 13525 >= bigBlock.contentStart && 13525 < bigBlock.contentEnd);
}

// What line is 13525?
let line = 1, col = 1;
for (let i = 0; i < 13525 && i < source.length; i++) {
  if (source[i] === '\n') { line++; col = 1; } else col++;
}
console.log(`\nOffset 13525 is at line ${line}, col ${col}`);
console.log('Context:', JSON.stringify(source.slice(13480, 13570)));

// Check the prose around it for any fenced-block interference
// What is the paragraph it belongs to?
const paraStart = source.lastIndexOf('\n\n', 13525);
const paraEnd = source.indexOf('\n\n', 13525);
console.log('\nParagraph:', JSON.stringify(source.slice(paraStart, paraEnd)));
