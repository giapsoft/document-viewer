export interface MdHighlightRange {
  start: number;
  end: number;
  className?: string;
}

interface SourceRegion {
  contentStart: number;
  contentEnd: number;
  index: number;
}

/** Map a DOM text selection to character offsets in the markdown source. */
export function mdRangeFromSelection(
  source: string,
  selection: Selection,
): { start: number; end: number; excerpt: string } | null {
  const excerpt = selection.toString();
  if (!excerpt.trim()) return null;

  const anchor = findOffsetInSource(source, selection.anchorNode, selection.anchorOffset);
  const focus = findOffsetInSource(source, selection.focusNode, selection.focusOffset);
  if (anchor === null || focus === null) {
    return fallbackRangeFromExcerpt(source, excerpt);
  }

  const start = Math.min(anchor, focus);
  const end = Math.max(anchor, focus);
  if (start === end) return fallbackRangeFromExcerpt(source, excerpt);

  return {
    start,
    end,
    excerpt: source.slice(start, end),
  };
}

function fallbackRangeFromExcerpt(
  source: string,
  excerpt: string,
): { start: number; end: number; excerpt: string } | null {
  const idx = source.indexOf(excerpt);
  if (idx < 0) return null;
  return { start: idx, end: idx + excerpt.length, excerpt };
}

function findOffsetInSource(
  _source: string,
  node: Node | null,
  offset: number,
): number | null {
  if (!node) return null;

  let element: Element | null =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);

  while (element) {
    const startAttr = element.getAttribute?.('data-md-offset-start');
    if (startAttr != null) {
      const base = Number.parseInt(startAttr, 10);
      if (Number.isNaN(base)) return null;
      if (node.nodeType === Node.TEXT_NODE) {
        return base + offset;
      }
      return base;
    }
    element = element.parentElement;
  }

  return null;
}

export function findFencedCodeBlocks(source: string): SourceRegion[] {
  const blocks: SourceRegion[] = [];
  const len = source.length;
  let i = 0;
  let index = 0;

  while (i < len) {
    const lineStart = i;
    const lineEnd = source.indexOf('\n', i);
    const lineEndPos = lineEnd === -1 ? len : lineEnd;
    const line = source.slice(lineStart, lineEndPos);

    const openMatch = line.match(/^(`{3,}|~{3,})(?:\s+\S*)?\s*$/);
    if (openMatch) {
      const fenceChar = openMatch[1][0];
      const minLen = openMatch[1].length;
      const contentStart = lineEndPos === len ? len : lineEndPos + 1;
      let j = contentStart;
      let closed = false;

      while (j < len) {
        const closeLineStart = j;
        const closeLineEnd = source.indexOf('\n', j);
        const closeLineEndPos = closeLineEnd === -1 ? len : closeLineEnd;
        const closeLine = source.slice(closeLineStart, closeLineEndPos);
        const closePattern = new RegExp(`^\\${fenceChar}{${minLen},}\\s*$`);
        if (closePattern.test(closeLine)) {
          blocks.push({ contentStart, contentEnd: closeLineStart, index: index++ });
          closed = true;
          i = closeLineEndPos === len ? len : closeLineEndPos + 1;
          break;
        }
        j = closeLineEndPos === len ? len : closeLineEndPos + 1;
      }

      if (!closed) {
        blocks.push({ contentStart, contentEnd: len, index: index++ });
        break;
      }
      continue;
    }

    i = lineEndPos === len ? len : lineEndPos + 1;
  }

  return blocks;
}

export function findInlineCodeSpans(
  source: string,
  fencedBlocks: SourceRegion[],
): SourceRegion[] {
  const insideFenced = (pos: number) =>
    fencedBlocks.some((b) => pos >= b.contentStart && pos < b.contentEnd);

  const spans: SourceRegion[] = [];
  let i = 0;
  let index = 0;

  while (i < source.length) {
    if (insideFenced(i)) {
      i++;
      continue;
    }

    if (source[i] !== '`') {
      i++;
      continue;
    }

    let tickLen = 0;
    while (i + tickLen < source.length && source[i + tickLen] === '`') tickLen++;
    if (tickLen >= 3) {
      i += tickLen;
      continue;
    }

    const contentStart = i + tickLen;
    let j = contentStart;
    while (j < source.length && source[j] !== '`') j++;
    if (j >= source.length) break;

    if (!insideFenced(contentStart)) {
      spans.push({ contentStart, contentEnd: j, index: index++ });
    }
    i = j + 1;
  }

  return spans;
}

type RangeKind = 'prose' | 'fenced' | 'inline' | 'mixed';

function classifyHighlightRange(
  range: MdHighlightRange,
  fencedBlocks: SourceRegion[],
  inlineSpans: SourceRegion[],
): RangeKind {
  const { start, end } = range;
  if (fencedBlocks.some((b) => start >= b.contentStart && end <= b.contentEnd)) {
    return 'fenced';
  }
  if (inlineSpans.some((s) => start >= s.contentStart && end <= s.contentEnd)) {
    return 'inline';
  }
  const overlapsFenced = fencedBlocks.some(
    (b) => start < b.contentEnd && end > b.contentStart,
  );
  const overlapsInline = inlineSpans.some(
    (s) => start < s.contentEnd && end > s.contentStart,
  );
  if (overlapsFenced || overlapsInline) return 'mixed';
  return 'prose';
}

/** Inject <mark> wrappers at source offsets before markdown parse (prose only). */
export function injectMdHighlights(
  source: string,
  ranges: MdHighlightRange[],
): string {
  if (ranges.length === 0) return source;

  const valid = ranges
    .filter((r) => r.start >= 0 && r.end > r.start && r.end <= source.length)
    .sort((a, b) => b.start - a.start);

  let result = source;
  for (const range of valid) {
    const cls = range.className ?? 'md-comment-highlight';
    const before = result.slice(0, range.start);
    const mid = result.slice(range.start, range.end);
    const after = result.slice(range.end);
    result = `${before}<mark class="${cls}">${mid}</mark>${after}`;
  }
  return result;
}

function locateTextPosition(
  element: Element,
  targetOffset: number,
): { node: Text; offset: number } | null {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let pos = 0;
  let current = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    const len = textNode.length;
    if (targetOffset <= pos + len) {
      return { node: textNode, offset: Math.max(0, targetOffset - pos) };
    }
    pos += len;
    current = walker.nextNode();
  }
  return null;
}

function wrapSingleTextNode(
  node: Text,
  start: number,
  end: number,
  className: string,
): void {
  if (start >= end) return;

  const doc = node.ownerDocument;
  const mark = doc.createElement('mark');
  mark.className = className;
  const parent = node.parentNode;
  if (!parent) return;

  if (start === 0 && end === node.length) {
    parent.replaceChild(mark, node);
    mark.appendChild(node);
    return;
  }

  if (start === 0) {
    const after = node.splitText(end);
    parent.insertBefore(mark, after);
    mark.appendChild(node);
    return;
  }

  if (end === node.length) {
    const mid = node.splitText(start);
    parent.insertBefore(mark, mid.nextSibling);
    mark.appendChild(mid);
    return;
  }

  const mid = node.splitText(start);
  const after = mid.splitText(end - start);
  parent.insertBefore(mark, after);
  mark.appendChild(mid);
}

function highlightTextInElement(
  element: Element,
  relStart: number,
  relEnd: number,
  className: string,
): void {
  if (relStart >= relEnd) return;

  const start = locateTextPosition(element, relStart);
  const end = locateTextPosition(element, relEnd);
  if (!start || !end) return;

  const doc = element.ownerDocument;
  const range = doc.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);

  const mark = doc.createElement('mark');
  mark.className = className;

  if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
    wrapSingleTextNode(range.startContainer as Text, range.startOffset, range.endOffset, className);
    return;
  }

  try {
    range.surroundContents(mark);
  } catch {
    const fragment = range.extractContents();
    mark.appendChild(fragment);
    range.insertNode(mark);
  }
}

function injectHtmlHighlights(
  html: string,
  source: string,
  ranges: MdHighlightRange[],
  fencedBlocks: SourceRegion[],
  inlineSpans: SourceRegion[],
): string {
  if (ranges.length === 0) return html;

  const doc = new DOMParser().parseFromString(`<div id="md-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('md-root');
  if (!root) return html;

  const fencedCodes = Array.from(root.querySelectorAll('pre > code'));
  const inlineCodes = Array.from(root.querySelectorAll('code')).filter(
    (el) => !el.closest('pre'),
  );

  const sorted = [...ranges]
    .filter((r) => r.start >= 0 && r.end > r.start && r.end <= source.length)
    .sort((a, b) => b.start - a.start);

  for (const range of sorted) {
    const kind = classifyHighlightRange(range, fencedBlocks, inlineSpans);
    const cls = range.className ?? 'md-comment-highlight';

    if (kind === 'fenced') {
      const block = fencedBlocks.find(
        (b) => range.start >= b.contentStart && range.end <= b.contentEnd,
      );
      if (!block) continue;
      const codeEl = fencedCodes[block.index];
      if (!codeEl) continue;
      highlightTextInElement(
        codeEl,
        range.start - block.contentStart,
        range.end - block.contentStart,
        cls,
      );
      continue;
    }

    if (kind === 'inline') {
      const span = inlineSpans.find(
        (s) => range.start >= s.contentStart && range.end <= s.contentEnd,
      );
      if (!span) continue;
      const codeEl = inlineCodes[span.index];
      if (!codeEl) continue;
      highlightTextInElement(
        codeEl,
        range.start - span.contentStart,
        range.end - span.contentStart,
        cls,
      );
    }
  }

  return root.innerHTML;
}

/** Parse markdown and apply comment highlights without breaking code blocks. */
export function applyMarkdownHighlights(
  source: string,
  ranges: MdHighlightRange[],
  parseMarkdown: (markdown: string) => string,
): string {
  if (ranges.length === 0) return parseMarkdown(source);

  const fencedBlocks = findFencedCodeBlocks(source);
  const inlineSpans = findInlineCodeSpans(source, fencedBlocks);

  const proseRanges: MdHighlightRange[] = [];
  const htmlRanges: MdHighlightRange[] = [];

  for (const range of ranges) {
    const kind = classifyHighlightRange(range, fencedBlocks, inlineSpans);
    if (kind === 'prose') {
      proseRanges.push(range);
    } else if (kind === 'fenced' || kind === 'inline') {
      htmlRanges.push(range);
    }
  }

  const markdown = injectMdHighlights(source, proseRanges);
  const html = parseMarkdown(markdown);
  return injectHtmlHighlights(html, source, htmlRanges, fencedBlocks, inlineSpans);
}
