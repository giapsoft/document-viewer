import { formatPageComponentCount } from '../lib/readState';

interface PageLabelProps {
  pageName: string;
  pageId: string;
  fileName?: string;
  componentCount?: number;
  /** When set with componentCount, label shows unread/total */
  unreadCount?: number | null;
  className?: string;
  /** Same group as selection — blue page name. Takes precedence over linked elsewhere (orange). */
  nameHighlight?: 'related' | 'main-group';
  /** Single-line title for compact headers (hides page id line). */
  compact?: boolean;
}

/** pageName on top; pageId below only when it differs from pageName. */
export function PageLabel({
  pageName,
  pageId,
  fileName,
  componentCount,
  unreadCount = null,
  className = '',
  nameHighlight,
  compact = false,
}: PageLabelProps) {
  const showId = pageName !== pageId;
  const countLabel =
    componentCount != null ? formatPageComponentCount(componentCount, unreadCount) : null;
  const countNote =
    componentCount != null
      ? unreadCount != null
        ? ` · ${unreadCount}/${componentCount} unread/total`
        : ` · ${componentCount} component${componentCount === 1 ? '' : 's'}`
      : '';
  const title = fileName
    ? `${fileName} · id: ${pageId}${countNote}`
    : `id: ${pageId}${countNote}`;

  const nameClassName =
    nameHighlight === 'main-group'
      ? ' page-label-name-main-group'
      : nameHighlight === 'related'
        ? ' page-label-name-highlighted'
        : '';

  const countClassName =
    unreadCount != null && unreadCount > 0 ? ' page-label-count-has-unread' : '';

  return (
    <span className={`page-label-stack ${className}`.trim()} title={title}>
      <span className={`page-label-name${nameClassName}`}>
        {pageName}
        {countLabel != null && (
          <span className={`page-label-count${countClassName}`}> ({countLabel})</span>
        )}
      </span>
      {showId && !compact && <span className="page-label-id">{pageId}</span>}
    </span>
  );
}
