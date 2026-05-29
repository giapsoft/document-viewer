interface PageLabelProps {
  pageName: string;
  pageId: string;
  fileName?: string;
  className?: string;
}

/** pageName on top; pageId below only when it differs from pageName. */
export function PageLabel({ pageName, pageId, fileName, className = '' }: PageLabelProps) {
  const showId = pageName !== pageId;
  const title = fileName ? `${fileName} · id: ${pageId}` : `id: ${pageId}`;

  return (
    <span className={`page-label-stack ${className}`.trim()} title={title}>
      <span className="page-label-name">{pageName}</span>
      {showId && <span className="page-label-id">{pageId}</span>}
    </span>
  );
}
