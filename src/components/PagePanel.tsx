import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
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
import { createMarkdownComponentLinkResolver } from '../lib/mdComponentLinks';
import { PageLabel } from './PageLabel';
import { MarkdownPreview } from './MarkdownPreview';
import { ActionComponent } from './ActionComponent';
import {
  COMMENT_LINK_PREVIEW_HIGHLIGHT,
  LINK_MODE_HIGHLIGHT,
  TRANSITIVE_LINKED_COMPONENT,
  TRANSITIVE_LINKED_SCROLL_MARKER,
} from '../lib/styles';
import { scheduleScrollToComponent, scheduleScrollToMdCommentHighlight } from '../lib/scrollIntoContainer';
import { getPageScrollTop, setPageScrollTop } from '../lib/pageScrollMemory';
import {
  getFirstHighlightedComponentId,
  getHighlightedIdsForPage,
  getMainGroupMemberIds,
} from '../lib/selectionHighlight';
import { ScrollbarMarkers } from './ScrollbarMarkers';
import type { MdHighlightRange, MdTextRange } from '../lib/mdSelection';
import { resolveMdHighlightSegments } from '../lib/mdSelection';
import { ComponentReadBar } from './ComponentReadBar';
import { getComponentVersion } from '../lib/componentVersion';
import {
  countUnreadComponentsOnPage,
  formatPageComponentCount,
  isComponentRead,
} from '../lib/readState';

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
  mainGroupMemberIds?: Set<string>;
  pendingImageNames?: ReadonlySet<string>;
  pendingMdComponentIds?: ReadonlySet<string>;
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
  onNavigateToComponent?: (componentId: string) => void;
  flashedComponentId?: string | null;
  flashNonce?: number;
  registerRef: (id: string, el: HTMLElement | null) => void;
  commentUsername?: string | null;
  componentReadState?: Record<string, number>;
  onToggleComponentRead?: (componentId: string) => void;
}

interface ComponentShellProps {
  component: Component;
  highlightKind: 'none' | 'primary' | 'related' | 'related-transitive' | 'link' | 'comment-link';
  isDimmed: boolean;
  isPrimarySelected: boolean;
  linkFlashActive: boolean;
  linkFlashNonce: number;
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
  isPrimarySelected,
  linkFlashActive,
  linkFlashNonce,
  className,
  style,
  onSelect,
  onCommentLinkComponent,
  commentLinkMode = false,
  pageFile,
  registerRef,
  children,
}: ComponentShellProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = shellRef.current;
    if (!linkFlashActive) {
      el?.classList.remove('component-link-flash');
      return;
    }
    if (!el) return;
    el.classList.remove('component-link-flash');
    void el.offsetWidth;
    el.classList.add('component-link-flash');
  }, [linkFlashActive, linkFlashNonce]);

  return (
    <div
      ref={(el) => {
        shellRef.current = el;
        registerRef(component.id, el);
      }}
      data-component-id={component.id}
      className={`component-block ${className} ${highlightKind !== 'none' ? 'selected' : ''} ${highlightKind === 'primary' ? 'selected-primary' : ''} ${highlightKind === 'related' ? 'selected-related' : ''} ${highlightKind === 'related-transitive' ? 'selected-related-transitive' : ''} ${highlightKind === 'link' ? 'link-selected' : ''} ${highlightKind === 'comment-link' ? 'comment-link-preview' : ''} ${isDimmed ? 'dimmed' : ''}`}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        if (commentLinkMode && onCommentLinkComponent) {
          onCommentLinkComponent(component.id, pageFile);
          return;
        }
        onSelect(component.id, pageFile);
        e.currentTarget.focus({ preventScroll: true });
      }}
      role="button"
      tabIndex={isPrimarySelected ? 0 : -1}
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
  mainGroupMemberIds,
  linkMode = false,
  linkGroupMembers,
  pendingImageNames,
  pendingMdComponentIds,
  commentLinkMode = false,
  commentLinkPreviewAnchor = null,
  mdHighlightRanges = [],
  hasComponentCommentAnchor = false,
  onSelect,
  onCommentLinkComponent,
  onCommentLinkMdRange,
  onCommentMarkClick,
  onNavigateToComponent,
  flashedComponentId = null,
  flashNonce = 0,
  registerRef,
  commentUsername = null,
  componentReadState = {},
  onToggleComponentRead,
}: ComponentBlockProps) {
  const resolved = resolveComponentForDisplay(component, project.mdFiles);
  const mdSelectionHandledRef = useRef(false);
  const resolveComponentLink = useMemo(
    () => createMarkdownComponentLinkResolver(pageFile, project),
    [pageFile, project],
  );

  const wrapWithReadBar = (shell: ReactNode) => {
    if (!commentUsername || !onToggleComponentRead) return shell;
    const version = getComponentVersion(component);
    const read = isComponentRead(component.id, version, componentReadState);
    return (
      <div className={`component-unit ${read ? 'is-read' : 'is-unread'}`}>
        {shell}
        <ComponentReadBar
          isRead={read}
          onToggle={() => onToggleComponentRead(component.id)}
        />
      </div>
    );
  };

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
          ? mainGroupMemberIds?.has(component.id)
            ? 'related'
            : 'related-transitive'
          : 'none';

  const highlightStyle =
    highlightKind === 'primary'
      ? styles.selectedComponent
      : highlightKind === 'related'
        ? styles.linkedComponent
        : highlightKind === 'related-transitive'
          ? TRANSITIVE_LINKED_COMPONENT
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
    isPrimarySelected,
    linkFlashActive: flashedComponentId === component.id,
    linkFlashNonce: flashNonce,
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
  const stickyClassExtra = resolved.type === 'title' ? ' component-sticky' : '';

  if (resolved.type === 'action') {
    return wrapWithReadBar(
      <ComponentShell
        {...shellProps}
        className={`component-action-wrap${shellClassExtra}`}
        style={shellStyle}
      >
        <ActionComponent
          content={resolved.content}
          project={project}
          pendingImageNames={pendingImageNames}
        />
      </ComponentShell>,
    );
  }

  if (resolved.type === 'img') {
    const src = project.imageUrls.get(resolved.content);
    const isPending = pendingImageNames?.has(resolved.content) ?? false;
    return wrapWithReadBar(
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
      </ComponentShell>,
    );
  }

  if (resolved.type === 'md') {
    const isMdPending = pendingMdComponentIds?.has(component.id) ?? false;
    return wrapWithReadBar(
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
            resolveComponentLink={resolveComponentLink}
            onTextSelect={(range) => {
              mdSelectionHandledRef.current = true;
              onCommentLinkMdRange?.(component.id, pageFile, range);
            }}
            onCommentMarkClick={
              commentLinkMode || linkMode
                ? undefined
                : (commentId) => onCommentMarkClick?.(commentId, component.id, pageFile)
            }
            onComponentLinkClick={
              commentLinkMode || linkMode ? undefined : onNavigateToComponent
            }
          />
        ) : isMdPending ? (
          <span className="loading-image">Loading markdown…</span>
        ) : (
          <span className="component-md-empty">Empty markdown</span>
        )}
      </ComponentShell>,
    );
  }

  const typeStyle = isTextType(resolved.type) ? styles.type[resolved.type] : null;
  const displayContent =
    resolved.type === 'listItem' ? `• ${resolved.content}` : resolved.content;

  return wrapWithReadBar(
    <ComponentShell
      {...shellProps}
      className={`component-text component-${resolved.type}${shellClassExtra}${stickyClassExtra}`}
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
    </ComponentShell>,
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
  pendingMdComponentIds?: ReadonlySet<string>;
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
  onNavigateToComponent?: (componentId: string) => void;
  flashedComponentId?: string | null;
  flashNonce?: number;
  commentUsername?: string | null;
  componentReadState?: Record<string, number>;
  onToggleComponentRead?: (componentId: string) => void;
  onTogglePageReadAll?: (pageFile: string) => void;
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
  pendingMdComponentIds,
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
  onNavigateToComponent,
  flashedComponentId = null,
  flashNonce = 0,
  scrollToComponentId = null,
  scrollNonce = 0,
  selectionScrollNonce = 0,
  commentUsername = null,
  componentReadState = {},
  onToggleComponentRead,
  onTogglePageReadAll,
}: PagePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const componentRefs = useRef<Map<string, HTMLElement>>(new Map());
  const handledScrollNonceRef = useRef(0);
  const handledAutoScrollKeyRef = useRef<string | null>(null);
  const wasExpandedRef = useRef(false);
  const prevLinkModeRef = useRef(linkMode);
  const page = project.pages.find((p) => p.fileName === pageFile);

  const registerRef = (id: string, el: HTMLElement | null) => {
    if (el) componentRefs.current.set(id, el);
    else componentRefs.current.delete(id);
  };

  const highlightedOnPage =
    !linkMode && selection && page
      ? getHighlightedIdsForPage(page, selection, isCurrent)
      : new Set<string>();

  const mainGroupMemberIds = useMemo(() => {
    if (!selection || linkMode) return new Set<string>();
    return getMainGroupMemberIds(project.relations.groups, selection);
  }, [project.relations.groups, selection, linkMode]);

  const scrollToHighlightedComponent = useCallback(
    (componentId: string) => {
      scheduleScrollToComponent(scrollRef, componentRefs, componentId, panelRef, () => {});
    },
    [],
  );

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
      const el = componentRefs.current.get(scrollToComponentId);
      el?.focus({ preventScroll: true });
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
    const justExitedLinkMode = prevLinkModeRef.current && !linkMode;
    prevLinkModeRef.current = linkMode;

    if (!expanded) {
      handledAutoScrollKeyRef.current = null;
      return;
    }

    const justExpanded = !wasExpandedRef.current;
    wasExpandedRef.current = true;

    if (linkMode || justExitedLinkMode || isCurrent || !page || !selection) return;

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

  const pageUnreadCount = commentUsername
    ? countUnreadComponentsOnPage(page.components, componentReadState)
    : null;
  const pageCountLabel = formatPageComponentCount(page.components.length, pageUnreadCount);

  const panelTitle = (
    <PageLabel
      className="page-panel-title-label"
      pageName={page.pageName}
      pageId={page.pageId}
      fileName={page.fileName}
      componentCount={page.components.length}
      unreadCount={pageUnreadCount}
      compact
    />
  );

  const pageHasUnread = pageUnreadCount != null && pageUnreadCount > 0;
  const readAllLabel = pageHasUnread ? 'All read' : 'All unread';

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
        expanded ? undefined : `Open page panel: ${page.pageName} (${pageCountLabel})`
      }
    >
      <div className="page-panel-header">
        {expanded ? (
          <>
            <span className="page-panel-title">{panelTitle}</span>
            <div className="page-panel-header-actions">
              {commentUsername && onTogglePageReadAll ? (
                <button
                  type="button"
                  className={`page-read-all-btn${pageHasUnread ? ' has-unread' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePageReadAll(pageFile);
                  }}
                  title={pageHasUnread ? 'Mark all components on this page as read' : 'Mark all components on this page as unread'}
                >
                  {readAllLabel}
                </button>
              ) : null}
              <button
                type="button"
                className="panel-toggle-btn"
                onClick={onToggle}
                title="Shrink"
              >
                ◀
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="panel-toggle-btn panel-toggle-btn-hint" aria-hidden="true">
              ▶
            </span>
            <span
              className="page-panel-vertical-title"
              title={`${page.pageName} (${pageCountLabel})`}
            >
              {page.pageName}
              <span
                className={`page-label-count${
                  pageUnreadCount != null && pageUnreadCount > 0
                    ? ' page-label-count-has-unread'
                    : ''
                }`}
              >
                {' '}
                ({pageCountLabel})
              </span>
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
                  mainGroupMemberIds={mainGroupMemberIds}
                  linkMode={linkMode}
                  linkGroupMembers={linkGroupMembers}
                  pendingImageNames={pendingImageNames}
                  pendingMdComponentIds={pendingMdComponentIds}
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
                  onNavigateToComponent={onNavigateToComponent}
                  flashedComponentId={flashedComponentId}
                  flashNonce={flashNonce}
                  registerRef={registerRef}
                  commentUsername={commentUsername}
                  componentReadState={componentReadState}
                  onToggleComponentRead={onToggleComponentRead}
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
              secondaryMarkerStyle={TRANSITIVE_LINKED_SCROLL_MARKER}
              mainGroupMemberIds={mainGroupMemberIds}
              onMarkerClick={scrollToHighlightedComponent}
            />
          )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
