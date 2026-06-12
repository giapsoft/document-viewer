interface PanelResizeHandleProps {
  leftPageLabel: string;
  rightPageLabel: string;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export function PanelResizeHandle({
  leftPageLabel,
  rightPageLabel,
  onPointerDown,
}: PanelResizeHandleProps) {
  return (
    <div
      className="page-panel-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize between ${leftPageLabel} and ${rightPageLabel}`}
      title="Drag to resize panels"
      onPointerDown={onPointerDown}
    />
  );
}
