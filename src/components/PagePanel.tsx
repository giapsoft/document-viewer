import {
  useRef,
  useEffect,
  useLayoutEffect,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type {
  AppStyles,
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
import { LINK_MODE_HIGHLIGHT } from '../lib/styles';
import { scheduleScrollToComponent, scheduleScrollToMdCommentHighlight } from '../lib/scrollIntoContainer';
import { getPageScrollTop, setPageScrollTop } from '../lib/pageScrollMemory';
import {
  getFirstHighlightedComponentId,
  getHighlightedIdsForPage,
} from '../lib/selectionHighlight';
import { ScrollbarMarkers } from './ScrollbarMarkers';

function getMdHighlightRanges(
  comments: DocComment[],
  componentId: string,
  focusedCommentId: string | null,
): Array<{ start: number; end: number; className?: string }> {
  if (focusedCommentId) {
    const focused = comments.find((comment) => comment.id === focusedCommentId);
    if (
      focused?.anchor?.kind === 'md-range' &&
      focused.anchor.componentId === componentId
    ) {
      const anchor = focused.anchor;
      return [
        {
          start: anchor.start,
          end: anchor.end,
          className: 'md-comment-highlight md-comment-highlight-focused',
        },
      ];
    }
  }

  return comments
    .filter(
      (comment) =>
        comment.anchor?.kind === 'md-range' &&
        comment.anchor.componentId === componentId,
    )
    .map((comment) => {
      const anchor = comment.anchor as Extract<
        NonNullable<DocComment['anchor']>,
        { kind: 'md-range' }
      >;
      const isFocused = comment.id === focusedCommentId;
      return {
        start: anchor.start,
        end: anchor.end,
        className: isFocused
          ? 'md-comment-highlight md-comment-highlight-focused'
          : 'md-comment-highlight',
      };
    });
}

function hasComponentCommentAnchor(
  comments: DocComment[],
  componentId: string,
  focusedCommentId: string | null,
): boolean {
  if (focusedCommentId) {
    const focused = comments.find((comment) => comment.id === focusedCommentId);
    return (
      focused?.anchor?.kind === 'component' &&
      focused.anchor.componentId === componentId
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
  linkMode?: boolean;
  linkGroupMembers?: Set<string>;
  commentLinkMode?: boolean;
  mdHighlightRanges?: Array<{ start: number; end: number; className?: string }>;
  hasComponentCommentAnchor?: boolean;
  onSelect: (componentId: string, pageFile: string) => void;
  onCommentLinkComponent?: (componentId: string, pageFile: string) => void;
  onCommentLinkMdRange?: (
    componentId: string,
    pageFile: string,
    range: { start: number; end: number; excerpt: string },
  ) => void;
  registerRef: (id: string, el: HTMLElement | null) => void;
}

interface ComponentShellProps {
  component: Component;
  highlightKind: 'none' | 'primary' | 'related' | 'link';
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
      className={`component-block ${className} ${highlightKind !== 'none' ? 'selected' : ''} ${highlightKind === 'primary' ? 'selected-primary' : ''} ${highlightKind === 'related' ? 'selected-related' : ''} ${highlightKind === 'link' ? 'link-selected' : ''} ${isDimmed ? 'dimmed' : ''}`}
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
  commentLinkMode = false,
  mdHighlightRanges = [],
  hasComponentCommentAnchor = false,
  onSelect,
  onCommentLinkComponent,
  onCommentLinkMdRange,
  registerRef,
}: ComponentBlockProps) {
  const resolved = resolveComponentForDisplay(component, project.mdFiles);
  const mdSelectionHandledRef = useRef(false);

  const isLinkSelected = linkMode && (linkGroupMembers?.has(component.id) ?? false);
  const isPrimarySelected =
    !linkMode && selection?.componentId === component.id;
  const isHighlighted = !linkMode && (highlightedIds?.has(component.id) ?? false);
  const isRelatedSelected = isHighlighted && !isPrimarySelected;
  const isDimmed = linkMode
    ? linkGroupMembers != null && linkGroupMembers.size > 0 && !isLinkSelected
    : selection !== null && !isHighlighted;

  const highlightKind: ComponentShellProps['highlightKind'] = linkMode
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

  const shellClassExtra = hasComponentCommentAnchor ? ' comment-component-anchor' : '';

  if (resolved.type === 'img') {
    const src = project.imageUrls.get(resolved.content);
    return (
      <ComponentShell
        {...shellProps}
        className={`component-img-wrap${shellClassExtra}`}
        style={shellStyle}
      >
        {src ? (
          <img src={src} alt={resolved.content} className="component-img" />
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
  autoScrollSecondary: boolean,
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

  if (autoScrollSecondary && !isCurrent && selectionScrollNonce > 0 && page) {
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
  onToggle: () => void;
  onSelect: (componentId: string, pageFile: string) => void;
  onClearSelection: () => void;
  scrollToComponentId?: string | null;
  scrollNonce?: number;
  selectionScrollNonce?: number;
  autoScrollSecondary?: boolean;
  isPinned?: boolean;
  commentLinkMode?: boolean;
  focusedCommentId?: string | null;
  onCommentLinkComponent?: (componentId: string, pageFile: string) => void;
  onCommentLinkMdRange?: (
    componentId: string,
    pageFile: string,
    range: { start: number; end: number; excerpt: string },
  ) => void;
}

export function PagePanel({
  pageFile,
  expanded,
  project,
  isCurrent,
  selection,
  linkMode = false,
  linkGroupMembers,
  onToggle,
  onSelect,
  onClearSelection,
  commentLinkMode = false,
  focusedCommentId = null,
  onCommentLinkComponent,
  onCommentLinkMdRange,
  scrollToComponentId = null,
  scrollNonce = 0,
  selectionScrollNonce = 0,
  autoScrollSecondary = true,
  isPinned = false,
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
        autoScrollSecondary,
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
    autoScrollSecondary,
    linkGroupMembers,
  ]);

  useEffect(() => {
    if (!scrollToComponentId || scrollNonce === 0 || !expanded) return;
    if (handledScrollNonceRef.current === scrollNonce) return;
    if (!page?.components.some((c) => c.id === scrollToComponentId)) return;

    const focusedComment = focusedCommentId
      ? comments.find((comment) => comment.id === focusedCommentId)
      : null;
    const scrollToMdHighlight =
      focusedComment?.anchor?.kind === 'md-range' &&
      focusedComment.anchor.componentId === scrollToComponentId;

    const onDone = () => {
      handledScrollNonceRef.current = scrollNonce;
    };

    if (scrollToMdHighlight) {
      return scheduleScrollToMdCommentHighlight(
        scrollRef,
        componentRefs,
        scrollToComponentId,
        panelRef,
        onDone,
      );
    }

    return scheduleScrollToComponent(
      scrollRef,
      componentRefs,
      scrollToComponentId,
      panelRef,
      onDone,
    );
  }, [
    scrollToComponentId,
    scrollNonce,
    expanded,
    pageFile,
    page,
    focusedCommentId,
    comments,
  ]);

  useEffect(() => {
    if (!expanded) {
      handledAutoScrollKeyRef.current = null;
      return;
    }

    const justExpanded = !wasExpandedRef.current;
    wasExpandedRef.current = true;

    if (!autoScrollSecondary || linkMode || isCurrent || !page || !selection) return;

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
    autoScrollSecondary,
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

  return (
    <div
      ref={panelRef}
      className={`page-panel ${expanded ? 'expanded' : 'shrunk'} ${isCurrent ? 'current' : ''} ${isPinned ? 'pinned' : ''}`}
      data-page={pageFile}
    >
      <div className="page-panel-header">
        {expanded ? (
          <>
            <span className="page-panel-title">{panelTitle}</span>
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
            <button
              type="button"
              className="panel-toggle-btn"
              onClick={onToggle}
              title="Expand"
            >
              ▶
            </button>
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
              {page.components.map((component) => (
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
                  commentLinkMode={commentLinkMode}
                  mdHighlightRanges={getMdHighlightRanges(
                    comments,
                    component.id,
                    focusedCommentId,
                  )}
                  hasComponentCommentAnchor={hasComponentCommentAnchor(
                    comments,
                    component.id,
                    focusedCommentId,
                  )}
                  onSelect={onSelect}
                  onCommentLinkComponent={onCommentLinkComponent}
                  onCommentLinkMdRange={onCommentLinkMdRange}
                  registerRef={registerRef}
                />
              ))}
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
      ) : null}
    </div>
  );
}
