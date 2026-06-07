import { useCallback, useEffect, useState } from 'react';
import type { ScrollMarkerStyle } from '../types';

interface Marker {
  top: number;
  height: number;
}

interface ScrollbarMarkersProps {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  highlightedIds: Set<string>;
  componentRefs: React.RefObject<Map<string, HTMLElement>>;
  markerStyle: ScrollMarkerStyle;
}

function getOffsetWithinScroller(el: HTMLElement, scroller: HTMLElement): number {
  const elRect = el.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  return elRect.top - scrollerRect.top + scroller.scrollTop;
}

export function ScrollbarMarkers({
  scrollRef,
  highlightedIds,
  componentRefs,
  markerStyle,
}: ScrollbarMarkersProps) {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [trackWidth, setTrackWidth] = useState(10);

  const update = useCallback(() => {
    const container = scrollRef.current;
    if (!container || highlightedIds.size === 0) {
      setMarkers([]);
      return;
    }

    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    if (scrollHeight <= clientHeight) {
      setMarkers([]);
      return;
    }

    const gutter = container.offsetWidth - container.clientWidth;
    setTrackWidth(Math.max(gutter, 8));

    const trackHeight = clientHeight;
    const next: Marker[] = [];

    for (const id of highlightedIds) {
      const el = componentRefs.current?.get(id);
      if (!el) continue;
      const offsetTop = getOffsetWithinScroller(el, container);
      const top = (offsetTop / scrollHeight) * trackHeight;
      const height = Math.max(6, (el.offsetHeight / scrollHeight) * trackHeight);
      next.push({ top, height });
    }

    setMarkers(next);
  }, [scrollRef, highlightedIds, componentRefs]);

  useEffect(() => {
    update();
    const container = scrollRef.current;
    if (!container) return;

    const ro = new ResizeObserver(update);
    ro.observe(container);
    const content = container.firstElementChild;
    if (content) ro.observe(content);

    return () => ro.disconnect();
  }, [scrollRef, update, highlightedIds]);

  if (markers.length === 0) return null;

  return (
    <div
      className="scrollbar-track"
      aria-hidden="true"
      style={{ width: trackWidth }}
    >
      {markers.map((m, i) => (
        <div
          key={i}
          className="scrollbar-marker"
          style={{
            top: `${m.top}px`,
            height: `${m.height}px`,
            backgroundColor: markerStyle.backgroundColor,
            borderColor: markerStyle.borderColor,
            borderWidth: 1,
            borderStyle: 'solid',
          }}
        />
      ))}
    </div>
  );
}
