import { useCallback, useState, type DragEvent } from 'react';
import { reorderPageFileList } from '../lib/pageOrder';

interface UsePagePanelReorderOptions {
  panelPageFiles: string[];
  onReorder: (orderedPageFiles: string[]) => void;
}

export function usePagePanelReorder({
  panelPageFiles,
  onReorder,
}: UsePagePanelReorderOptions) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const canReorder = panelPageFiles.length > 1;

  const finishDrag = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>, index: number) => {
      if (!canReorder) return;
      setDragIndex(index);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', panelPageFiles[index] ?? '');
    },
    [canReorder, panelPageFiles],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, index: number) => {
      if (!canReorder || dragIndex === null) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropIndex(index);
    },
    [canReorder, dragIndex],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>, toIndex: number) => {
      event.preventDefault();
      if (!canReorder || dragIndex === null || dragIndex === toIndex) {
        finishDrag();
        return;
      }

      onReorder(reorderPageFileList(panelPageFiles, dragIndex, toIndex));
      finishDrag();
    },
    [canReorder, dragIndex, finishDrag, onReorder, panelPageFiles],
  );

  const handleDragLeave = useCallback((index: number) => {
    setDropIndex((current) => (current === index ? null : current));
  }, []);

  return {
    canReorder,
    dragIndex,
    dropIndex,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd: finishDrag,
    handleDragLeave,
  };
}
