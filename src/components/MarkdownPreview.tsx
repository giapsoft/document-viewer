import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { applyMarkdownHighlights, mdRangeFromSelection } from '../lib/mdSelection';

interface MarkdownPreviewProps {
  source: string;
  className?: string;
  highlightRanges?: Array<{ start: number; end: number; className?: string }>;
  selectable?: boolean;
  onTextSelect?: (range: { start: number; end: number; excerpt: string }) => void;
}

export function MarkdownPreview({
  source,
  className = '',
  highlightRanges = [],
  selectable = false,
  onTextSelect,
}: MarkdownPreviewProps) {
  const html = DOMPurify.sanitize(
    applyMarkdownHighlights(source, highlightRanges, (markdown) =>
      marked.parse(markdown, { async: false }) as string,
    ),
    { ADD_ATTR: ['class'] },
  );

  return (
    <div
      className={`component-md ${selectable ? 'component-md-selectable' : ''} ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
      onMouseUp={() => {
        if (!selectable || !onTextSelect) return;
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) return;
        const range = mdRangeFromSelection(source, selection);
        if (!range) return;
        onTextSelect(range);
        selection.removeAllRanges();
      }}
    />
  );
}
