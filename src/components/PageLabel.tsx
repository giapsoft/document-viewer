interface PageLabelProps {
  pageName: string;
  pageId: string;
  fileName?: string;
  componentCount?: number;
  className?: string;
  /** Linked selection on this page — orange page name. Main group overrides with blue. */
  nameHighlight?: 'related' | 'main-group';
}

/** pageName on top; pageId below only when it differs from pageName. */
export function PageLabel({
  pageName,
  pageId,
  fileName,
  componentCount,
  className = '',
  nameHighlight,
}: PageLabelProps) {
  const showId = pageName !== pageId;
  const countNote =
    componentCount != null ? ` · ${componentCount} component${componentCount === 1 ? '' : 's'}` : '';
  const title = fileName
    ? `${fileName} · id: ${pageId}${countNote}`
    : `id: ${pageId}${countNote}`;

  const nameClassName =
    nameHighlight === 'main-group'
      ? ' page-label-name-main-group'
      : nameHighlight === 'related'
        ? ' page-label-name-highlighted'
        : '';

  return (
    <span className={`page-label-stack ${className}`.trim()} title={title}>
      <span className={`page-label-name${nameClassName}`}>
        {pageName}
        {componentCount != null && (
          <span className="page-label-count"> ({componentCount})</span>
        )}
      </span>
      {showId && <span className="page-label-id">{pageId}</span>}
    </span>
  );
}
