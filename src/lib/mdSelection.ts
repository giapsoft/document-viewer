import { marked, Renderer, type Token, type Tokens } from 'marked';

export interface MdSourceSegment {
  start: number;
  end: number;
}

export interface MdTextRange {
  start: number;
  end: number;
  excerpt: string;
  segments: MdSourceSegment[];
}

export interface MdHighlightRange {
  start: number;
  end: number;
  className?: string;
  segments?: MdSourceSegment[];
  commentId?: string;
}

type AnnotatedToken = Token & { mdOffset?: number };

interface SourceRegion {
  contentStart: number;
  contentEnd: number;
  index: number;
}

function rangeIntersectsTextNode(range: Range, textNode: Text): boolean {
  try {
    return range.intersectsNode(textNode);
  } catch {
    const nodeRange = range.cloneRange();
    nodeRange.selectNodeContents(textNode);
    return (
      range.compareBoundaryPoints(Range.END_TO_START, nodeRange) < 0 &&
      range.compareBoundaryPoints(Range.START_TO_END, nodeRange) > 0
    );
  }
}

function getTextBoundsInRange(range: Range, textNode: Text): { start: number; end: number } | null {
  const len = textNode.length;
  try {
    if (range.comparePoint(textNode, 0) > 0) return null;
    if (range.comparePoint(textNode, len) < 0) return null;
  } catch {
    if (!rangeIntersectsTextNode(range, textNode)) return null;
  }

  const start = range.startContainer === textNode ? range.startOffset : 0;
  const end = range.endContainer === textNode ? range.endOffset : len;
  if (start >= end) return null;
  return { start, end };
}

function normalizeExcerptCompare(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Strip markdown inline syntax (backticks, bold/italic markers) for loose comparison. */
function stripMdInlineSyntax(value: string): string {
  return value.replace(/`+/g, '').replace(/\*+/g, '').replace(/_+/g, '');
}

/** True when a source slice plausibly belongs to the user-facing selection excerpt. */
export function segmentTextMatchesExcerpt(
  source: string,
  start: number,
  end: number,
  excerpt: string,
): boolean {
  if (!excerpt.trim()) return true;
  const text = normalizeExcerptCompare(source.slice(start, end));
  if (!text) return false;
  const normExcerpt = normalizeExcerptCompare(excerpt);
  if (text === normExcerpt) return true;
  // Only allow "text contains excerpt" when the segment is tightly sized —
  // a segment much wider than the excerpt is a sign the stored offset is wrong.
  if (text.includes(normExcerpt) && text.length <= normExcerpt.length * 1.5 + 8) return true;
  if (normExcerpt.includes(text) && text.length >= Math.min(normExcerpt.length * 0.4, 10)) {
    return true;
  }
  // Loose compare: strip inline markdown syntax (backticks, bold/italic) from the
  // source slice — the excerpt stored in DB is the plain-text version from the DOM.
  const stripped = normalizeExcerptCompare(stripMdInlineSyntax(text));
  if (stripped === normExcerpt) return true;
  if (stripped.includes(normExcerpt) && stripped.length <= normExcerpt.length * 1.5 + 8) return true;
  if (normExcerpt.includes(stripped) && stripped.length >= Math.min(normExcerpt.length * 0.4, 10)) return true;
  return false;
}

/** Merge segments separated only by markdown syntax (e.g. inline-code backticks). */
export function mergeAdjacentMdSegments(
  segments: MdSourceSegment[],
  maxGap = 4,
): MdSourceSegment[] {
  if (segments.length <= 1) return segments;
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const merged: MdSourceSegment[] = [];
  let current = { ...sorted[0]! };
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    if (next.start - current.end <= maxGap) {
      current.end = Math.max(current.end, next.end);
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);
  return merged;
}

function excerptSearchNeedles(excerpt: string): string[] {
  const candidates = [
    excerpt,
    excerpt.trim(),
    excerpt.replace(/\u00a0/g, ' '),
    excerpt.replace(/\s+/g, ' ').trim(),
  ];
  const seen = new Set<string>();
  const needles: string[] = [];
  for (const needle of candidates) {
    if (!needle || seen.has(needle)) continue;
    seen.add(needle);
    needles.push(needle);
  }
  return needles;
}

function anchorHintPosition(anchor: {
  start: number;
  end: number;
  segments?: MdSourceSegment[];
}): number {
  if (anchor.segments?.length) {
    let sum = 0;
    for (const segment of anchor.segments) {
      sum += (segment.start + segment.end) / 2;
    }
    return sum / anchor.segments.length;
  }
  return (anchor.start + anchor.end) / 2;
}

/** Find excerpt in source; when multiple matches, pick the one nearest hint. */
function locateExcerptInSource(
  source: string,
  excerpt: string,
  hint = 0,
): MdSourceSegment | null {
  let best: MdSourceSegment | null = null;
  let bestDistance = Infinity;

  for (const needle of excerptSearchNeedles(excerpt)) {
    for (const start of findAllIndices(source, needle)) {
      const distance = Math.abs(start - hint);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { start, end: start + needle.length };
      }
    }
  }

  return best;
}

function envelopeMatchesExcerpt(
  source: string,
  start: number,
  end: number,
  excerpt: string,
): boolean {
  const slice = normalizeExcerptCompare(source.slice(start, end));
  const ex = normalizeExcerptCompare(excerpt);
  if (!slice || !ex) return false;
  if (slice === ex) return true;
  if (slice.length > ex.length * 1.5 + 8) return false;
  return slice.includes(ex) || ex.includes(slice);
}

/** Resolve highlight spans from a stored anchor; never paint the start/end envelope blindly. */
export function resolveMdHighlightSegments(
  source: string,
  anchor: { start: number; end: number; excerpt: string; segments?: MdSourceSegment[] },
): MdSourceSegment[] {
  // Use the envelope midpoint as the primary hint — more reliable than the
  // centroid of stored segments which may point to a wrong region.
  const envelopeHint = (anchor.start + anchor.end) / 2;

  let segments: MdSourceSegment[] = [];
  if (anchor.segments?.length) {
    segments = anchor.segments.filter(
      (segment) =>
        segment.start >= 0 &&
        segment.end > segment.start &&
        segment.end <= source.length &&
        segmentTextMatchesExcerpt(source, segment.start, segment.end, anchor.excerpt),
    );
    segments = mergeAdjacentMdSegments(segments);
  }

  if (segments.length > 0) {
    const joined = normalizeExcerptCompare(
      segments.map((segment) => source.slice(segment.start, segment.end)).join(''),
    );
    const normExcerpt = normalizeExcerptCompare(anchor.excerpt);
    // Accept stored segments only when the joined text closely matches the excerpt.
    // Also try stripping inline markdown syntax (backticks etc.) from the joined text,
    // because the excerpt stored in DB is the plain-text version from the rendered DOM.
    const joinedStripped = normalizeExcerptCompare(stripMdInlineSyntax(joined));
    const tightEnough =
      joined.length <= normExcerpt.length * 1.5 + 8 ||
      joinedStripped.length <= normExcerpt.length * 1.5 + 8;
    if (
      tightEnough &&
      (joined.includes(normExcerpt) ||
        normExcerpt.includes(joined) ||
        joinedStripped.includes(normExcerpt) ||
        normExcerpt.includes(joinedStripped))
    ) {
      return segments;
    }
  }

  const located = locateExcerptInSource(source, anchor.excerpt, envelopeHint);
  if (located) return [located];

  if (
    anchor.start >= 0 &&
    anchor.end > anchor.start &&
    anchor.end <= source.length &&
    envelopeMatchesExcerpt(source, anchor.start, anchor.end, anchor.excerpt)
  ) {
    return [{ start: anchor.start, end: anchor.end }];
  }

  return [];
}

/** Collect source offsets for each visible text node touched by the DOM range. */
export function collectSelectedSourceSegments(
  source: string,
  root: Element,
  range: Range,
): MdSourceSegment[] {
  const segments: MdSourceSegment[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode() as Text | null;

  while (textNode) {
    const bounds = getTextBoundsInRange(range, textNode);
    if (bounds) {
      const start = findOffsetInSource(source, textNode, bounds.start);
      const end = findOffsetInSource(source, textNode, bounds.end);
      if (start != null && end != null && start < end) {
        segments.push({ start, end });
      }
    }
    textNode = walker.nextNode() as Text | null;
  }

  return segments;
}

/** Map a DOM text selection to character offsets in the markdown source. */
export function mdRangeFromSelection(
  source: string,
  selection: Selection,
  root: HTMLElement,
): MdTextRange | null {
  const excerpt = selection.toString();
  if (!excerpt.trim()) return null;
  if (selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;

  const rawSegments = collectSelectedSourceSegments(source, root, range);
  const segments = mergeAdjacentMdSegments(rawSegments).filter((segment) =>
    segmentTextMatchesExcerpt(source, segment.start, segment.end, excerpt),
  );
  if (segments.length === 0) {
    const hint = anchorHintPosition({ start: 0, end: source.length, segments: rawSegments });
    const located = locateExcerptInSource(source, excerpt, hint);
    if (located) {
      return {
        start: located.start,
        end: located.end,
        excerpt: source.slice(located.start, located.end),
        segments: [located],
      };
    }
    const fallback = fallbackRangeFromExcerpt(source, excerpt);
    if (!fallback) return null;
    return { ...fallback, segments: [{ start: fallback.start, end: fallback.end }] };
  }

  const start = Math.min(...segments.map((segment) => segment.start));
  const end = Math.max(...segments.map((segment) => segment.end));
  return {
    start,
    end,
    excerpt,
    segments,
  };
}

function findAllIndices(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const indices: number[] = [];
  let from = 0;
  while (from < haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) break;
    indices.push(idx);
    from = idx + Math.max(1, needle.length);
  }
  return indices;
}

function fallbackRangeFromExcerpt(
  source: string,
  excerpt: string,
): { start: number; end: number; excerpt: string } | null {
  const candidates = [
    excerpt,
    excerpt.trim(),
    excerpt.replace(/\u00a0/g, ' '),
    excerpt.replace(/\s+/g, ' ').trim(),
  ];
  const seen = new Set<string>();
  for (const needle of candidates) {
    if (!needle || seen.has(needle)) continue;
    seen.add(needle);
    const indices = findAllIndices(source, needle);
    if (indices.length === 1) {
      const start = indices[0]!;
      const end = start + needle.length;
      return { start, end, excerpt: source.slice(start, end) };
    }
  }
  return null;
}

function findAnnotatedOffsetRoot(node: Node | null): Element | null {
  let current: Node | null = node;
  if (current?.nodeType === Node.TEXT_NODE) {
    current = current.parentElement;
  }
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    const element = current as Element;
    if (element.hasAttribute('data-md-offset-start')) return element;
    current = element.parentElement;
  }
  return null;
}

/** Character offset of a DOM point within an annotated offset root (handles split text nodes). */
function textOffsetInAnnotatedRoot(
  root: Element,
  targetNode: Node,
  targetOffset: number,
): number | null {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let accumulated = 0;
  for (
    let textNode = walker.nextNode() as Text | null;
    textNode;
    textNode = walker.nextNode() as Text | null
  ) {
    if (textNode === targetNode) {
      return accumulated + targetOffset;
    }
    accumulated += textNode.length;
  }
  return null;
}

function findOffsetInSource(
  _source: string,
  node: Node | null,
  offset: number,
): number | null {
  if (!node) return null;

  if (node.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element;
    const startAttr = element.getAttribute('data-md-offset-start');
    if (startAttr != null) {
      const base = Number.parseInt(startAttr, 10);
      if (!Number.isNaN(base)) return base + offset;
    }
  }

  const root = findAnnotatedOffsetRoot(node);
  if (!root) return null;

  const base = Number.parseInt(root.getAttribute('data-md-offset-start') ?? '', 10);
  if (Number.isNaN(base)) return null;

  const inner = textOffsetInAnnotatedRoot(root, node, offset);
  if (inner == null) return null;
  return base + inner;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapWithOffset(text: string, offset: number | undefined): string {
  const escaped = escapeHtml(text);
  if (offset == null || !Number.isFinite(offset)) return escaped;
  return `<span data-md-offset-start="${offset}">${escaped}</span>`;
}

function annotateTokens(
  source: string,
  tokens: Token[],
  from: number,
  max?: number,
): number {
  let pos = from;
  for (const token of tokens) {
    pos = annotateToken(source, token, pos, max);
  }
  return pos;
}

function annotateToken(
  source: string,
  token: Token,
  from: number,
  max?: number,
): number {
  const raw = token.raw;
  if (!raw) return from;

  const limit = max ?? source.length;
  let idx = -1;
  for (let i = from; i <= limit - raw.length; i++) {
    if (source.startsWith(raw, i)) {
      idx = i;
      break;
    }
  }
  if (idx < 0) {
    idx = source.indexOf(raw, from);
    if (idx < 0 || idx + raw.length > limit) return from;
  }

  (token as AnnotatedToken).mdOffset = idx;
  const end = idx + raw.length;

  if (token.type === 'table') {
    const table = token as Tokens.Table;
    let inner = idx;
    for (const cell of table.header) {
      if (cell.tokens.length > 0) {
        inner = annotateTokens(source, cell.tokens, inner, end);
      }
    }
    for (const row of table.rows) {
      for (const cell of row) {
        if (cell.tokens.length > 0) {
          inner = annotateTokens(source, cell.tokens, inner, end);
        }
      }
    }
    return end;
  }

  if (token.type === 'list') {
    const list = token as Tokens.List;
    let inner = idx;
    for (const item of list.items) {
      inner = annotateToken(source, item, inner, end);
    }
    return end;
  }

  if ('tokens' in token && Array.isArray(token.tokens) && token.tokens.length > 0) {
    annotateTokens(source, token.tokens, idx, end);
  }
  return end;
}

function createOffsetRenderer(): Renderer {
  const renderer = new Renderer();

  const renderInline = function (this: Renderer, tokens: Token[]) {
    return this.parser.parseInline(tokens);
  };

  renderer.text = function (token: Tokens.Text | Tokens.Escape) {
    const annotated = token as Tokens.Text & { mdOffset?: number };
    return wrapWithOffset(annotated.text, annotated.mdOffset);
  };

  renderer.strong = function (token: Tokens.Strong) {
    return `<strong>${renderInline.call(this, token.tokens)}</strong>`;
  };

  renderer.em = function (token: Tokens.Em) {
    return `<em>${renderInline.call(this, token.tokens)}</em>`;
  };

  renderer.del = function (token: Tokens.Del) {
    return `<del>${renderInline.call(this, token.tokens)}</del>`;
  };

  renderer.link = function (token: Tokens.Link) {
    const href = escapeHtml(token.href);
    const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
    return `<a href="${href}"${title}>${renderInline.call(this, token.tokens)}</a>`;
  };

  renderer.codespan = function (token: Tokens.Codespan) {
    const annotated = token as Tokens.Codespan & { mdOffset?: number };
    const ticks = annotated.raw.match(/^`+/)?.[0].length ?? 1;
    const textStart =
      annotated.mdOffset != null ? annotated.mdOffset + ticks : undefined;
    return `<code>${wrapWithOffset(annotated.text, textStart)}</code>`;
  };

  renderer.code = function (token: Tokens.Code) {
    const annotated = token as Tokens.Code & { mdOffset?: number };
    const newline = annotated.raw.indexOf('\n');
    const contentStart =
      annotated.mdOffset != null && newline >= 0
        ? annotated.mdOffset + newline + 1
        : annotated.mdOffset;
    const attr =
      contentStart != null ? ` data-md-offset-start="${contentStart}"` : '';
    return `<pre><code${attr}>${escapeHtml(annotated.text)}</code></pre>\n`;
  };

  return renderer;
}

/** Render markdown with data-md-offset-start on text nodes for selection mapping. */
export function parseMarkdownWithOffsets(source: string): string {
  const tokens = marked.lexer(source);
  annotateTokens(source, [...tokens], 0);
  return marked.parser(tokens, { renderer: createOffsetRenderer() }) as string;
}

function expandHighlightParts(range: MdHighlightRange): MdSourceSegment[] {
  if (range.segments?.length) return range.segments;
  if (range.start >= 0 && range.end > range.start) {
    return [{ start: range.start, end: range.end }];
  }
  return [];
}

function highlightSourceSegmentInRoot(
  root: Element,
  source: string,
  start: number,
  end: number,
  className: string,
  commentId?: string,
): void {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const wraps: Array<{ node: Text; localStart: number; localEnd: number }> = [];
  let current = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    const nodeStart = findOffsetInSource(source, textNode, 0);
    if (nodeStart != null) {
      const nodeEnd = nodeStart + textNode.length;
      const overlapStart = Math.max(start, nodeStart);
      const overlapEnd = Math.min(end, nodeEnd);
      if (overlapStart < overlapEnd) {
        wraps.push({
          node: textNode,
          localStart: overlapStart - nodeStart,
          localEnd: overlapEnd - nodeStart,
        });
      }
    }
    current = walker.nextNode();
  }

  for (const wrap of wraps.sort((a, b) => b.localStart - a.localStart)) {
    wrapSingleTextNode(wrap.node, wrap.localStart, wrap.localEnd, className, commentId);
  }
}

function applySourceRangeHighlightsToOffsetHtml(
  html: string,
  source: string,
  ranges: MdHighlightRange[],
): string {
  if (ranges.length === 0) return html;

  const doc = new DOMParser().parseFromString(`<div id="md-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('md-root');
  if (!root) return html;

  const fencedBlocks = findFencedCodeBlocks(source);
  const inlineSpans = findInlineCodeSpans(source, fencedBlocks);
  // Map each fenced block to its DOM <pre><code> element by matching textContent.
  // We cannot rely on array index (marked may render extra <pre><code> blocks from
  // indented fences inside list items) or on data-md-offset-start (annotateToken
  // fails to locate indented fence raw in source, so the attribute may be wrong).
  const domFencedCodes = Array.from(root.querySelectorAll('pre > code'));
  // Each entry stores the DOM element and the common indent stripped by marked.
  const fencedCodeByBlock = new Map<number, { el: Element; strippedIndent: number }>();
  for (const block of fencedBlocks) {
    const blockText = source.slice(block.contentStart, block.contentEnd);
    const directMatch = domFencedCodes.find((el) => {
      const t = el.textContent ?? '';
      return t === blockText || t === blockText + '\n' || t.trimEnd() === blockText.trimEnd();
    });
    if (directMatch) {
      fencedCodeByBlock.set(block.contentStart, { el: directMatch, strippedIndent: 0 });
    } else {
      // marked strips leading indentation from indented fenced blocks —
      // retry by de-indenting the block text (remove common indent prefix).
      const lines = blockText.split('\n');
      const nonEmpty = lines.filter((l) => l.trim().length > 0);
      if (nonEmpty.length > 0) {
        const commonIndent = nonEmpty.reduce((min, l) => {
          const ind = l.match(/^ */)?.[0].length ?? 0;
          return Math.min(min, ind);
        }, Infinity);
        if (commonIndent > 0) {
          const deindented = lines.map((l) => l.slice(commonIndent)).join('\n');
          const indentMatch = domFencedCodes.find((el) => {
            const t = el.textContent ?? '';
            return t === deindented || t === deindented + '\n' || t.trimEnd() === deindented.trimEnd();
          });
          if (indentMatch) {
            fencedCodeByBlock.set(block.contentStart, { el: indentMatch, strippedIndent: commonIndent });
          }
        }
      }
    }
  }
  const inlineCodes = Array.from(root.querySelectorAll('code')).filter(
    (el) => !el.closest('pre'),
  );

  const sorted = [...ranges]
    .filter((r) => r.start >= 0 && r.end > r.start && r.end <= source.length)
    .sort((a, b) => b.start - a.start);

  for (const range of sorted) {
    const cls = range.className ?? 'md-comment-highlight';
    const commentId = range.commentId;
    for (const part of expandHighlightParts(range)) {
      const slice: MdHighlightRange = { ...part, className: cls, commentId };
      const kind = classifyHighlightRange(slice, fencedBlocks, inlineSpans);

      if (kind === 'fenced') {
        const block = fencedBlocks.find(
          (b) => part.start >= b.contentStart && part.end <= b.contentEnd,
        );
        if (!block) continue;
        const entry = fencedCodeByBlock.get(block.contentStart);
        if (!entry) continue;
        const relStart = part.start - block.contentStart;
        const relEnd = part.end - block.contentStart;
        let adjStart = relStart;
        let adjEnd = relEnd;
        if (entry.strippedIndent > 0) {
          // Build a char-by-char mapping from original block offset to de-indented offset.
          // marked strips `strippedIndent` leading spaces from every line, so a naive
          // "subtract strippedIndent * newlineCount" formula is wrong when the excerpt
          // itself does not start at column 0. Walk each character instead.
          const blockText = source.slice(block.contentStart, block.contentEnd);
          const lines = blockText.split('\n');
          const mapping = new Int32Array(blockText.length + 1);
          let origPos = 0;
          let deindPos = 0;
          for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            for (let ci = 0; ci < line.length; ci++) {
              mapping[origPos] = deindPos;
              origPos++;
              if (ci >= entry.strippedIndent) deindPos++;
            }
            if (li < lines.length - 1) {
              mapping[origPos] = deindPos;
              origPos++;
              deindPos++;
            }
          }
          mapping[origPos] = deindPos;
          adjStart = mapping[relStart] ?? relStart;
          adjEnd = mapping[relEnd] ?? relEnd;
        }
        highlightTextInElement(entry.el, adjStart, adjEnd, cls, commentId);
        continue;
      }

      if (kind === 'inline') {
        const span = inlineSpans.find(
          (s) => part.start >= s.contentStart && part.end <= s.contentEnd,
        );
        if (!span) continue;
        const codeEl = inlineCodes[span.index];
        if (!codeEl) continue;
        highlightTextInElement(
          codeEl,
          part.start - span.contentStart,
          part.end - span.contentStart,
          cls,
          commentId,
        );
        continue;
      }

      highlightSourceSegmentInRoot(root, source, part.start, part.end, cls, commentId);
    }
  }

  return root.innerHTML;
}

/** Markdown HTML for comment-link mode: stable source offsets + optional highlights. */
export function renderSelectableMarkdown(
  source: string,
  ranges: MdHighlightRange[] = [],
): string {
  let html = parseMarkdownWithOffsets(source);
  if (ranges.length > 0) {
    html = applySourceRangeHighlightsToOffsetHtml(html, source, ranges);
  }
  return html;
}

export const MD_PREVIEW_SANITIZE_ATTRS = ['class', 'data-md-offset-start', 'data-comment-id'] as const;

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

    // Allow up to 3 spaces of indentation (CommonMark spec for fenced code blocks)
    const openMatch = line.match(/^( {0,3})(`{3,}|~{3,})(?:\s*[\w-]+)?\s*$/);
    if (openMatch) {
      const indent = openMatch[1];
      const fenceChar = openMatch[2][0];
      const minLen = openMatch[2].length;
      const contentStart = lineEndPos === len ? len : lineEndPos + 1;
      let j = contentStart;
      let closed = false;

      while (j < len) {
        const closeLineStart = j;
        const closeLineEnd = source.indexOf('\n', j);
        const closeLineEndPos = closeLineEnd === -1 ? len : closeLineEnd;
        const closeLine = source.slice(closeLineStart, closeLineEndPos);
        // Close fence may have the same indent prefix stripped (CommonMark allows it)
        const stripped = closeLine.startsWith(indent) ? closeLine.slice(indent.length) : closeLine;
        const closePattern = new RegExp(`^[${fenceChar}]{${minLen},}\\s*$`);
        if (closePattern.test(stripped)) {
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
  commentId?: string,
): void {
  if (start >= end) return;

  const doc = node.ownerDocument;
  const mark = doc.createElement('mark');
  mark.className = className;
  if (commentId) {
    mark.setAttribute('data-comment-id', commentId);
  }
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
  commentId?: string,
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
  if (commentId) {
    mark.setAttribute('data-comment-id', commentId);
  }

  if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
    wrapSingleTextNode(range.startContainer as Text, range.startOffset, range.endOffset, className, commentId);
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
