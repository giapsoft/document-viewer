interface PageLabelProps {
  pageName: string;
  pageId: string;
  fileName?: string;
  componentCount?: number;
  className?: string;
  /** Linked selection exists on this page — style page name only. */
  nameHighlighted?: boolean;
}

/** pageName on top; pageId below only when it differs from pageName. */
export function PageLabel({
  pageName,
  pageId,
  fileName,
  componentCount,
  className = '',
  nameHighlighted = false,
}: PageLabelProps) {
  const showId = pageName !== pageId;
  const countNote =
    componentCount != null ? ` · ${componentCount} component${componentCount === 1 ? '' : 's'}` : '';
  const title = fileName
    ? `${fileName} · id: ${pageId}${countNote}`
    : `id: ${pageId}${countNote}`;

  return (
    <span className={`page-label-stack ${className}`.trim()} title={title}>
      <span
        className={`page-label-name${nameHighlighted ? ' page-label-name-highlighted' : ''}`}
      >
        {pageName}
        {componentCount != null && (
          <span className="page-label-count"> ({componentCount})</span>
        )}
      </span>
      {showId && <span className="page-label-id">{pageId}</span>}
    </span>
  );
}
