import { parseMarkdownWithOffsets } from '../src/lib/mdSelection.ts';
import { JSDOM } from 'jsdom';
import fs from 'fs';

const source = fs.readFileSync('D:/Temp/alerts-2/docs/app-tsd.tsd05.md', 'utf8');
const html = parseMarkdownWithOffsets(source);

const doc = new JSDOM('<div id="root">' + html + '</div>').window.document;
const root = doc.getElementById('root')!;

const spans = root.querySelectorAll('[data-md-offset-start]');
const near: Array<{ off: number; text: string }> = [];
spans.forEach(span => {
  const off = parseInt(span.getAttribute('data-md-offset-start')!);
  if (off >= 5700 && off <= 5950) {
    near.push({ off, text: (span.textContent ?? '').slice(0, 60) });
  }
});
console.log('spans near 5766:', JSON.stringify(near, null, 2));

// Also check: walk all text nodes in root, find any with source offset ~5766
const walker = doc.createTreeWalker(root, 0x4 /* SHOW_TEXT */);
let node = walker.nextNode();
const textNear: Array<{ srcOff: number | null; text: string }> = [];

function findAnnotatedOffsetRoot(n: Node | null): Element | null {
  let cur: Node | null = n;
  if (cur?.nodeType === 3) cur = (cur as Text).parentElement;
  while (cur && cur.nodeType === 1) {
    const el = cur as Element;
    if (el.hasAttribute('data-md-offset-start')) return el;
    cur = el.parentElement;
  }
  return null;
}

function textOffsetInRoot(root: Element, target: Node, targetOff: number): number | null {
  const walker = root.ownerDocument.createTreeWalker(root, 0x4);
  let acc = 0;
  let n = walker.nextNode();
  while (n) {
    if (n === target) return acc + targetOff;
    acc += (n as Text).length;
    n = walker.nextNode();
  }
  return null;
}

while (node) {
  const tn = node as Text;
  const annotRoot = findAnnotatedOffsetRoot(tn);
  if (annotRoot) {
    const base = parseInt(annotRoot.getAttribute('data-md-offset-start')!);
    const inner = textOffsetInRoot(annotRoot, tn, 0);
    if (inner != null) {
      const srcOff = base + inner;
      if (srcOff >= 5700 && srcOff <= 5950) {
        textNear.push({ srcOff, text: tn.textContent?.slice(0, 40) ?? '' });
      }
    }
  }
  node = walker.nextNode();
}
console.log('\ntext nodes near 5766:', JSON.stringify(textNear, null, 2));
