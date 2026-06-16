import { mdRangeFromSelection, lexerWithSourceOffsets, type MdTextRange } from './mdSelection';
import { resolveMarkdownComponentLink } from './mdComponentLinks';
import type { LoadedProject } from '../types';
import type { Token, Tokens } from 'marked';

export type MdLinkInsertResult =
  | { ok: true; content: string }
  | { ok: false; reason: string };

interface AnnotatedComponentLinkSpan {
  start: number;
  end: number;
  label: string;
}

function extractLinkLabelFromRaw(raw: string): string {
  const close = raw.indexOf('](');
  if (close <= 0) return raw;
  return raw.slice(1, close);
}

function collectAnnotatedComponentLinks(
  tokens: Token[],
  sourcePageFile: string,
  project: LoadedProject,
  out: AnnotatedComponentLinkSpan[],
): void {
  for (const token of tokens) {
    if (token.type === 'link') {
      const link = token as Tokens.Link & { mdOffset?: number };
      if (link.mdOffset == null || !link.raw) continue;
      const componentId = resolveMarkdownComponentLink(link.href, sourcePageFile, project);
      if (!componentId) continue;
      out.push({
        start: link.mdOffset,
        end: link.mdOffset + link.raw.length,
        label: extractLinkLabelFromRaw(link.raw),
      });
      continue;
    }

    if (token.type === 'list') {
      for (const item of (token as Tokens.List).items) {
        if (item.tokens?.length) {
          collectAnnotatedComponentLinks(item.tokens, sourcePageFile, project, out);
        }
      }
    }

    if (token.type === 'table') {
      const table = token as Tokens.Table;
      for (const cell of table.header) {
        if (cell.tokens?.length) {
          collectAnnotatedComponentLinks(cell.tokens, sourcePageFile, project, out);
        }
      }
      for (const row of table.rows) {
        for (const cell of row) {
          if (cell.tokens?.length) {
            collectAnnotatedComponentLinks(cell.tokens, sourcePageFile, project, out);
          }
        }
      }
    }

    const nested = (token as { tokens?: Token[] }).tokens;
    if (nested?.length) {
      collectAnnotatedComponentLinks(nested, sourcePageFile, project, out);
    }
  }
}

function findComponentLinkAtOffset(
  source: string,
  offset: number,
  sourcePageFile: string,
  project: LoadedProject,
): AnnotatedComponentLinkSpan | null {
  const links: AnnotatedComponentLinkSpan[] = [];
  collectAnnotatedComponentLinks(
    lexerWithSourceOffsets(source),
    sourcePageFile,
    project,
    links,
  );
  return links.find((link) => offset >= link.start && offset < link.end) ?? null;
}

/** Minimum source offset of visible text inside a rendered component-link anchor. */
export function getComponentLinkLabelStartOffset(linkEl: Element): number | null {
  const nodes = linkEl.querySelectorAll('[data-md-offset-start]');
  let min: number | null = null;
  for (const node of nodes) {
    const value = Number.parseInt(node.getAttribute('data-md-offset-start') ?? '', 10);
    if (Number.isNaN(value)) continue;
    if (min === null || value < min) min = value;
  }
  return min;
}

/** Replace `[label](componentId)` at offset with plain `label` markdown. */
export function unwrapMdComponentLinkAtOffset(
  source: string,
  offset: number,
  sourcePageFile: string,
  project: LoadedProject,
): MdLinkInsertResult {
  const link = findComponentLinkAtOffset(source, offset, sourcePageFile, project);
  if (!link) {
    return { ok: false, reason: 'Could not find component link in markdown.' };
  }
  return {
    ok: true,
    content: source.slice(0, link.start) + link.label + source.slice(link.end),
  };
}

/** Wrap a markdown source range with `[text](componentId)` in-app link syntax. */
export function wrapMdRangeWithComponentLink(
  source: string,
  range: MdTextRange,
  targetComponentId: string,
): MdLinkInsertResult {
  const trimmedTarget = targetComponentId.trim();
  if (!trimmedTarget) {
    return { ok: false, reason: 'Target component id is empty.' };
  }

  const { start, end } = range;
  if (start < 0 || end > source.length || start >= end) {
    return { ok: false, reason: 'Invalid text range.' };
  }

  const linkText = source.slice(start, end);
  if (!linkText.trim()) {
    return { ok: false, reason: 'Selection is empty.' };
  }

  if (/[\[\]]/.test(linkText)) {
    return {
      ok: false,
      reason: 'Selection contains [ or ]; add the link manually in markdown.',
    };
  }

  const replacement = `[${linkText}](${trimmedTarget})`;
  return {
    ok: true,
    content: source.slice(0, start) + replacement + source.slice(end),
  };
}

/** Read the current DOM text selection inside an md component preview. */
export function getMdSelectionForComponent(
  componentId: string,
  source: string,
): MdTextRange | null {
  const root = document.querySelector(
    `[data-component-id="${CSS.escape(componentId)}"] .component-md`,
  );
  if (!root) return null;

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  if (!selection.anchorNode || !root.contains(selection.anchorNode)) return null;
  if (!selection.focusNode || !root.contains(selection.focusNode)) return null;

  return mdRangeFromSelection(source, selection, root as HTMLElement);
}
