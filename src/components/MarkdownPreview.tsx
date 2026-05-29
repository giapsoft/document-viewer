import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface MarkdownPreviewProps {
  source: string;
  className?: string;
}

export function MarkdownPreview({ source, className = '' }: MarkdownPreviewProps) {
  const html = DOMPurify.sanitize(
    marked.parse(source, { async: false }) as string,
  );

  return (
    <div
      className={`component-md ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
