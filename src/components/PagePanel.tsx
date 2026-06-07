import {
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type {
  AppStyles,
  CommentAnchor,
  Component,
  DocComment,
  LoadedProject,
  PageData,
  SelectionState,
} from '../types';
import { activeComments } from '../lib/comments';
import { isTypingTarget } from '../lib/keyboard';
import { resolveComponentForDisplay, isTextType } from '../lib/componentDisplay';
import { PageLabel } from './PageLabel';
import { MarkdownPreview } from './MarkdownPreview';
import { COMMENT_LINK_PREVIEW_HIGHLIGHT, LINK_MODE_HIGHLIGHT } from '../lib/styles';
import { scheduleScrollToComponent, scheduleScrollToMdCommentHighlight } from '../lib/scrollIntoContainer';
import { getPageScrollTop, setPageScrollTop } from '../lib/pageScrollMemory';
import {
  getFirstHighlightedComponentId,
  getHighlightedIdsForPage,
  getHighlightNavTargetsForPage,
} from '../lib/selectionHighlight';
import { ScrollbarMarkers } from './ScrollbarMarkers';
import type { MdHighlightRange, MdTextRange } from '../lib/mdSelection';
import { resolveMdHighlightSegments } from '../lib/mdSelection';

function mdAnchorToHighlightRanges(
  anchor: Extract<NonNullable<DocComment['anchor']>, { kind: 'md-range' }>,
  className: string,
  mdSource: string,
  commentId?: string,
): MdHighlightRange[] {
  const segments = resolveMdHighlightSegments(mdSource, anchor);
  if (segments.length === 0) return [];
  return [
    {
      start: Math.min(...segments.map((segment) => segment.start)),
      end: Math.max(...segments.map((segment) => segment.end)),
      segments,
      className,
      commentId,
    },
  ];
}

function getPreviewMdHighlightRanges(
  preview: CommentAnchor | null | undefined,
  componentId: string,
  mdSource: string,
): MdHighlightRange[] {
  if (!preview || preview.kind !== 'md-range' || preview.componentId !== componentId) {
    return [];
  }
  return mdAnchorToHighlightRanges(
    preview,
    'md-comment-highlight md-comment-highlight-preview',
    mdSource,
  );
}

function mdHighlightClassName(
  commentId: string,
  highlightCommentId: string | null,
  outstandingCommentId: string | null,
): string {
  if (commentId === outstandingCommentId) {
    return 'md-comment-highlight md-comment-highlight-outstanding';
  }
  if (commentId === highlightCommentId) {
    return 'md-comment-highlight md-comment-highlight-focused';
  }
  return 'md-comment-highlight';
}

function getMdHighlightRanges(
  comments: DocComment[],
  componentId: string,
  mdSource: string,
  highlightCommentId: string | null,
  outstandingCommentId: string | null,
): MdHighlightRange[] {
  const mdComments = comments.filter(
    (comment) =>
      comment.anchor?.kind === 'md-range' &&
      comment.anchor.componentId === componentId,
  );

  if (mdComments.length === 1) {
    const comment = mdComments[0]!;
    const anchor = comment.anchor as Extract<
      NonNullable<DocComment['anchor']>,
      { kind: 'md-range' }
    >;
    return mdAnchorToHighlightRanges(
      anchor,
      mdHighlightClassName(comment.id, highlightCommentId, outstandingCommentId),
      mdSource,
      comment.id,
    );
  }

  if (highlightCommentId) {
    const highlighted = comments.find((comment) => comment.id === highlightCommentId);
    if (
      highlighted?.anchor?.kind === 'md-range' &&
      highlighted.anchor.componentId === componentId
    ) {
      return mdAnchorToHighlightRanges(
        highlighted.anchor,
        mdHighlightClassName(highlightCommentId, highlightCommentId, outstandingCommentId),
        mdSource,
        highlightCommentId,
      );
    }
  }

  return mdComments.flatMap((comment) => {
    const anchor = comment.anchor as Extract<
      NonNullable<DocComment['anchor']>,
      { kind: 'md-range' }
    >;
    return mdAnchorToHighlightRanges(
      anchor,
      mdHighlightClassName(comment.id, highlightCommentId, outstandingCommentId),
      mdSource,
      comment.id,
    );
  });
}

function isPreviewComponentAnchor(
  preview: CommentAnchor | null | undefined,
  componentId: string,
): boolean {
  return preview?.kind === 'component' && preview.componentId === componentId;
}

function hasComponentCommentAnchor(
  comments: DocComment[],
  componentId: string,
  highlightCommentId: string | null,
): boolean {
  if (highlightCommentId) {
    const highlighted = comments.find((comment) => comment.id === highlightCommentId);
    return (
      highlighted?.anchor?.kind === 'component' &&
      highlighted.anchor.componentId === componentId
    );
  }

  return comments.some(
    (comment) =>
      comment.anchor?.kind === 'component' &&
      comment.anchor.componentId === componentId,
  );
}

interface ComponentBlockProps {
  component: Component;
  project: LoadedProject;
  styles: AppStyles;
  pageFile: string;
  selection: SelectionState | null;
  highlightedIds: Set<string> | null;
  pendingImageNames?: ReadonlySet<string>;
  linkMode?: boolean;
  linkGroupMembers?: Set<string>;
  commentLinkMode?: boolean;
  commentLinkPreviewAnchor?: CommentAnchor | null;
  mdHighlightRanges?: MdHighlightRange[];
  hasComponentCommentAnchor?: boolean;
  onSelect: (componentId: string, pageFile: string) => void;
  onCommentLinkComponent?: (componentId: string, pageFile: string) => void;
  onCommentLinkMdRange?: (
    componentId: string,
    pageFile: string,
    range: MdTextRange,
  ) => void;
  onCommentMarkClick?: (commentId: string, componentId: string, pageFile: string) => void;
  registerRef: (id: string, el: HTMLElement | null) => void;
}

interface ComponentShellProps {
  component: Component;
  highlightKind: 'none' | 'primary' | 'related' | 'link' | 'comment-link';
  isDimmed: boolean;
  className: string;
  style: CSSProperties;
  onSelect: (componentId: string, pageFile: string) => void;
  onCommentLinkComponent?: (componentId: string, pageFile: string) => void;
  commentLinkMode?: boolean;
  pageFile: string;
  registerRef: (id: string, el: HTMLElement | null) => void;
  children: ReactNode;
}

function ComponentShell({
  component,
  highlightKind,
  isDimmed,
  className,
  style,
  onSelect,
  onCommentLinkComponent,
  commentLinkMode = false,
  pageFile,
  registerRef,
  children,
}: ComponentShellProps) {
  return (
    <div
      ref={(el) => registerRef(component.id, el)}
      className={`component-block ${className} ${highlightKind !== 'none' ? 'selected' : ''} ${highlightKind === 'primary' ? 'selected-primary' : ''} ${highlightKind === 'related' ? 'selected-related' : ''} ${highlightKind === 'link' ? 'link-selected' : ''} ${highlightKind === 'comment-link' ? 'comment-link-preview' : ''} ${isDimmed ? 'dimmed' : ''}`}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        if (commentLinkMode && onCommentLinkComponent) {
          onCommentLinkComponent(component.id, pageFile);
          return;
        }
        onSelect(component.id, pageFile);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (isTypingTarget(e.target)) return;
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (commentLinkMode && onCommentLinkComponent) {
            onCommentLinkComponent(component.id, pageFile);
          } else {
            onSelect(component.id, pageFile);
          }
        }
      }}
    >
      {children}
    </div>
  );
}

export function ComponentBlock({
  component,
  project,
  styles,
  pageFile,
  selection,
  highlightedIds,
  linkMode = false,
  linkGroupMembers,
  pendingImageNames,
  commentLinkMode = false,
  commentLinkPreviewAnchor = null,
  mdHighlightRanges = [],
  hasComponentCommentAnchor = false,
  onSelect,
  onCommentLinkComponent,
  onCommentLinkMdRange,
  onCommentMarkClick,
  registerRef,
}: ComponentBlockProps) {
  const resolved = resolveComponentForDisplay(component, project.mdFiles);
  const mdSelectionHandledRef = useRef(false);

  const isCommentLinkPreview =
    commentLinkMode &&
    (isPreviewComponentAnchor(commentLinkPreviewAnchor, component.id) ||
      (commentLinkPreviewAnchor?.kind === 'md-range' &&
        commentLinkPreviewAnchor.componentId === component.id));

  const isLinkSelected = linkMode && (linkGroupMembers?.has(component.id) ?? false);
  const isPrimarySelected =
    !linkMode && !commentLinkMode && selection?.componentId === component.id;
  const isHighlighted = !linkMode && !commentLinkMode && (highlightedIds?.has(component.id) ?? false);
  const isRelatedSelected = isHighlighted && !isPrimarySelected;
  const isDimmed = commentLinkMode
    ? commentLinkPreviewAnchor != null && !isCommentLinkPreview
    : linkMode
      ? linkGroupMembers != null && linkGroupMembers.size > 0 && !isLinkSelected
      : selection !== null && !isHighlighted;

  const highlightKind: ComponentShellProps['highlightKind'] = commentLinkMode
    ? isCommentLinkPreview
      ? 'comment-link'
      : 'none'
    : linkMode
      ? isLinkSelected
        ? 'link'
        : 'none'
      : isPrimarySelected
        ? 'primary'
        : isRelatedSelected
          ? 'related'
          : 'none';

  const highlightStyle =
    highlightKind === 'primary'
      ? styles.selectedComponent
      : highlightKind === 'related'
        ? styles.linkedComponent
        : highlightKind === 'link'
          ? LINK_MODE_HIGHLIGHT
          : highlightKind === 'comment-link'
            ? COMMENT_LINK_PREVIEW_HIGHLIGHT
            : null;
  const statusStyle = styles.statuses[resolved.status];

  const shellStyle: CSSProperties = {
    backgroundColor: statusStyle.backgroundColor,
    ...(highlightStyle
      ? {
          borderColor: highlightStyle.borderColor,
          borderWidth: highlightStyle.borderWidth,
          borderStyle: highlightStyle.borderStyle,
        }
      : {}),
  };

  const shellProps = {
    component,
    highlightKind,
    isDimmed,
    onSelect,
    onCommentLinkComponent:
      resolved.type === 'md' && commentLinkMode
        ? (componentId: string, file: string) => {
            if (mdSelectionHandledRef.current) {
              mdSelectionHandledRef.current = false;
              return;
            }
            onCommentLinkComponent?.(componentId, file);
          }
        : onCommentLinkComponent,
    commentLinkMode,
    pageFile,
    registerRef,
  };

  const shellClassExtra =
    !commentLinkMode && hasComponentCommentAnchor ? ' comment-component-anchor' : '';

  if (resolved.type === 'img') {
    const src = project.imageUrls.get(resolved.content);
    const isPending = pendingImageNames?.has(resolved.content) ?? false;
    return (
      <ComponentShell
        {...shellProps}
        className={`component-img-wrap${shellClassExtra}`}
        style={shellStyle}
      >
        {src ? (
          <img src={src} alt={resolved.content} className="component-img" />
        ) : isPending ? (
          <span className="loading-image">Loading image…</span>
        ) : (
          <span className="broken-image">🖼 {resolved.content} (not found)</span>
        )}
      </ComponentShell>
    );
  }

  if (resolved.type === 'md') {
    return (
      <ComponentShell
        {...shellProps}
        className={`component-md-wrap${shellClassExtra}`}
        style={shellStyle}
      >
        {resolved.content.trim() ? (
          <MarkdownPreview
            source={resolved.content}
            highlightRanges={mdHighlightRanges}
            selectable={commentLinkMode}
            onTextSelect={(range) => {
              mdSelectionHandledRef.current = true;
              onCommentLinkMdRange?.(component.id, pageFile, range);
            }}
            onCommentMarkClick={
              commentLinkMode || linkMode
                ? undefined
                : (commentId) => onCommentMarkClick?.(commentId, component.id, pageFile)
            }
          />
        ) : (
          <span className="component-md-empty">Empty markdown</span>
        )}
      </ComponentShell>
    );
  }

  const typeStyle = isTextType(resolved.type) ? styles.type[resolved.type] : null;
  const displayContent =
    resolved.type === 'listItem' ? `• ${resolved.content}` : resolved.content;

  return (
    <ComponentShell
      {...shellProps}
      className={`component-text component-${resolved.type}${shellClassExtra}`}
      style={{
        ...shellStyle,
        fontSize: typeStyle?.fontSize,
        color: typeStyle?.color,
        paddingLeft: resolved.type === 'listItem' ? '1.25rem' : undefined,
      }}
    >
      {displayContent.split('\n').map((line, i) => (
        <span key={i}>
          {line}
          {i < displayContent.split('\n').length - 1 && <br />}
        </span>
      ))}
    </ComponentShell>
  );
}

function getFirstSelectedComponentId(
  page: PageData,
  selection: SelectionState | null,
  isCurrent: boolean,
  linkMode: boolean,
  linkGroupMembers?: Set<string>,
): string | null {
  if (linkMode) {
    if (!linkGroupMembers?.size) return null;
    for (const component of page.components) {
      if (linkGroupMembers.has(component.id)) return component.id;
    }
    return null;
  }

  if (!selection) return null;
  return getFirstHighlightedComponentId(page, selection, isCurrent);
}

function shouldSkipScrollRestore(
  page: PageData | undefined,
  scrollToComponentId: string | null,
  scrollNonce: number,
  isCurrent: boolean,
  selection: SelectionState | null,
  selectionScrollNonce: number,
  linkMode: boolean,
  linkGroupMembers?: Set<string>,
): boolean {
  if (
    scrollToComponentId &&
    scrollNonce > 0 &&
    page?.components.some((c) => c.id === scrollToComponentId)
  ) {
    return true;
  }

  if (linkMode) return false;

  if (!isCurrent && selectionScrollNonce > 0 && page) {
    const targetId = getFirstSelectedComponentId(
      page,
      selection,
      isCurrent,
      linkMode,
      linkGroupMembers,
    );
    if (targetId) return true;
  }

  return false;
}

interface PagePanelProps {
  pageFile: string;
  expanded: boolean;
  project: LoadedProject;
  isCurrent: boolean;
  selection: SelectionState | null;
  linkMode?: boolean;
  linkGroupMembers?: Set<string>;
  pendingImageNames?: ReadonlySet<string>;
  onToggle: () => void;
  onSelect: (componentId: string, pageFile: string) => void;
  onClearSelection: () => void;
  scrollToComponentId?: string | null;
  scrollNonce?: number;
  selectionScrollNonce?: number;
  commentLinkMode?: boolean;
  commentLinkPreviewAnchor?: CommentAnchor | null;
  commentAnchorHighlightId?: string | null;
  outstandingCommentId?: string | null;
  onCommentLinkComponent?: (componentId: string, pageFile: string) => void;
  onCommentLinkMdRange?: (
    componentId: string,
    pageFile: string,
    range: MdTextRange,
  ) => void;
  onCommentMarkClick?: (commentId: string, componentId: string, pageFile: string) => void;
}

export function PagePanel({
  pageFile,
  expanded,
  project,
  isCurrent,
  selection,
  linkMode = false,
  linkGroupMembers,
  pendingImageNames,
  onToggle,
  onSelect,
  onClearSelection,
  commentLinkMode = false,
  commentLinkPreviewAnchor = null,
  commentAnchorHighlightId = null,
  outstandingCommentId = null,
  onCommentLinkComponent,
  onCommentLinkMdRange,
  onCommentMarkClick,
  scrollToComponentId = null,
  scrollNonce = 0,
  selectionScrollNonce = 0,
}: PagePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const componentRefs = useRef<Map<string, HTMLElement>>(new Map());
  const handledScrollNonceRef = useRef(0);
  const handledAutoScrollKeyRef = useRef<string | null>(null);
  const wasExpandedRef = useRef(false);
  const page = project.pages.find((p) => p.fileName === pageFile);

  const registerRef = (id: string, el: HTMLElement | null) => {
    if (el) componentRefs.current.set(id, el);
    else componentRefs.current.delete(id);
  };

  const highlightedOnPage =
    !linkMode && selection && page
      ? getHighlightedIdsForPage(page, selection, isCurrent)
      : new Set<string>();

  const highlightNavTargets = useMemo(() => {
    if (!page || !selection || linkMode || commentLinkMode) return [];
    return getHighlightNavTargetsForPage(page, selection);
  }, [page, selection, linkMode, commentLinkMode]);

  const [highlightNavIndex, setHighlightNavIndex] = useState(0);
  const highlightNavTargetsKey = highlightNavTargets.join('\0');

  useEffect(() => {
    setHighlightNavIndex(0);
  }, [highlightNavTargetsKey]);

  const showHighlightNav = expanded && highlightNavTargets.length > 1;

  const goHighlight = (delta: -1 | 1) => {
    const len = highlightNavTargets.length;
    if (len < 2) return;
    const nextIndex = (highlightNavIndex + delta + len) % len;
    const id = highlightNavTargets[nextIndex];
    if (!id) return;
    setHighlightNavIndex(nextIndex);
    scheduleScrollToComponent(scrollRef, componentRefs, id, panelRef, () => {});
  };

  const comments = activeComments(project.relations.comments ?? []);

  useEffect(() => {
    if (!expanded) {
      wasExpandedRef.current = false;
      return;
    }

    const el = scrollRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setPageScrollTop(pageFile, el.scrollTop), 100);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      setPageScrollTop(pageFile, el.scrollTop);
      el.removeEventListener('scroll', onScroll);
    };
  }, [expanded, pageFile]);

  useLayoutEffect(() => {
    if (!expanded) return;
    if (wasExpandedRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    if (
      shouldSkipScrollRestore(
        page,
        scrollToComponentId,
        scrollNonce,
        isCurrent,
        selection,
        selectionScrollNonce,
        linkMode,
        linkGroupMembers,
      )
    ) {
      return;
    }

    const saved = getPageScrollTop(pageFile);
    if (saved !== undefined) {
      el.scrollTop = saved;
    }
  }, [
    expanded,
    pageFile,
    page,
    scrollToComponentId,
    scrollNonce,
    isCurrent,
    selection,
    selectionScrollNonce,
    linkMode,
    linkGroupMembers,
  ]);

  useEffect(() => {
    if (!scrollToComponentId || scrollNonce === 0 || !expanded) return;
    if (handledScrollNonceRef.current === scrollNonce) return;
    if (!page?.components.some((c) => c.id === scrollToComponentId)) return;

    const highlightedComment = commentAnchorHighlightId
      ? comments.find((comment) => comment.id === commentAnchorHighlightId)
      : null;
    const scrollToMdHighlight =
      highlightedComment?.anchor?.kind === 'md-range' &&
      highlightedComment.anchor.componentId === scrollToComponentId;

    const markScrollHandled = () => {
      handledScrollNonceRef.current = scrollNonce;
    };

    if (scrollToMdHighlight) {
      return scheduleScrollToMdCommentHighlight(
        scrollRef,
        componentRefs,
        scrollToComponentId,
        panelRef,
        (success) => {
          if (success) {
            markScrollHandled();
            return;
          }
          scheduleScrollToComponent(
            scrollRef,
            componentRefs,
            scrollToComponentId,
            panelRef,
            markScrollHandled,
          );
        },
      );
    }

    return scheduleScrollToComponent(
      scrollRef,
      componentRefs,
      scrollToComponentId,
      panelRef,
      markScrollHandled,
    );
  }, [
    scrollToComponentId,
    scrollNonce,
    expanded,
    pageFile,
    page,
    commentAnchorHighlightId,
    comments,
  ]);

  useEffect(() => {
    if (!expanded) {
      handledAutoScrollKeyRef.current = null;
      return;
    }

    const justExpanded = !wasExpandedRef.current;
    wasExpandedRef.current = true;

    if (linkMode || isCurrent || !page || !selection) return;

    const targetId = getFirstSelectedComponentId(
      page,
      selection,
      isCurrent,
      linkMode,
      linkGroupMembers,
    );
    if (!targetId) return;

    const scrollKey = `${selectionScrollNonce}:${selection.componentId}:${selection.relatedIds.size}:${targetId}`;
    if (!justExpanded && handledAutoScrollKeyRef.current === scrollKey) return;

    return scheduleScrollToComponent(
      scrollRef,
      componentRefs,
      targetId,
      panelRef,
      (success) => {
        if (success) handledAutoScrollKeyRef.current = scrollKey;
      },
    );
  }, [
    expanded,
    isCurrent,
    linkMode,
    pageFile,
    page,
    selection,
    selectionScrollNonce,
    linkGroupMembers,
  ]);

  if (!page) return null;

  const panelTitle = (
    <PageLabel
      className="page-panel-title-label"
      pageName={page.pageName}
      pageId={page.pageId}
      fileName={page.fileName}
      componentCount={page.components.length}
    />
  );

  const openPanel = () => {
    if (!expanded) onToggle();
  };

  return (
    <div
      ref={panelRef}
      className={`page-panel ${expanded ? 'expanded' : 'shrunk'} ${isCurrent ? 'current' : ''}`}
      data-page={pageFile}
      onClick={expanded ? undefined : openPanel}
      onKeyDown={
        expanded
          ? undefined
          : (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPanel();
              }
            }
      }
      role={expanded ? undefined : 'button'}
      tabIndex={expanded ? undefined : 0}
      aria-label={
        expanded ? undefined : `Open page panel: ${page.pageName} (${page.components.length})`
      }
    >
      <div className="page-panel-header">
        {expanded ? (
          <>
            <span className="page-panel-title">{panelTitle}</span>
            {showHighlightNav && (
              <div className="page-panel-highlight-nav">
                <button
                  type="button"
                  className="page-panel-highlight-nav-btn"
                  onClick={() => goHighlight(-1)}
                  title="Scroll to previous linked component group on this page"
                  aria-label="Scroll to previous linked component group on this page"
                >
                  ←
                </button>
                <span className="page-panel-highlight-nav-label">
                  {highlightNavIndex + 1}/{highlightNavTargets.length}
                </span>
                <button
                  type="button"
                  className="page-panel-highlight-nav-btn"
                  onClick={() => goHighlight(1)}
                  title="Scroll to next linked component group on this page"
                  aria-label="Scroll to next linked component group on this page"
                >
                  →
                </button>
              </div>
            )}
            <button
              type="button"
              className="panel-toggle-btn"
              onClick={onToggle}
              title="Shrink"
            >
              ◀
            </button>
          </>
        ) : (
          <>
            <span className="panel-toggle-btn panel-toggle-btn-hint" aria-hidden="true">
              ▶
            </span>
            <span
              className="page-panel-vertical-title"
              title={`${page.pageName} (${page.components.length})`}
            >
              {page.pageName}
              <span className="page-label-count"> ({page.components.length})</span>
            </span>
          </>
        )}
      </div>

      {expanded ? (
        <div className="page-panel-body">
          <div className="page-scroll-host">
          <div
            ref={scrollRef}
            className="page-scroll-area"
            onClick={(e) => {
              if (e.target === e.currentTarget) onClearSelection();
            }}
          >
            <div
              className="page-content"
              onClick={(e) => {
                if (e.target === e.currentTarget) onClearSelection();
              }}
            >
              {page.components.map((component) => {
                const mdSource =
                  component.type === 'md'
                    ? resolveComponentForDisplay(component, project.mdFiles).content
                    : '';
                return (
                <ComponentBlock
                  key={component.id}
                  component={component}
                  project={project}
                  styles={project.styles}
                  pageFile={pageFile}
                  selection={selection}
                  highlightedIds={highlightedOnPage}
                  linkMode={linkMode}
                  linkGroupMembers={linkGroupMembers}
                  pendingImageNames={pendingImageNames}
                  commentLinkMode={commentLinkMode}
                  commentLinkPreviewAnchor={commentLinkPreviewAnchor}
                  mdHighlightRanges={
                    commentLinkMode
                      ? getPreviewMdHighlightRanges(
                          commentLinkPreviewAnchor,
                          component.id,
                          mdSource,
                        )
                      : getMdHighlightRanges(
                          comments,
                          component.id,
                          mdSource,
                          commentAnchorHighlightId,
                          outstandingCommentId,
                        )
                  }
                  hasComponentCommentAnchor={
                    commentLinkMode
                      ? false
                      : hasComponentCommentAnchor(
                          comments,
                          component.id,
                          commentAnchorHighlightId,
                        )
                  }
                  onSelect={onSelect}
                  onCommentLinkComponent={onCommentLinkComponent}
                  onCommentLinkMdRange={onCommentLinkMdRange}
                  onCommentMarkClick={onCommentMarkClick}
                  registerRef={registerRef}
                />
                );
              })}
            </div>
          </div>
          {!linkMode && selection && (
            <ScrollbarMarkers
              scrollRef={scrollRef}
              highlightedIds={highlightedOnPage}
              componentRefs={componentRefs}
              markerStyle={project.styles.linkedScrollMarker}
            />
          )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
