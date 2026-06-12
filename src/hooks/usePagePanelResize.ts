import { useCallback, useRef } from 'react';
import { MIN_PAGE_PANEL_WIDTH } from '../lib/panelWidthStorage';

type DragState = {
  leftPageFile: string;
  rightPageFile: string;
  startX: number;
  startLeftW: number;
  startRightW: number;
};

export function usePagePanelResize(
  slotRefs: React.MutableRefObject<Map<string, HTMLDivElement>>,
  onCommit: (
    leftPageFile: string,
    rightPageFile: string,
    leftWidthPx: number,
    rightWidthPx: number,
  ) => void,
) {
  const dragRef = useRef<DragState | null>(null);

  const startResize = useCallback(
    (
      event: React.PointerEvent<HTMLDivElement>,
      leftPageFile: string,
      rightPageFile: string,
    ) => {
      const leftEl = slotRefs.current.get(leftPageFile);
      const rightEl = slotRefs.current.get(rightPageFile);
      if (!leftEl || !rightEl) return;

      event.preventDefault();
      event.stopPropagation();

      dragRef.current = {
        leftPageFile,
        rightPageFile,
        startX: event.clientX,
        startLeftW: leftEl.getBoundingClientRect().width,
        startRightW: rightEl.getBoundingClientRect().width,
      };

      document.body.classList.add('page-panel-resize-active');

      const applyWidths = (leftW: number, rightW: number) => {
        const drag = dragRef.current;
        if (!drag) return;
        const left = slotRefs.current.get(drag.leftPageFile);
        const right = slotRefs.current.get(drag.rightPageFile);
        if (!left || !right) return;
        left.style.width = `${leftW}px`;
        left.style.flex = '0 0 auto';
        right.style.width = `${rightW}px`;
        right.style.flex = '0 0 auto';
      };

      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;

        const delta = ev.clientX - drag.startX;
        let leftW = drag.startLeftW + delta;
        let rightW = drag.startRightW - delta;

        if (leftW < MIN_PAGE_PANEL_WIDTH) {
          const fix = MIN_PAGE_PANEL_WIDTH - leftW;
          leftW = MIN_PAGE_PANEL_WIDTH;
          rightW -= fix;
        }
        if (rightW < MIN_PAGE_PANEL_WIDTH) {
          const fix = MIN_PAGE_PANEL_WIDTH - rightW;
          rightW = MIN_PAGE_PANEL_WIDTH;
          leftW -= fix;
        }

        applyWidths(leftW, rightW);
      };

      const onEnd = () => {
        const drag = dragRef.current;
        dragRef.current = null;
        document.body.classList.remove('page-panel-resize-active');
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onEnd);
        document.removeEventListener('pointercancel', onEnd);

        if (!drag) return;
        const leftEl = slotRefs.current.get(drag.leftPageFile);
        const rightEl = slotRefs.current.get(drag.rightPageFile);
        if (!leftEl || !rightEl) return;

        const leftW = leftEl.getBoundingClientRect().width;
        const rightW = rightEl.getBoundingClientRect().width;
        leftEl.style.width = '';
        leftEl.style.flex = '';
        rightEl.style.width = '';
        rightEl.style.flex = '';

        onCommit(drag.leftPageFile, drag.rightPageFile, leftW, rightW);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onEnd);
      document.addEventListener('pointercancel', onEnd);
    },
    [slotRefs, onCommit],
  );

  return { startResize };
}
