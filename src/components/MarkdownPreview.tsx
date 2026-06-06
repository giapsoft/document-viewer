import { useEffect, useMemo, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import {
  MD_PREVIEW_SANITIZE_ATTRS,
  mdRangeFromSelection,
  renderSelectableMarkdown,
} from '../lib/mdSelection';

interface MarkdownPreviewProps {
  source: string;
  className?: string;
  highlightRanges?: Array<{ start: number; end: number; className?: string }>;
  selectable?: boolean;
  onTextSelect?: (range: import('../lib/mdSelection').MdTextRange) => void;
}

export function MarkdownPreview({
  source,
  className = '',
  highlightRanges = [],
  selectable = false,
  onTextSelect,
}: MarkdownPreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    const raw =
      selectable || highlightRanges.length > 0
        ? renderSelectableMarkdown(source, highlightRanges)
        : (marked.parse(source, { async: false }) as string);
    return DOMPurify.sanitize(raw, { ADD_ATTR: MD_PREVIEW_SANITIZE_ATTRS });
  }, [source, highlightRanges, selectable]);

  useEffect(() => {
    if (!selectable) return;

    const onMouseDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root?.contains(event.target as Node)) return;
      // Hide preview marks via CSS only — no DOM rebuild so drag-select still works.
      root.classList.add('is-dragging');
    };

    const onMouseUp = () => {
      const root = rootRef.current;
      root?.classList.remove('is-dragging');

      if (!root || !onTextSelect) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      if (!selection.anchorNode || !root.contains(selection.anchorNode)) return;
      if (!selection.focusNode || !root.contains(selection.focusNode)) return;

      const range = mdRangeFromSelection(source, selection, root);
      if (!range) return;

      onTextSelect(range);
      selection.removeAllRanges();
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [selectable, onTextSelect, source]);

  return (
    <div
      ref={rootRef}
      className={`component-md ${selectable ? 'component-md-selectable' : ''} ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
