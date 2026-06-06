import fs from 'fs';

const source = fs.readFileSync('D:/giapsoft/gits/xfarm-app-flutter-2/.documents/alerts/tree/docs/be-tsd.tsd02.md', 'utf8');
console.log('Total length:', source.length);

// Replicate findFencedCodeBlocks logic from mdSelection.ts
function findFencedCodeBlocks(source) {
  const blocks = [];
  const len = source.length;
  let i = 0;
  let index = 0;

  while (i < len) {
    const lineStart = i;
    const lineEnd = source.indexOf('\n', i);
    const lineEndPos = lineEnd === -1 ? len : lineEnd;
    const line = source.slice(lineStart, lineEndPos);

    const openMatch = line.match(/^(`{3,}|~{3,})(?:\s*[\w-]+)?\s*$/);
    if (openMatch) {
      const fenceChar = openMatch[1][0];
      const minLen = openMatch[1].length;
      const contentStart = lineEndPos === len ? len : lineEndPos + 1;
      let j = contentStart;
      let closed = false;

      console.log(`Fence open: line="${line}" contentStart=${contentStart}`);

      while (j < len) {
        const closeLineStart = j;
        const closeLineEnd = source.indexOf('\n', j);
        const closeLineEndPos = closeLineEnd === -1 ? len : closeLineEnd;
        const closeLine = source.slice(closeLineStart, closeLineEndPos);
        const closePattern = new RegExp(`^\\${fenceChar}{${minLen},}\\s*$`);
        if (closePattern.test(closeLine)) {
          blocks.push({ contentStart, contentEnd: closeLineStart, index: index++ });
          console.log(`Fence close: line="${closeLine}" contentEnd=${closeLineStart}`);
          closed = true;
          i = closeLineEndPos === len ? len : closeLineEndPos + 1;
          break;
        }
        j = closeLineEndPos === len ? len : closeLineEndPos + 1;
      }

      if (!closed) {
        blocks.push({ contentStart, contentEnd: len, index: index++ });
        console.log(`Fence NOT closed, contentEnd=${len}`);
        break;
      }
      continue;
    }

    i = lineEndPos === len ? len : lineEndPos + 1;
  }

  return blocks;
}

const fenced = findFencedCodeBlocks(source);
console.log('\nFenced blocks:');
fenced.forEach((b) => {
  console.log(`  [${b.index}] contentStart=${b.contentStart} contentEnd=${b.contentEnd}`);
  console.log(`        preview: ${JSON.stringify(source.slice(b.contentStart, Math.min(b.contentStart + 60, b.contentEnd)))}`);
});

// Find UserPrivateController occurrences
console.log('\nUserPrivateController occurrences:');
let idx = 0;
while (true) {
  const found = source.indexOf('UserPrivateController', idx);
  if (found < 0) break;
  const inFenced = fenced.some(b => found >= b.contentStart && found < b.contentEnd);
  console.log(`  offset=${found} inFenced=${inFenced}`);
  console.log(`    context: ${JSON.stringify(source.slice(Math.max(0, found - 20), found + 40))}`);
  idx = found + 1;
}

// Check specific text from user report: what's at ~offset of json block
console.log('\n--- Checking "District A" in source ---');
idx = 0;
while (true) {
  const found = source.indexOf('District A', idx);
  if (found < 0) break;
  const inFenced = fenced.some(b => found >= b.contentStart && found < b.contentEnd);
  console.log(`  offset=${found} inFenced=${inFenced}`);
  idx = found + 1;
}
