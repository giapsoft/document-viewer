import { useRef, useEffect, type CSSProperties, type ReactNode } from 'react';
import type { AppStyles, Component, LoadedProject, SelectionState } from '../types';
import { resolveComponentForDisplay, isTextType, getRefTargetId } from '../lib/resolveRef';
import { formatPageName } from '../lib/formatPageName';
import { scrollElementIntoContainer } from '../lib/scrollIntoContainer';
import { ScrollbarMarkers } from './ScrollbarMarkers';
import { RefLinkButton } from './RefLinkButton';

interface ComponentBlockProps {
  component: Component;
  project: LoadedProject;
  styles: AppStyles;
  pageFile: string;
  selection: SelectionState | null;
  linkMode?: boolean;
  linkSelection?: Set<string>;
  onSelect: (componentId: string, pageFile: string) => void;
  registerRef: (id: string, el: HTMLElement | null) => void;
}

interface ComponentShellProps {
  component: Component;
  isRefType: boolean;
  refTargetId: string | null;
  isSelected: boolean;
  isDimmed: boolean;
  linkMode?: boolean;
  className: string;
  style: CSSProperties;
  onSelect: (componentId: string, pageFile: string) => void;
  onJumpToOriginal: (targetId: string) => void;
  pageFile: string;
  registerRef: (id: string, el: HTMLElement | null) => void;
  children: ReactNode;
}

function ComponentShell({
  component,
  isRefType,
  refTargetId,
  isSelected,
  isDimmed,
  linkMode,
  className,
  style,
  onSelect,
  onJumpToOriginal,
  pageFile,
  registerRef,
  children,
}: ComponentShellProps) {
  return (
    <div
      ref={(el) => registerRef(component.id, el)}
      className={`component-block ${className} ${isRefType ? 'component-ref-copy' : ''} ${isSelected ? 'selected' : ''} ${isDimmed ? 'dimmed' : ''} ${linkMode && isSelected ? 'link-selected' : ''}`}
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
      {isRefType && refTargetId && !linkMode && (
        <RefLinkButton
          refId={refTargetId}
          onJump={() => onJumpToOriginal(refTargetId)}
        />
      )}
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
  linkSelection,
  onSelect,
  registerRef,
}: ComponentBlockProps) {
  const resolved = resolveComponentForDisplay(component, project.index.componentData);
  const isRefType = component.type === 'ref';
  const refTargetId = isRefType ? getRefTargetId(component) : null;

  const isLinkSelected = linkMode && (linkSelection?.has(component.id) ?? false);
  const isSelected = linkMode
    ? isLinkSelected
    : (selection?.relatedIds.has(component.id) ?? false);
  const isDimmed = linkMode
    ? linkSelection != null && linkSelection.size > 0 && !isLinkSelected
    : selection !== null && !selection.relatedIds.has(component.id);
  const selectedStyle = isSelected ? styles.selectedComponent : null;
  const statusStyle = styles.statuses[resolved.status];

  const shellStyle: CSSProperties = {
    backgroundColor: statusStyle.backgroundColor,
    ...(selectedStyle
      ? {
          borderColor: selectedStyle.borderColor,
          borderWidth: selectedStyle.borderWidth,
          borderStyle: selectedStyle.borderStyle,
        }
      : {}),
  };

  const handleJumpToOriginal = (targetId: string) => {
    const originalPage = project.index.componentToPage.get(targetId);
    if (originalPage) {
      onSelect(targetId, originalPage);
    }
  };

  const shellProps = {
    component,
    isRefType,
    refTargetId,
    isSelected,
    isDimmed,
    linkMode,
    onSelect,
    onJumpToOriginal: handleJumpToOriginal,
    pageFile,
    registerRef,
  };

  if (resolved.refError) {
    return (
      <ComponentShell {...shellProps} className="component-error" style={shellStyle}>
        {resolved.refError}
      </ComponentShell>
    );
  }

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

interface PagePanelProps {
  pageFile: string;
  expanded: boolean;
  project: LoadedProject;
  isCurrent: boolean;
  selection: SelectionState | null;
  linkMode?: boolean;
  linkSelection?: Set<string>;
  onToggle: () => void;
  onSelect: (componentId: string, pageFile: string) => void;
  onClearSelection: () => void;
  scrollToComponentId?: string | null;
  scrollNonce?: number;
}

export function PagePanel({
  pageFile,
  expanded,
  project,
  isCurrent,
  selection,
  linkMode = false,
  linkSelection,
  onToggle,
  onSelect,
  onClearSelection,
  scrollToComponentId = null,
  scrollNonce = 0,
}: PagePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const componentRefs = useRef<Map<string, HTMLElement>>(new Map());
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
    if (!scrollToComponentId || scrollNonce === 0 || !expanded) return;
    if (!page?.components.some((c) => c.id === scrollToComponentId)) return;

    let cancelled = false;

    const tryScroll = () => {
      if (cancelled) return;
      const container = scrollRef.current;
      const element = componentRefs.current.get(scrollToComponentId);
      if (container && element) {
        scrollElementIntoContainer(container, element);
      }
    };

    const frame = requestAnimationFrame(() => {
      tryScroll();
      requestAnimationFrame(tryScroll);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [scrollToComponentId, scrollNonce, expanded, page]);

  if (!page) return null;

  return (
    <div
      className={`page-panel ${expanded ? 'expanded' : 'shrunk'} ${isCurrent ? 'current' : ''}`}
      data-page={pageFile}
    >
      <div className="page-panel-header">
        {expanded ? (
          <>
            <span className="page-panel-title">{formatPageName(pageFile)}</span>
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
            <span className="page-panel-vertical-title" title={formatPageName(pageFile)}>
              {formatPageName(pageFile)}
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
                  linkSelection={linkSelection}
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
