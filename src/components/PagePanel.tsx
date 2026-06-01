import { useRef, useEffect, useLayoutEffect, type CSSProperties, type ReactNode } from 'react';
import type { AppStyles, Component, LoadedProject, PageData, SelectionState } from '../types';
import { resolveComponentForDisplay, isTextType } from '../lib/componentDisplay';
import { PageLabel } from './PageLabel';
import { MarkdownPreview } from './MarkdownPreview';
import { scheduleScrollToComponent } from '../lib/scrollIntoContainer';
import { getPageScrollTop, setPageScrollTop } from '../lib/pageScrollMemory';
import { ScrollbarMarkers } from './ScrollbarMarkers';

interface ComponentBlockProps {
  component: Component;
  project: LoadedProject;
  styles: AppStyles;
  pageFile: string;
  selection: SelectionState | null;
  linkMode?: boolean;
  linkGroupMembers?: Set<string>;
  onSelect: (componentId: string, pageFile: string) => void;
  registerRef: (id: string, el: HTMLElement | null) => void;
}

interface ComponentShellProps {
  component: Component;
  highlightKind: 'none' | 'primary' | 'related' | 'link';
  isDimmed: boolean;
  className: string;
  style: CSSProperties;
  onSelect: (componentId: string, pageFile: string) => void;
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
        onSelect(component.id, pageFile);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(component.id, pageFile);
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
  linkMode = false,
  linkGroupMembers,
  onSelect,
  registerRef,
}: ComponentBlockProps) {
  const resolved = resolveComponentForDisplay(component, project.mdFiles);

  const isLinkSelected = linkMode && (linkGroupMembers?.has(component.id) ?? false);
  const isPrimarySelected =
    !linkMode && selection?.componentId === component.id;
  const isRelatedSelected =
    !linkMode &&
    (selection?.relatedIds.has(component.id) ?? false) &&
    !isPrimarySelected;
  const isDimmed = linkMode
    ? linkGroupMembers != null && linkGroupMembers.size > 0 && !isLinkSelected
    : selection !== null && !selection.relatedIds.has(component.id);

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
    pageFile,
    registerRef,
  };

  if (resolved.type === 'img') {
    const src = project.imageUrls.get(resolved.content);
    return (
      <ComponentShell {...shellProps} className="component-img-wrap" style={shellStyle}>
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
      <ComponentShell {...shellProps} className="component-md-wrap" style={shellStyle}>
        {resolved.content.trim() ? (
          <MarkdownPreview source={resolved.content} />
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
      className={`component-text component-${resolved.type}`}
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
  for (const component of page.components) {
    if (selection.relatedIds.has(component.id)) return component.id;
  }
  return null;
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
  scrollToComponentId = null,
  scrollNonce = 0,
  selectionScrollNonce = 0,
}: PagePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const componentRefs = useRef<Map<string, HTMLElement>>(new Map());
  const handledScrollNonceRef = useRef(0);
  const lastGroupScrollKeyRef = useRef<string | null>(null);
  const groupScrollReadyRef = useRef(false);
  const wasExpandedRef = useRef(false);
  const page = project.pages.find((p) => p.fileName === pageFile);

  const registerRef = (id: string, el: HTMLElement | null) => {
    if (el) componentRefs.current.set(id, el);
    else componentRefs.current.delete(id);
  };

  const highlightedOnPage = new Set<string>();
  if (!linkMode && selection && page) {
    for (const c of page.components) {
      if (selection.relatedIds.has(c.id)) highlightedOnPage.add(c.id);
    }
  }

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

    return scheduleScrollToComponent(
      scrollRef,
      componentRefs,
      scrollToComponentId,
      panelRef,
      () => {
        handledScrollNonceRef.current = scrollNonce;
      },
    );
  }, [scrollToComponentId, scrollNonce, expanded, pageFile]);

  useEffect(() => {
    if (!expanded || linkMode || isCurrent || !page || !selection) return;
    if (selection.matchingGroupIndices.length <= 1) return;
    if (selection.activeGroupIndex === null) return;

    const groupScrollKey = `${selection.componentId}:${selection.activeGroupIndex}`;
    if (!groupScrollReadyRef.current) {
      groupScrollReadyRef.current = true;
      lastGroupScrollKeyRef.current = groupScrollKey;
      return;
    }
    if (lastGroupScrollKeyRef.current === groupScrollKey) return;
    lastGroupScrollKeyRef.current = groupScrollKey;

    const targetId = getFirstSelectedComponentId(
      page,
      selection,
      linkMode,
      linkGroupMembers,
    );
    if (!targetId) return;

    return scheduleScrollToComponent(scrollRef, componentRefs, targetId, panelRef);
  }, [
    expanded,
    isCurrent,
    linkMode,
    pageFile,
    page,
    selection?.componentId,
    selection?.activeGroupIndex,
    selection?.matchingGroupIndices.length,
    linkGroupMembers,
  ]);

  useEffect(() => {
    groupScrollReadyRef.current = false;
    lastGroupScrollKeyRef.current = null;
  }, [selection?.componentId, pageFile]);

  useEffect(() => {
    if (!expanded) return;

    const justExpanded = !wasExpandedRef.current;
    wasExpandedRef.current = true;
    if (!justExpanded || !page || isCurrent || linkMode) return;

    const targetId = getFirstSelectedComponentId(
      page,
      selection,
      linkMode,
      linkGroupMembers,
    );
    if (!targetId) return;

    return scheduleScrollToComponent(scrollRef, componentRefs, targetId, panelRef);
  }, [expanded, pageFile, page, selection, linkMode, linkGroupMembers, isCurrent]);

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
      className={`page-panel ${expanded ? 'expanded' : 'shrunk'} ${isCurrent ? 'current' : ''}`}
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
                  linkMode={linkMode}
                  linkGroupMembers={linkGroupMembers}
                  onSelect={onSelect}
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
