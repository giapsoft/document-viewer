import { useEffect, useMemo, useRef } from 'react';
import DOMPurify from 'dompurify';
import {
  MD_PREVIEW_SANITIZE_ATTRS,
  mdRangeFromSelection,
  renderSelectableMarkdown,
  type MdHighlightRange,
} from '../lib/mdSelection';

interface MarkdownPreviewProps {
  source: string;
  className?: string;
  highlightRanges?: MdHighlightRange[];
  selectable?: boolean;
  resolveComponentLink?: (href: string) => string | null;
  onTextSelect?: (range: import('../lib/mdSelection').MdTextRange) => void;
  onCommentMarkClick?: (commentId: string) => void;
  onComponentLinkClick?: (componentId: string) => void;
}

export function MarkdownPreview({
  source,
  className = '',
  highlightRanges = [],
  selectable = false,
  resolveComponentLink,
  onTextSelect,
  onCommentMarkClick,
  onComponentLinkClick,
}: MarkdownPreviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const html = useMemo(() => {
    const raw = renderSelectableMarkdown(source, highlightRanges, resolveComponentLink);
    return DOMPurify.sanitize(raw, { ADD_ATTR: [...MD_PREVIEW_SANITIZE_ATTRS] });
  }, [source, highlightRanges, resolveComponentLink]);

  useEffect(() => {
    if (!selectable) return;

    const onMouseDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (!root?.contains(event.target as Node)) return;
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

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handleClick = (event: MouseEvent) => {
      const componentLink = (event.target as HTMLElement).closest(
        'a.md-component-link[data-component-id]',
      );
      if (componentLink && root.contains(componentLink)) {
        event.preventDefault();
        event.stopPropagation();
        const componentId = componentLink.getAttribute('data-component-id');
        if (componentId && onComponentLinkClick) {
          onComponentLinkClick(componentId);
        }
        return;
      }

      if (!onCommentMarkClick) return;
      const mark = (event.target as HTMLElement).closest('[data-comment-id]');
      if (!mark || !root.contains(mark)) return;
      event.stopPropagation();
      const commentId = mark.getAttribute('data-comment-id');
      if (commentId) onCommentMarkClick(commentId);
    };

    root.addEventListener('click', handleClick);
    return () => root.removeEventListener('click', handleClick);
  }, [onComponentLinkClick, onCommentMarkClick]);

  return (
    <div
      ref={rootRef}
      className={`component-md ${selectable ? 'component-md-selectable' : ''} ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
