import { useCallback, useEffect, useState } from 'react';
import type { ScrollMarkerStyle } from '../types';

interface Marker {
  componentId: string;
  top: number;
  height: number;
}

interface ScrollbarMarkersProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  highlightedIds: Set<string>;
  componentRefs: React.RefObject<Map<string, HTMLElement>>;
  markerStyle: ScrollMarkerStyle;
  secondaryMarkerStyle?: ScrollMarkerStyle;
  mainGroupMemberIds?: Set<string>;
  onMarkerClick?: (componentId: string) => void;
}

interface TrackMetrics {
  scrollHeight: number;
  clientHeight: number;
  maxScroll: number;
  arrowInset: number;
  travelHeight: number;
}

function getScrollbarGutter(container: HTMLDivElement): number {
  return Math.max(0, container.offsetWidth - container.clientWidth);
}

function getTrackMetrics(container: HTMLDivElement): TrackMetrics | null {
  const scrollHeight = container.scrollHeight;
  const clientHeight = container.clientHeight;
  const maxScroll = scrollHeight - clientHeight;
  if (maxScroll <= 0) return null;

  const gutter = getScrollbarGutter(container);
  // Classic scrollbars reserve square arrow buttons at top/bottom (≈ gutter width).
  const arrowInset = gutter >= 12 ? gutter : 0;
  const usableHeight = clientHeight - 2 * arrowInset;
  if (usableHeight <= 0) return null;

  const thumbHeight = (clientHeight / scrollHeight) * usableHeight;
  const travelHeight = usableHeight - thumbHeight;
  return { scrollHeight, clientHeight, maxScroll, arrowInset, travelHeight };
}

/** Same linear map as the native thumb, inside the arrow-button inset. */
function docYToTrackY(
  docY: number,
  maxScroll: number,
  travelHeight: number,
  arrowInset: number,
): number {
  return arrowInset + (docY / maxScroll) * travelHeight;
}

function getOffsetWithinScroller(el: HTMLElement, scroller: HTMLElement): number {
  let top = 0;
  let node: HTMLElement | null = el;
  while (node && node !== scroller) {
    top += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
    if (node && !scroller.contains(node)) break;
  }
  if (node === scroller) return top;

  const elRect = el.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  return elRect.top - scrollerRect.top + scroller.scrollTop;
}

function computeMarkers(
  container: HTMLDivElement,
  highlightedIds: Set<string>,
  componentRefs: React.RefObject<Map<string, HTMLElement>>,
): Marker[] {
  const metrics = getTrackMetrics(container);
  if (!metrics) return [];

  const { clientHeight, maxScroll, arrowInset, travelHeight } = metrics;
  const trackBottom = clientHeight - arrowInset;
  const next: Marker[] = [];

  for (const id of highlightedIds) {
    const el = componentRefs.current?.get(id);
    if (!el) continue;

    const elementTop = getOffsetWithinScroller(el, container);
    const elementBottom = elementTop + el.offsetHeight;
    const top = docYToTrackY(elementTop, maxScroll, travelHeight, arrowInset);
    const bottom = docYToTrackY(elementBottom, maxScroll, travelHeight, arrowInset);
    const height = Math.max(6, bottom - top);
    next.push({
      componentId: id,
      top: Math.max(arrowInset, Math.min(top, trackBottom - height)),
      height,
    });
  }

  return next;
}

export function ScrollbarMarkers({
  scrollRef,
  highlightedIds,
  componentRefs,
  markerStyle,
  secondaryMarkerStyle,
  mainGroupMemberIds,
  onMarkerClick,
}: ScrollbarMarkersProps) {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [trackWidth, setTrackWidth] = useState(10);

  const update = useCallback(() => {
    const container = scrollRef.current;
    if (!container || highlightedIds.size === 0) {
      setMarkers([]);
      return;
    }

    if (!getTrackMetrics(container)) {
      setMarkers([]);
      return;
    }

    const gutter = getScrollbarGutter(container);
    setTrackWidth(Math.max(gutter, 8));
    setMarkers(computeMarkers(container, highlightedIds, componentRefs));
  }, [scrollRef, highlightedIds, componentRefs]);

  useEffect(() => {
    update();
    const container = scrollRef.current;
    if (!container) return;

    const ro = new ResizeObserver(update);
    ro.observe(container);
    const content = container.firstElementChild;
    if (content) ro.observe(content);

    for (const id of highlightedIds) {
      const el = componentRefs.current?.get(id);
      if (el) ro.observe(el);
    }

    return () => ro.disconnect();
  }, [scrollRef, update, highlightedIds, componentRefs]);

  if (markers.length === 0) return null;

  const clickable = Boolean(onMarkerClick);

  return (
    <div
      className="scrollbar-track"
      style={{ width: trackWidth }}
      aria-hidden={clickable ? undefined : true}
    >
      {markers.map((marker) => {
        const isMainGroupMember = mainGroupMemberIds?.has(marker.componentId) ?? true;
        const style = isMainGroupMember
          ? markerStyle
          : (secondaryMarkerStyle ?? markerStyle);

        return (
        <div
          key={marker.componentId}
          className={`scrollbar-marker${clickable ? ' scrollbar-marker-clickable' : ''}`}
          style={{
            top: `${marker.top}px`,
            height: `${marker.height}px`,
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            borderWidth: 1,
            borderStyle: 'solid',
          }}
          role={clickable ? 'button' : undefined}
          tabIndex={clickable ? 0 : undefined}
          title={clickable ? `Scroll to ${marker.componentId}` : undefined}
          aria-label={clickable ? `Scroll to ${marker.componentId}` : undefined}
          onClick={
            clickable
              ? (event) => {
                  event.stopPropagation();
                  onMarkerClick?.(marker.componentId);
                }
              : undefined
          }
          onKeyDown={
            clickable
              ? (event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  event.stopPropagation();
                  onMarkerClick?.(marker.componentId);
                }
              : undefined
          }
        />
        );
      })}
    </div>
  );
}
