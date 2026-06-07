import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoadedProject } from '../types';
import {
  clampFramePosition,
  clampLayerPosition,
  editorLayoutToStored,
  EDITOR_CANVAS_ASPECT,
  fitEditorLayoutToBeforeImage,
  formatRatioForCss,
  framePositionStyle,
  layerPositionStyle,
  parseActionData,
  ratioToCssPercent,
  resolveActionLabelPlacement,
  serializeActionData,
  storedToEditorLayout,
  type ActionData,
  type ActionEditorLayer,
  type ActionEditorTarget,
  type EditorLayout,
  type FramePosition,
} from '../lib/actionComponent';
import { ImagePickerDialog } from './ImagePickerDialog';
import type { ImportImageResult } from '../lib/importImage';
import { ActionComponent, ActionImageLayer } from './ActionComponent';

type DragMode =
  | 'move'
  | 'resize-nw'
  | 'resize-ne'
  | 'resize-sw'
  | 'resize-se'
  | 'resize-n'
  | 'resize-s'
  | 'resize-e'
  | 'resize-w';

const RESIZE_HANDLES: { mode: DragMode; className: string }[] = [
  { mode: 'resize-nw', className: 'action-editor-resize-nw' },
  { mode: 'resize-n', className: 'action-editor-resize-n' },
  { mode: 'resize-ne', className: 'action-editor-resize-ne' },
  { mode: 'resize-w', className: 'action-editor-resize-w' },
  { mode: 'resize-e', className: 'action-editor-resize-e' },
  { mode: 'resize-sw', className: 'action-editor-resize-sw' },
  { mode: 'resize-s', className: 'action-editor-resize-s' },
  { mode: 'resize-se', className: 'action-editor-resize-se' },
];

const FRAME_RESIZE_HANDLES: { mode: DragMode; className: string }[] = RESIZE_HANDLES.map(
  ({ mode, className }) => ({
    mode,
    className: className.replace('action-editor-resize-', 'action-editor-frame-resize-'),
  }),
);

const EDIT_TARGETS: { id: ActionEditorTarget; label: string; color: string }[] = [
  { id: 'frame', label: 'Frame', color: '#868e96' },
  { id: 'before', label: 'Before image', color: '#228be6' },
  { id: 'after', label: 'After image', color: '#40c057' },
  { id: 'action', label: 'Action zone', color: '#fd7e14' },
];

type EditorDragState = {
  kind: 'layer' | 'frame';
  mode: DragMode;
  layer?: ActionEditorLayer;
  startPointer: { x: number; y: number };
  startPosition: FramePosition;
  moved: boolean;
};

interface ActionEditorProps {
  project: LoadedProject;
  content: string;
  onChange: (content: string) => void;
  onImportImage?: () => Promise<ImportImageResult>;
  onImportImageFromClipboard?: () => Promise<ImportImageResult>;
}

function editorLayerPosition(layout: EditorLayout, layer: ActionEditorLayer): FramePosition {
  if (layer === 'before') return layout.image_before_position;
  if (layer === 'after') return layout.image_after_position;
  return layout.action_position;
}

function storedLayerPosition(data: ActionData, layer: ActionEditorLayer): FramePosition {
  if (layer === 'before') return data.image_before_position;
  if (layer === 'after') return data.image_after_position;
  return data.action_position;
}

function patchEditorLayer(
  layout: EditorLayout,
  layer: ActionEditorLayer,
  position: FramePosition,
): EditorLayout {
  if (layer === 'before') return { ...layout, image_before_position: position };
  if (layer === 'after') return { ...layout, image_after_position: position };
  return { ...layout, action_position: position };
}

const EDIT_LAYER_STACK: Record<ActionEditorLayer, number> = {
  before: 0,
  action: 1,
  after: 2,
};

function stackEditLayers<L extends ActionEditorLayer>(
  layers: readonly L[],
  active: ActionEditorTarget,
  include?: (layer: L) => boolean,
): L[] {
  const visible = include ? layers.filter(include) : [...layers];
  const inactive = visible
    .filter((layer) => layer !== active)
    .sort((a, b) => EDIT_LAYER_STACK[a] - EDIT_LAYER_STACK[b]);
  if (active !== 'frame' && visible.includes(active as L)) {
    return [...inactive, active as L];
  }
  return inactive;
}

function hitTestLayerOrder(active: ActionEditorTarget): ActionEditorLayer[] {
  const base: ActionEditorLayer[] = ['after', 'action', 'before'];
  if (active === 'frame') return base;
  return [active, ...base.filter((layer) => layer !== active)];
}

function hitTestLayer(
  clientX: number,
  clientY: number,
  editorEl: HTMLElement,
  layout: EditorLayout,
  active: ActionEditorTarget,
  hasAfterImage: boolean,
): ActionEditorLayer | null {
  const rect = editorEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;

  for (const layer of hitTestLayerOrder(active)) {
    if (layer === 'after' && !hasAfterImage) continue;
    const pos = clampLayerPosition(editorLayerPosition(layout, layer));
    if (
      x >= pos.leftRatio &&
      x <= pos.leftRatio + pos.widthRatio &&
      y >= pos.topRatio &&
      y <= pos.topRatio + pos.heightRatio
    ) {
      return layer;
    }
  }
  return null;
}

function hitTestFrame(
  clientX: number,
  clientY: number,
  editorEl: HTMLElement,
  frame: FramePosition,
): boolean {
  const rect = editorEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  const f = clampFramePosition(frame);
  return (
    x >= f.leftRatio &&
    x <= f.leftRatio + f.widthRatio &&
    y >= f.topRatio &&
    y <= f.topRatio + f.heightRatio
  );
}

function applyDrag(
  start: FramePosition,
  mode: DragMode,
  dxRatio: number,
  dyRatio: number,
  clamp: (position: FramePosition) => FramePosition,
): FramePosition {
  let { topRatio, leftRatio, widthRatio, heightRatio } = start;

  if (mode === 'move') {
    return clamp({
      topRatio: topRatio + dyRatio,
      leftRatio: leftRatio + dxRatio,
      widthRatio,
      heightRatio,
    });
  }

  if (mode === 'resize-se') {
    widthRatio += dxRatio;
    heightRatio += dyRatio;
  } else if (mode === 'resize-sw') {
    leftRatio += dxRatio;
    widthRatio -= dxRatio;
    heightRatio += dyRatio;
  } else if (mode === 'resize-ne') {
    topRatio += dyRatio;
    widthRatio += dxRatio;
    heightRatio -= dyRatio;
  } else if (mode === 'resize-nw') {
    topRatio += dyRatio;
    leftRatio += dxRatio;
    widthRatio -= dxRatio;
    heightRatio -= dyRatio;
  } else if (mode === 'resize-n') {
    topRatio += dyRatio;
    heightRatio -= dyRatio;
  } else if (mode === 'resize-s') {
    heightRatio += dyRatio;
  } else if (mode === 'resize-e') {
    widthRatio += dxRatio;
  } else if (mode === 'resize-w') {
    leftRatio += dxRatio;
    widthRatio -= dxRatio;
  }

  return clamp({ topRatio, leftRatio, widthRatio, heightRatio });
}

export function ActionEditor({
  project,
  content,
  onChange,
  onImportImage,
  onImportImageFromClipboard,
}: ActionEditorProps) {
  const stored = parseActionData(content);
  const metaRef = useRef({
    image_before: stored.image_before,
    image_after: stored.image_after,
    action_name: stored.action_name,
    title: stored.title,
  });
  metaRef.current = {
    image_before: stored.image_before,
    image_after: stored.image_after,
    action_name: stored.action_name,
    title: stored.title,
  };

  const [layout, setLayout] = useState<EditorLayout>(() => storedToEditorLayout(stored));
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const [activeTarget, setActiveTarget] = useState<ActionEditorTarget>('before');
  const [pickerTarget, setPickerTarget] = useState<'before' | 'after' | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<EditorDragState | null>(null);

  const commitLayout = useCallback(
    (next: EditorLayout) => {
      layoutRef.current = next;
      setLayout(next);
      onChange(serializeActionData(editorLayoutToStored(next, metaRef.current)));
    },
    [onChange],
  );

  const selectTarget = useCallback((target: ActionEditorTarget) => {
    setActiveTarget(target);
  }, []);

  const beginLayerDrag = (
    event: React.PointerEvent,
    layer: ActionEditorLayer,
    mode: DragMode,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const editor = editorRef.current;
    if (!editor) return;

    selectTarget(layer);
    dragRef.current = {
      kind: 'layer',
      mode,
      layer,
      startPointer: { x: event.clientX, y: event.clientY },
      startPosition: editorLayerPosition(layoutRef.current, layer),
      moved: false,
    };
    editor.setPointerCapture(event.pointerId);
  };

  const beginFrameDrag = (event: React.PointerEvent, mode: DragMode) => {
    event.preventDefault();
    event.stopPropagation();
    const editor = editorRef.current;
    if (!editor) return;

    selectTarget('frame');
    dragRef.current = {
      kind: 'frame',
      mode,
      startPointer: { x: event.clientX, y: event.clientY },
      startPosition: layoutRef.current.editor_frame_position,
      moved: false,
    };
    editor.setPointerCapture(event.pointerId);
  };

  const handleEditorPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const editor = editorRef.current;
    if (!editor) return;

    const layer = hitTestLayer(
      event.clientX,
      event.clientY,
      editor,
      layoutRef.current,
      activeTarget,
      Boolean(metaRef.current.image_after.trim()),
    );
    if (layer) {
      beginLayerDrag(event, layer, 'move');
      return;
    }

    if (hitTestFrame(event.clientX, event.clientY, editor, layoutRef.current.editor_frame_position)) {
      beginFrameDrag(event, 'move');
      return;
    }

    if (event.target === event.currentTarget) {
      selectTarget('frame');
    }
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      const editor = editorRef.current;
      if (!drag || !editor) return;

      const rect = editor.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const dxRatio = (event.clientX - drag.startPointer.x) / rect.width;
      const dyRatio = (event.clientY - drag.startPointer.y) / rect.height;
      if (Math.abs(dxRatio) > 0.002 || Math.abs(dyRatio) > 0.002) {
        drag.moved = true;
      }
      const clamp = drag.kind === 'frame' ? clampFramePosition : clampLayerPosition;
      const next = applyDrag(drag.startPosition, drag.mode, dxRatio, dyRatio, clamp);

      if (drag.kind === 'frame') {
        commitLayout({ ...layoutRef.current, editor_frame_position: next });
        return;
      }

      if (drag.layer) {
        commitLayout(patchEditorLayer(layoutRef.current, drag.layer, next));
      }
    };

    const onPointerUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [commitLayout]);

  const previewData = editorLayoutToStored(layout, metaRef.current);
  const previewContent = serializeActionData(previewData);

  const beforeSrc = metaRef.current.image_before.trim()
    ? project.imageUrls.get(metaRef.current.image_before.trim())
    : undefined;
  const afterFilename = metaRef.current.image_after.trim();
  const afterSrc = afterFilename ? project.imageUrls.get(afterFilename) : undefined;

  const canvasImageLayers = stackEditLayers(
    ['before', 'after'] as const,
    activeTarget,
    (layer) => layer === 'before' || Boolean(afterFilename),
  );

  const frameOutlineLayers = stackEditLayers(['before', 'after', 'action'] as const, activeTarget);

  const renderCanvasLayerImage = (layer: 'before' | 'after') => {
    const src = layer === 'before' ? beforeSrc : afterSrc;
    const position = editorLayerPosition(layout, layer);
    const filename = layer === 'before' ? metaRef.current.image_before : afterFilename;
    const isActive = activeTarget === layer;
    return (
      <div
        key={`canvas-${layer}`}
        className={`action-editor-image-layer${isActive ? '' : ' action-editor-image-layer-dim'}`}
        style={{
          ...layerPositionStyle(position),
          zIndex: isActive ? 4 : EDIT_LAYER_STACK[layer] + 1,
        }}
      >
        {src ? (
          <img src={src} alt={filename} className="action-editor-image" />
        ) : (
          <span className="action-editor-image-placeholder">No image</span>
        )}
      </div>
    );
  };

  const renderFrameLayerImage = (layer: 'before' | 'after') => {
    const src = layer === 'before' ? beforeSrc : afterSrc;
    const filename = layer === 'before' ? metaRef.current.image_before : afterFilename;
    const position = storedLayerPosition(previewData, layer);
    const isActive = activeTarget === layer;
    return (
      <ActionImageLayer
        key={`frame-img-${layer}`}
        src={src}
        alt={filename || layer}
        position={position}
        visible
        stackOrder={isActive ? 10 : EDIT_LAYER_STACK[layer] + 1}
        dimmed={!isActive}
      />
    );
  };

  const renderFrameLayerOutline = (layer: ActionEditorLayer) => {
    const meta = EDIT_TARGETS.find((item) => item.id === layer)!;
    const position = storedLayerPosition(previewData, layer);
    const isActive = activeTarget === layer;
    const labelPlacement = layer === 'action' ? resolveActionLabelPlacement(position) : 'above';
    return (
      <div
        key={`outline-${layer}`}
        className={`action-editor-outline${isActive ? ' action-editor-outline-active' : ''}`}
        style={{
          ...layerPositionStyle(position),
          zIndex: isActive ? 12 : EDIT_LAYER_STACK[layer] + 11,
          '--action-layer-color': meta.color,
        } as React.CSSProperties}
        aria-hidden
      >
        <span
          className={`action-editor-outline-label${labelPlacement === 'below' ? ' action-editor-outline-label-below' : ''}`}
        >
          {layer === 'action' && metaRef.current.action_name.trim()
            ? metaRef.current.action_name
            : meta.label}
        </span>
      </div>
    );
  };

  const renderLayerResizeHandles = () => {
    if (activeTarget === 'frame') return null;
    if (activeTarget === 'before' && !metaRef.current.image_before.trim()) return null;
    if (activeTarget === 'after' && !afterFilename) return null;

    const layer = activeTarget;
    const position = editorLayerPosition(layout, layer);
    const meta = EDIT_TARGETS.find((item) => item.id === layer)!;
    return (
      <div
        key={`resize-${layer}`}
        className="action-editor-resize-layer"
        style={{ ...layerPositionStyle(position), zIndex: 6 }}
        aria-hidden
      >
        <span className="action-editor-handle-label" style={{ '--action-layer-color': meta.color } as React.CSSProperties}>
          {layer === 'action' && metaRef.current.action_name.trim()
            ? metaRef.current.action_name
            : meta.label}
        </span>
        {RESIZE_HANDLES.map(({ mode, className }) => (
          <span
            key={mode}
            className={`action-editor-resize-handle ${className}`}
            style={{ '--action-layer-color': meta.color } as React.CSSProperties}
            onPointerDown={(event) => beginLayerDrag(event, layer, mode)}
          />
        ))}
      </div>
    );
  };

  const renderFrameBorderResizeHandles = () => {
    if (activeTarget !== 'frame') return null;

    return (
      <div
        className="action-editor-frame-resize-layer"
        style={framePositionStyle(layout.editor_frame_position)}
        aria-hidden
      >
        <span className="action-editor-frame-label">Frame</span>
        {FRAME_RESIZE_HANDLES.map(({ mode, className }) => (
          <span
            key={mode}
            className={`action-editor-frame-resize-handle ${className}`}
            onPointerDown={(event) => beginFrameDrag(event, mode)}
          />
        ))}
      </div>
    );
  };

  const updateMeta = (patch: Partial<Pick<ActionData, 'image_before' | 'image_after' | 'action_name' | 'title'>>) => {
    metaRef.current = { ...metaRef.current, ...patch };
    onChange(serializeActionData(editorLayoutToStored(layoutRef.current, metaRef.current)));
  };

  const loadImageNaturalSize = (src: string): Promise<{ width: number; height: number }> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = src;
    });

  const selectBeforeImage = async (filename: string, imageSrc?: string) => {
    metaRef.current = { ...metaRef.current, image_before: filename };
    let nextLayout = layoutRef.current;
    const src = imageSrc ?? project.imageUrls.get(filename.trim());
    if (src) {
      try {
        const { width, height } = await loadImageNaturalSize(src);
        nextLayout = fitEditorLayoutToBeforeImage(layoutRef.current, width, height);
      } catch {
        // Keep layout if dimensions unavailable.
      }
    }
    commitLayout(nextLayout);
    setPickerTarget(null);
  };

  return (
    <div className="action-editor">
      <aside className="action-editor-sidebar">
        <label className="action-editor-field">
          <span className="action-editor-field-label">Action name</span>
          <input
            type="text"
            className="action-editor-input"
            value={metaRef.current.action_name}
            placeholder="Action label…"
            onChange={(event) => updateMeta({ action_name: event.target.value })}
          />
        </label>

        <label className="action-editor-field">
          <span className="action-editor-field-label">Title</span>
          <input
            type="text"
            className="action-editor-input"
            value={metaRef.current.title}
            placeholder="Footer caption…"
            onChange={(event) => updateMeta({ title: event.target.value })}
          />
        </label>

        <div className="action-editor-field">
          <span className="action-editor-field-label">Before image (required)</span>
          <button
            type="button"
            className="action-editor-picker-btn"
            onClick={() => setPickerTarget('before')}
          >
            {metaRef.current.image_before.trim() || 'Select image'}
          </button>
        </div>

        <div className="action-editor-field">
          <span className="action-editor-field-label">After image (optional)</span>
          <button
            type="button"
            className="action-editor-picker-btn"
            onClick={() => setPickerTarget('after')}
          >
            {metaRef.current.image_after.trim() || 'Select image'}
          </button>
        </div>

        <div className="action-editor-field">
          <span className="action-editor-field-label">Edit layer</span>
          <div className="action-editor-layer-tabs">
            {EDIT_TARGETS.map((target) => (
              <button
                key={target.id}
                type="button"
                className={`action-editor-layer-tab${activeTarget === target.id ? ' action-editor-layer-tab-active' : ''}`}
                style={{ '--action-layer-color': target.color } as React.CSSProperties}
                onClick={() => selectTarget(target.id)}
              >
                {target.label}
              </button>
            ))}
          </div>
        </div>

        <p className="action-editor-hint">
          Layers inside the frame use the same coordinates as preview. Drag on canvas or handles.
        </p>
      </aside>

      <div className="action-editor-canvas-wrap">
        <div className="action-editor-pane-label">Layout</div>
        <div
          className="action-editor-canvas-stage"
          style={{ aspectRatio: formatRatioForCss(EDITOR_CANVAS_ASPECT) }}
        >
          <div
            ref={editorRef}
            className="action-editor-stage-inner"
            onPointerDown={handleEditorPointerDown}
          >
            {canvasImageLayers.map((layer) => renderCanvasLayerImage(layer))}
            <div
              className="action-editor-frame-preview"
              style={framePositionStyle(layout.editor_frame_position)}
            >
              <div className="action-frame-viewport">
                {stackEditLayers(['before', 'after'] as const, activeTarget, (layer) =>
                  layer === 'before' || Boolean(afterFilename),
                ).map((layer) => renderFrameLayerImage(layer))}
              </div>
              {frameOutlineLayers.map((layer) => renderFrameLayerOutline(layer))}
            </div>
            <div
              className={`action-editor-frame${activeTarget === 'frame' ? ' action-editor-frame-active' : ''}`}
              style={framePositionStyle(layout.editor_frame_position)}
              aria-hidden
            />
            {renderFrameBorderResizeHandles()}
            {renderLayerResizeHandles()}
          </div>
        </div>

        <div className="action-editor-pane-label">Preview</div>
        <div
          className="action-editor-preview-wrap"
          style={{ width: ratioToCssPercent(layout.editor_frame_position.widthRatio) }}
        >
          <ActionComponent content={previewContent} project={project} />
        </div>
      </div>

      {pickerTarget && (
        <ImagePickerDialog
          elevated
          project={project}
          selectedFilename={pickerTarget === 'before' ? metaRef.current.image_before : metaRef.current.image_after}
          onSelect={(filename, previewSrc) => {
            if (pickerTarget === 'before') {
              void selectBeforeImage(filename, previewSrc);
              return;
            }
            updateMeta({ image_after: filename });
            setPickerTarget(null);
          }}
          onClose={() => setPickerTarget(null)}
          onImport={onImportImage}
          onImportFromClipboard={onImportImageFromClipboard}
        />
      )}
    </div>
  );
}
