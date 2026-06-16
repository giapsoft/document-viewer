import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
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
import { getPersistedGroupIndicesForComponent, getDirectDisplayGroupMemberIds } from '../lib/mdVirtualGroups';
import {
  countUnreadComponentsOnPage,
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

function getMdLinkPreviewHighlightRanges(
  preview: MdTextRange | null | undefined,
  componentId: string,
  sourceComponentId: string | null | undefined,
  mdSource: string,
): MdHighlightRange[] {
  if (!preview || sourceComponentId !== componentId) return [];
  const segments = resolveMdHighlightSegments(mdSource, preview);
  if (segments.length === 0) return [];
  return [
    {
      start: Math.min(...segments.map((segment) => segment.start)),
      end: Math.max(...segments.map((segment) => segment.end)),
      segments,
      className: 'md-comment-highlight md-md-link-preview',
    },
  ];
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
  directDisplayGroupMemberIds?: Set<string>;
  pendingImageNames?: ReadonlySet<string>;
  pendingMdComponentIds?: ReadonlySet<string>;
  linkMode?: boolean;
  linkGroupMembers?: Set<string>;
  commentLinkMode?: boolean;
  commentLinkPreviewAnchor?: CommentAnchor | null;
  mdLinkMode?: boolean;
  mdLinkSourceComponentId?: string | null;
  mdHighlightRanges?: MdHighlightRange[];
  hasComponentCommentAnchor?: boolean;
  onSelect: (componentId: string, pageFile: string) => void;
  onCommentLinkComponent?: (componentId: string, pageFile: string) => void;
  onMdLinkTarget?: (componentId: string, pageFile: string) => void;
  onCommentLinkMdRange?: (
    componentId: string,
    pageFile: string,
    range: MdTextRange,
  ) => void;
  onCommentMarkClick?: (commentId: string, componentId: string, pageFile: string) => void;
  onNavigateToComponent?: (componentId: string, sourcePageFile: string) => void;
  onUnlinkMdComponentLink?: (
    componentId: string,
    pageFile: string,
    sourceOffset: number,
  ) => void;
  flashedComponentId?: string | null;
  flashNonce?: number;
  registerRef: (id: string, el: HTMLElement | null) => void;
  commentUsername?: string | null;
  componentReadState?: Record<string, number>;
  onToggleComponentRead?: (componentId: string) => void;
  showReadBars?: boolean;
  onOpenGroupDialog?: () => void;
  linkedListPanelOpen?: boolean;
}

interface ComponentShellProps {
  component: Component;
  highlightKind: 'none' | 'primary' | 'related' | 'related-transitive' | 'link' | 'comment-link';
  isDimmed: boolean;
  isPrimarySelected: boolean;
  showGroupLink?: boolean;
  linkedListPanelOpen?: boolean;
  linkFlashActive: boolean;
  linkFlashNonce: number;
  className: string;
  style: CSSProperties;
  onSelect: (componentId: string, pageFile: string) => void;
  onOpenGroupDialog?: () => void;
  onCommentLinkComponent?: (componentId: string, pageFile: string) => void;
  onMdLinkTarget?: (componentId: string, pageFile: string) => void;
  mdLinkMode?: boolean;
  mdLinkSourceComponentId?: string | null;
  commentLinkMode?: boolean;
  pageFile: string;
  registerRef: (id: string, el: HTMLElement | null) => void;
  children: ReactNode;
}

function ComponentGroupLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
      <path
        fill="currentColor"
        d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"
      />
    </svg>
  );
}

function mdContainsActiveSelection(shell: HTMLElement): boolean {
  const md = shell.querySelector('.component-md');
  if (!md) return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  return (
    md.contains(selection.anchorNode) &&
    md.contains(selection.focusNode)
  );
}

function ComponentShell({
  component,
  highlightKind,
  isDimmed,
  isPrimarySelected,
  showGroupLink = false,
  linkedListPanelOpen = false,
  linkFlashActive,
  linkFlashNonce,
  className,
  style,
  onSelect,
  onOpenGroupDialog,
  onCommentLinkComponent,
  onMdLinkTarget,
  commentLinkMode = false,
  mdLinkMode = false,
  mdLinkSourceComponentId = null,
  pageFile,
  registerRef,
  children,
}: ComponentShellProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);

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
      onMouseDown={(e) => {
        pointerStartRef.current = { x: e.clientX, y: e.clientY };
        draggedRef.current = false;
      }}
      onMouseMove={(e) => {
        const start = pointerStartRef.current;
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (dx * dx + dy * dy > 16) draggedRef.current = true;
      }}
      onMouseUp={() => {
        pointerStartRef.current = null;
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (commentLinkMode && onCommentLinkComponent) {
          onCommentLinkComponent(component.id, pageFile);
          return;
        }
        if (mdLinkMode && onMdLinkTarget && component.id !== mdLinkSourceComponentId) {
          onMdLinkTarget(component.id, pageFile);
          return;
        }
        // Drag-select in markdown fires click on mouseup; focusing the shell clears the highlight.
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        if (mdContainsActiveSelection(e.currentTarget)) return;
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
          } else if (mdLinkMode && onMdLinkTarget && component.id !== mdLinkSourceComponentId) {
            onMdLinkTarget(component.id, pageFile);
          } else {
            onSelect(component.id, pageFile);
          }
        }
      }}
    >
      {showGroupLink && onOpenGroupDialog ? (
        <button
          type="button"
          className={`component-group-link-btn${linkedListPanelOpen ? ' is-active' : ''}`}
          title={linkedListPanelOpen ? 'Close linked lists' : 'View linked lists'}
          aria-label={linkedListPanelOpen ? 'Close linked lists' : 'View linked lists'}
          aria-pressed={linkedListPanelOpen}
          onClick={(event) => {
            event.stopPropagation();
            onOpenGroupDialog();
          }}
        >
          <ComponentGroupLinkIcon />
        </button>
      ) : null}
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
  directDisplayGroupMemberIds,
  linkMode = false,
  linkGroupMembers,
  pendingImageNames,
  pendingMdComponentIds,
  commentLinkMode = false,
  commentLinkPreviewAnchor = null,
  mdLinkMode = false,
  mdLinkSourceComponentId = null,
  mdHighlightRanges = [],
  hasComponentCommentAnchor = false,
  onSelect,
  onCommentLinkComponent,
  onMdLinkTarget,
  onCommentLinkMdRange,
  onCommentMarkClick,
  onNavigateToComponent,
  onUnlinkMdComponentLink,
  flashedComponentId = null,
  flashNonce = 0,
  registerRef,
  commentUsername = null,
  componentReadState = {},
  onToggleComponentRead,
  showReadBars = true,
  onOpenGroupDialog,
  linkedListPanelOpen = false,
}: ComponentBlockProps) {
  const resolved = resolveComponentForDisplay(component, project.mdFiles);
  const mdSelectionHandledRef = useRef(false);
  const resolveComponentLink = useMemo(
    () => createMarkdownComponentLinkResolver(pageFile, project),
    [pageFile, project],
  );

  const wrapWithReadBar = (shell: ReactNode) => {
    if (!commentUsername || !onToggleComponentRead || !showReadBars) return shell;
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

  const isMdLinkSource = mdLinkMode && mdLinkSourceComponentId === component.id;

  const isLinkSelected = linkMode && (linkGroupMembers?.has(component.id) ?? false);
  const isPrimarySelected =
    !linkMode && !commentLinkMode && !mdLinkMode && selection?.componentId === component.id;
  const hasPersistedGroups =
    getPersistedGroupIndicesForComponent(project.index, component.id).length > 0;
  const showGroupLink =
    isPrimarySelected && (hasPersistedGroups || linkedListPanelOpen);
  const isHighlighted =
    !linkMode && !commentLinkMode && !mdLinkMode && (highlightedIds?.has(component.id) ?? false);
  const isRelatedSelected = isHighlighted && !isPrimarySelected;
  const isDimmed = commentLinkMode
    ? commentLinkPreviewAnchor != null && !isCommentLinkPreview
    : mdLinkMode
      ? false
      : linkMode
        ? linkGroupMembers != null && linkGroupMembers.size > 0 && !isLinkSelected
        : selection !== null && !isHighlighted;

  const highlightKind: ComponentShellProps['highlightKind'] = commentLinkMode
    ? isCommentLinkPreview
      ? 'comment-link'
      : 'none'
    : mdLinkMode
      ? isMdLinkSource
        ? 'comment-link'
        : 'none'
    : linkMode
      ? isLinkSelected
        ? 'link'
        : 'none'
      : isPrimarySelected
        ? 'primary'
        : isRelatedSelected
          ? mainGroupMemberIds?.has(component.id) ||
              directDisplayGroupMemberIds?.has(component.id)
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
    showGroupLink,
    linkedListPanelOpen: isPrimarySelected && linkedListPanelOpen,
    linkFlashActive: flashedComponentId === component.id,
    linkFlashNonce: flashNonce,
    onSelect,
    onOpenGroupDialog: showGroupLink ? onOpenGroupDialog : undefined,
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
    onMdLinkTarget,
    commentLinkMode,
    mdLinkMode,
    mdLinkSourceComponentId,
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
              commentLinkMode || linkMode || mdLinkMode
                ? undefined
                : (commentId) => onCommentMarkClick?.(commentId, component.id, pageFile)
            }
            onComponentLinkClick={
              commentLinkMode || linkMode || mdLinkMode
                ? undefined
                : (componentId) => onNavigateToComponent?.(componentId, pageFile)
            }
            onComponentLinkUnlink={
              commentLinkMode || linkMode || mdLinkMode
                ? undefined
                : (sourceOffset) =>
                    onUnlinkMdComponentLink?.(component.id, pageFile, sourceOffset)
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
  project: LoadedProject;
  isCurrent: boolean;
  selection: SelectionState | null;
  linkMode?: boolean;
  linkGroupMembers?: Set<string>;
  pendingImageNames?: ReadonlySet<string>;
  pendingMdComponentIds?: ReadonlySet<string>;
  onClose: () => void;
  onSelect: (componentId: string, pageFile: string) => void;
  onClearSelection: () => void;
  scrollToComponentId?: string | null;
  scrollNonce?: number;
  scrollColdOpen?: boolean;
  scrollImmediate?: boolean;
  scrollSmooth?: boolean;
  selectionScrollNonce?: number;
  commentLinkMode?: boolean;
  commentLinkPreviewAnchor?: CommentAnchor | null;
  mdLinkMode?: boolean;
  mdLinkSourceComponentId?: string | null;
  mdLinkPreviewRange?: MdTextRange | null;
  commentAnchorHighlightId?: string | null;
  outstandingCommentId?: string | null;
  onCommentLinkComponent?: (componentId: string, pageFile: string) => void;
  onMdLinkTarget?: (componentId: string, pageFile: string) => void;
  onCommentLinkMdRange?: (
    componentId: string,
    pageFile: string,
    range: MdTextRange,
  ) => void;
  onCommentMarkClick?: (commentId: string, componentId: string, pageFile: string) => void;
  onNavigateToComponent?: (componentId: string, sourcePageFile: string) => void;
  onUnlinkMdComponentLink?: (
    componentId: string,
    pageFile: string,
    sourceOffset: number,
  ) => void;
  flashedComponentId?: string | null;
  flashNonce?: number;
  commentUsername?: string | null;
  componentReadState?: Record<string, number>;
  onToggleComponentRead?: (componentId: string) => void;
  onTogglePageReadAll?: (pageFile: string) => void;
  onOpenGroupDialog?: () => void;
  linkedListPanelOpen?: boolean;
}

export function PagePanel({
  pageFile,
  project,
  isCurrent,
  selection,
  linkMode = false,
  linkGroupMembers,
  pendingImageNames,
  pendingMdComponentIds,
  onClose,
  onSelect,
  onClearSelection,
  commentLinkMode = false,
  commentLinkPreviewAnchor = null,
  mdLinkMode = false,
  mdLinkSourceComponentId = null,
  mdLinkPreviewRange = null,
  commentAnchorHighlightId = null,
  outstandingCommentId = null,
  onCommentLinkComponent,
  onMdLinkTarget,
  onCommentLinkMdRange,
  onCommentMarkClick,
  onNavigateToComponent,
  onUnlinkMdComponentLink,
  flashedComponentId = null,
  flashNonce = 0,
  scrollToComponentId = null,
  scrollNonce = 0,
  scrollColdOpen = false,
  scrollImmediate = false,
  scrollSmooth = false,
  selectionScrollNonce = 0,
  commentUsername = null,
  componentReadState = {},
  onToggleComponentRead,
  onTogglePageReadAll,
  onOpenGroupDialog,
  linkedListPanelOpen = false,
}: PagePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const componentRefs = useRef<Map<string, HTMLElement>>(new Map());
  const handledScrollNonceRef = useRef(0);
  const handledAutoScrollKeyRef = useRef<string | null>(null);
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
    return getMainGroupMemberIds(project.index.groups, selection);
  }, [project.index, selection, linkMode]);

  const directDisplayGroupMemberIds = useMemo(() => {
    if (!selection || linkMode) return new Set<string>();
    return getDirectDisplayGroupMemberIds(project.index, selection.componentId);
  }, [project.index, selection, linkMode]);

  const scrollToHighlightedComponent = useCallback(
    (componentId: string) => {
      scheduleScrollToComponent(scrollRef, componentRefs, componentId, panelRef, () => {});
    },
    [],
  );

  const comments = activeComments(project.relations.comments ?? []);

  useEffect(() => {
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
  }, [pageFile]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (
      scrollColdOpen &&
      scrollToComponentId &&
      page?.components.some((c) => c.id === scrollToComponentId)
    ) {
      return;
    }
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
    pageFile,
    page,
    scrollToComponentId,
    scrollNonce,
    scrollColdOpen,
    isCurrent,
    selection,
    selectionScrollNonce,
    linkMode,
    linkGroupMembers,
  ]);

  useEffect(() => {
    if (!scrollToComponentId || scrollNonce === 0) return;
    if (handledScrollNonceRef.current === scrollNonce) return;
    if (!page?.components.some((c) => c.id === scrollToComponentId)) return;

    const highlightedComment = commentAnchorHighlightId
      ? comments.find((comment) => comment.id === commentAnchorHighlightId)
      : null;
    const scrollToMdHighlight =
      highlightedComment?.anchor?.kind === 'md-range' &&
      highlightedComment.anchor.componentId === scrollToComponentId;

    const markScrollHandled = (success: boolean) => {
      if (!success) return;
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
            markScrollHandled(true);
            return;
          }
          scheduleScrollToComponent(
            scrollRef,
            componentRefs,
            scrollToComponentId,
            panelRef,
            markScrollHandled,
            { smooth: scrollSmooth },
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
      { coldOpen: scrollColdOpen, immediate: scrollImmediate, smooth: scrollSmooth },
    );
  }, [
    scrollToComponentId,
    scrollNonce,
    scrollColdOpen,
    scrollImmediate,
    scrollSmooth,
    pageFile,
    page,
    commentAnchorHighlightId,
    comments,
  ]);

  useEffect(() => {
    const justExitedLinkMode = prevLinkModeRef.current && !linkMode;
    prevLinkModeRef.current = linkMode;

    if (linkMode || justExitedLinkMode || isCurrent || !page || !selection) return;

    // Keep an explicit scroll target (e.g. MD link jump) — do not override with
    // the first linked component from the existing selection.
    if (
      scrollToComponentId &&
      scrollNonce > 0 &&
      page.components.some((component) => component.id === scrollToComponentId)
    ) {
      return;
    }

    const targetId = getFirstSelectedComponentId(
      page,
      selection,
      isCurrent,
      linkMode,
      linkGroupMembers,
    );
    if (!targetId) return;

    const scrollKey = `${selectionScrollNonce}:${selection.componentId}:${selection.relatedIds.size}:${targetId}`;
    if (handledAutoScrollKeyRef.current === scrollKey) return;

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
    isCurrent,
    linkMode,
    pageFile,
    page,
    selection,
    selectionScrollNonce,
    linkGroupMembers,
    scrollToComponentId,
    scrollNonce,
  ]);

  if (!page) return null;

  const pageUnreadCount = commentUsername
    ? countUnreadComponentsOnPage(page.components, componentReadState)
    : null;

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

  const handleClose = (event: MouseEvent) => {
    event.stopPropagation();
    onClose();
  };

  return (
    <div
      ref={panelRef}
      className={`page-panel expanded ${isCurrent ? 'current' : ''}`}
      data-page={pageFile}
    >
      <div className="page-panel-header">
        <div className="page-panel-header-leading">
          <span className="page-panel-title">{panelTitle}</span>
        </div>
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
            className="panel-close-btn"
            onClick={handleClose}
            title="Close page"
            aria-label={`Close page: ${page.pageName}`}
          >
            ×
          </button>
        </div>
      </div>

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
                  directDisplayGroupMemberIds={directDisplayGroupMemberIds}
                  linkMode={linkMode}
                  linkGroupMembers={linkGroupMembers}
                  pendingImageNames={pendingImageNames}
                  pendingMdComponentIds={pendingMdComponentIds}
                  commentLinkMode={commentLinkMode}
                  commentLinkPreviewAnchor={commentLinkPreviewAnchor}
                  mdLinkMode={mdLinkMode}
                  mdLinkSourceComponentId={mdLinkSourceComponentId}
                  mdHighlightRanges={
                    commentLinkMode
                      ? getPreviewMdHighlightRanges(
                          commentLinkPreviewAnchor,
                          component.id,
                          mdSource,
                        )
                      : mdLinkMode
                        ? getMdLinkPreviewHighlightRanges(
                            mdLinkPreviewRange,
                            component.id,
                            mdLinkSourceComponentId,
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
                  onMdLinkTarget={onMdLinkTarget}
                  onCommentLinkMdRange={onCommentLinkMdRange}
                  onCommentMarkClick={onCommentMarkClick}
                  onNavigateToComponent={onNavigateToComponent}
                  onUnlinkMdComponentLink={onUnlinkMdComponentLink}
                  flashedComponentId={flashedComponentId}
                  flashNonce={flashNonce}
                  registerRef={registerRef}
                  commentUsername={commentUsername}
                  componentReadState={componentReadState}
                  onToggleComponentRead={onToggleComponentRead}
                  showReadBars={pageHasUnread}
                  onOpenGroupDialog={onOpenGroupDialog}
                  linkedListPanelOpen={linkedListPanelOpen}
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
    </div>
  );
}
