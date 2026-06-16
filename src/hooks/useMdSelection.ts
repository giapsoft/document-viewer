import { useEffect, useRef, useState } from 'react';
import { mdRangeFromSelection, type MdTextRange } from '../lib/mdSelection';

/** Track live markdown text selection for a component preview in the edit bar / link mode. */
export function useMdSelection(isMd: boolean, componentId: string, source: string): MdTextRange | null {
  const [mdRange, setMdRange] = useState<MdTextRange | null>(null);
  const rafRef = useRef<number | null>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;

  useEffect(() => {
    if (!isMd) {
      setMdRange(null);
      return;
    }

    const update = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setMdRange((prev) => (prev === null ? prev : null));
        return;
      }

      const root = document.querySelector(
        `[data-component-id="${CSS.escape(componentId)}"] .component-md`,
      );
      if (!root) {
        setMdRange((prev) => (prev === null ? prev : null));
        return;
      }

      const range = mdRangeFromSelection(sourceRef.current, sel, root as HTMLElement);
      setMdRange((prev) => {
        if (!range) return prev === null ? prev : null;
        if (
          prev &&
          prev.start === range.start &&
          prev.end === range.end &&
          prev.excerpt === range.excerpt
        ) {
          return prev;
        }
        return range;
      });
    };

    const onSelectionChange = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(update);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isMd, componentId]);

  return mdRange;
}
