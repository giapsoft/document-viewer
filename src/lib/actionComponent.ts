export interface FramePosition {
  topRatio: number;
  leftRatio: number;
  widthRatio: number;
  heightRatio: number;
}

/** Fixed editor canvas height ÷ width — not stored for preview. */
export const FIXED_EDITOR_RATIO = 9 / 16;
/** Fixed editor canvas width ÷ height (CSS aspect-ratio). */
export const EDITOR_CANVAS_ASPECT = 1 / FIXED_EDITOR_RATIO;

export interface ActionData {
  /** Component frame display aspect ratio (width ÷ height). Used by preview only. */
  frame_ratio: number;
  /** Component frame rect inside the fixed editor — editor restore only. */
  editor_frame_position: FramePosition;
  image_before: string;
  image_after: string;
  action_name: string;
  /** Caption shown in the footer beside the replay button. */
  title: string;
  /** Positions relative to component frame (0 = frame top-left). */
  image_before_position: FramePosition;
  image_after_position: FramePosition;
  action_position: FramePosition;
}

export interface EditorLayout {
  editor_frame_position: FramePosition;
  image_before_position: FramePosition;
  image_after_position: FramePosition;
  action_position: FramePosition;
}

export type ActionEditorLayer = 'before' | 'after' | 'action';
export type ActionEditorTarget = 'frame' | ActionEditorLayer;

export const MIN_FRAME_RATIO = 0.2;
export const MAX_FRAME_RATIO = 4;

export function clampFrameRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 16 / 9;
  return Math.min(MAX_FRAME_RATIO, Math.max(MIN_FRAME_RATIO, ratio));
}

const MIN_RATIO = 0.02;
const MAX_RATIO = 1;

export function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_RATIO, Math.max(0, value));
}

/** Component frame inside the fixed editor — bounded to editor canvas. */
export function clampFramePosition(position: FramePosition): FramePosition {
  const widthRatio = Math.max(MIN_RATIO, clampRatio(position.widthRatio));
  const heightRatio = Math.max(MIN_RATIO, clampRatio(position.heightRatio));
  const leftRatio = clampRatio(position.leftRatio);
  const topRatio = clampRatio(position.topRatio);
  return {
    topRatio: Math.min(topRatio, 1 - heightRatio),
    leftRatio: Math.min(leftRatio, 1 - widthRatio),
    widthRatio,
    heightRatio,
  };
}

/**
 * Format ratio values for CSS without coarse rounding.
 * 8 decimal places → under 0.01px error on a 1000px-wide canvas (vs ~10px at 2 decimals).
 */
const CSS_RATIO_SCALE = 100_000_000;

export function formatRatioForCss(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * CSS_RATIO_SCALE) / CSS_RATIO_SCALE);
}

export function ratioToCssPercent(ratio: number): string {
  return `${formatRatioForCss(ratio * 100)}%`;
}

/** Free objects in the fixed editor or component-relative stored coords. */
export function clampLayerPosition(position: FramePosition): FramePosition {
  return {
    topRatio: Number.isFinite(position.topRatio) ? position.topRatio : 0,
    leftRatio: Number.isFinite(position.leftRatio) ? position.leftRatio : 0,
    widthRatio: Math.max(MIN_RATIO, Number.isFinite(position.widthRatio) ? position.widthRatio : 1),
    heightRatio: Math.max(MIN_RATIO, Number.isFinite(position.heightRatio) ? position.heightRatio : 1),
  };
}

export function framePositionStyle(position: FramePosition): {
  top: string;
  left: string;
  width: string;
  height: string;
} {
  const clamped = clampFramePosition(position);
  return {
    top: ratioToCssPercent(clamped.topRatio),
    left: ratioToCssPercent(clamped.leftRatio),
    width: ratioToCssPercent(clamped.widthRatio),
    height: ratioToCssPercent(clamped.heightRatio),
  };
}

/** Prefer below when the zone is too close to the frame top for a label above. */
export function resolveActionLabelPlacement(position: FramePosition): 'above' | 'below' {
  const p = clampLayerPosition(position);
  const spaceAbove = p.topRatio;
  const spaceBelow = 1 - (p.topRatio + p.heightRatio);
  const labelSpace = 0.12;
  if (spaceAbove < labelSpace && spaceBelow >= spaceAbove) return 'below';
  if (spaceBelow < labelSpace && spaceAbove > spaceBelow) return 'above';
  return spaceAbove >= labelSpace ? 'above' : 'below';
}

export function layerPositionStyle(position: FramePosition): {
  top: string;
  left: string;
  width: string;
  height: string;
} {
  const clamped = clampLayerPosition(position);
  return {
    top: ratioToCssPercent(clamped.topRatio),
    left: ratioToCssPercent(clamped.leftRatio),
    width: ratioToCssPercent(clamped.widthRatio),
    height: ratioToCssPercent(clamped.heightRatio),
  };
}

const DEFAULT_FULL_FRAME: FramePosition = {
  topRatio: 0,
  leftRatio: 0,
  widthRatio: 1,
  heightRatio: 1,
};

export function createDefaultActionData(): ActionData {
  return {
    frame_ratio: 16 / 9,
    editor_frame_position: { ...DEFAULT_FULL_FRAME },
    image_before: '',
    image_after: '',
    action_name: 'Click',
    title: '',
    image_before_position: { ...DEFAULT_FULL_FRAME },
    image_after_position: { ...DEFAULT_FULL_FRAME },
    action_position: {
      topRatio: 0.35,
      leftRatio: 0.35,
      widthRatio: 0.3,
      heightRatio: 0.3,
    },
  };
}

function parseBoundedFramePosition(raw: unknown): FramePosition {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FULL_FRAME };
  const value = raw as Record<string, unknown>;
  return clampFramePosition({
    topRatio: Number(value.topRatio ?? 0),
    leftRatio: Number(value.leftRatio ?? 0),
    widthRatio: Number(value.widthRatio ?? 1),
    heightRatio: Number(value.heightRatio ?? 1),
  });
}

function parseLayerPosition(raw: unknown): FramePosition {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FULL_FRAME };
  const value = raw as Record<string, unknown>;
  return clampLayerPosition({
    topRatio: Number(value.topRatio ?? 0),
    leftRatio: Number(value.leftRatio ?? 0),
    widthRatio: Number(value.widthRatio ?? 1),
    heightRatio: Number(value.heightRatio ?? 1),
  });
}

/** Editor coords → component-frame-relative (persist / preview). */
export function editorToComponentPosition(
  editorFrame: FramePosition,
  editorPos: FramePosition,
): FramePosition {
  const f = clampFramePosition(editorFrame);
  const e = clampLayerPosition(editorPos);
  if (f.widthRatio <= 0 || f.heightRatio <= 0) return e;
  return clampLayerPosition({
    leftRatio: (e.leftRatio - f.leftRatio) / f.widthRatio,
    topRatio: (e.topRatio - f.topRatio) / f.heightRatio,
    widthRatio: e.widthRatio / f.widthRatio,
    heightRatio: e.heightRatio / f.heightRatio,
  });
}

/** Component-frame-relative → editor coords (load into editor). */
export function componentToEditorPosition(
  editorFrame: FramePosition,
  componentPos: FramePosition,
): FramePosition {
  const f = clampFramePosition(editorFrame);
  const c = clampLayerPosition(componentPos);
  return clampLayerPosition({
    leftRatio: f.leftRatio + c.leftRatio * f.widthRatio,
    topRatio: f.topRatio + c.topRatio * f.heightRatio,
    widthRatio: c.widthRatio * f.widthRatio,
    heightRatio: c.heightRatio * f.heightRatio,
  });
}

export function deriveFrameRatioFromEditorFrame(editorFrame: FramePosition): number {
  const f = clampFramePosition(editorFrame);
  const heightFactor = f.heightRatio * FIXED_EDITOR_RATIO;
  if (heightFactor <= 0) return 16 / 9;
  return clampFrameRatio(f.widthRatio / heightFactor);
}

/** Max frame rect in the fixed editor that matches image aspect (contain, centered). */
export function computeFrameFitForImage(
  imageWidth: number,
  imageHeight: number,
): { editor_frame_position: FramePosition; image_before_position: FramePosition } {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) {
    return {
      editor_frame_position: { ...DEFAULT_FULL_FRAME },
      image_before_position: { ...DEFAULT_FULL_FRAME },
    };
  }

  const imageAspect = imageWidth / imageHeight;
  let widthRatio: number;
  let heightRatio: number;

  if (imageAspect >= EDITOR_CANVAS_ASPECT) {
    widthRatio = 1;
    heightRatio = 1 / (imageAspect * FIXED_EDITOR_RATIO);
  } else {
    widthRatio = imageAspect * FIXED_EDITOR_RATIO;
    heightRatio = 1;
  }

  const editor_frame_position = clampFramePosition({
    leftRatio: (1 - widthRatio) / 2,
    topRatio: (1 - heightRatio) / 2,
    widthRatio,
    heightRatio,
  });

  return {
    editor_frame_position,
    image_before_position: { ...DEFAULT_FULL_FRAME },
  };
}

/** Refit component frame + before image after choosing a before image. */
export function fitEditorLayoutToBeforeImage(
  layout: EditorLayout,
  imageWidth: number,
  imageHeight: number,
): EditorLayout {
  const fit = computeFrameFitForImage(imageWidth, imageHeight);
  return {
    ...layout,
    editor_frame_position: fit.editor_frame_position,
    image_before_position: componentToEditorPosition(
      fit.editor_frame_position,
      fit.image_before_position,
    ),
  };
}

/** Contain-fit image layer inside component frame (0–1), centered. Frame aspect from frame_ratio. */
export function computeLayerFitInComponentFrame(
  imageWidth: number,
  imageHeight: number,
  frameRatio: number,
): FramePosition {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) {
    return { ...DEFAULT_FULL_FRAME };
  }

  const frameAspect = clampFrameRatio(frameRatio);
  const imageAspect = imageWidth / imageHeight;
  let widthRatio: number;
  let heightRatio: number;

  if (imageAspect >= frameAspect) {
    widthRatio = 1;
    heightRatio = frameAspect / imageAspect;
  } else {
    heightRatio = 1;
    widthRatio = imageAspect / frameAspect;
  }

  return clampLayerPosition({
    leftRatio: (1 - widthRatio) / 2,
    topRatio: (1 - heightRatio) / 2,
    widthRatio,
    heightRatio,
  });
}

/** Contain-fit a before/after layer inside the current component frame; editor frame unchanged. */
export function fitEditorLayoutLayerInFrame(
  layout: EditorLayout,
  layer: 'before' | 'after',
  imageWidth: number,
  imageHeight: number,
): EditorLayout {
  const frameRatio = deriveFrameRatioFromEditorFrame(layout.editor_frame_position);
  const componentPos = computeLayerFitInComponentFrame(imageWidth, imageHeight, frameRatio);
  const editorPos = componentToEditorPosition(layout.editor_frame_position, componentPos);
  if (layer === 'before') {
    return { ...layout, image_before_position: editorPos };
  }
  return { ...layout, image_after_position: editorPos };
}

/** Refit after image inside the current component frame; editor frame unchanged. */
export function fitEditorLayoutToAfterImage(
  layout: EditorLayout,
  imageWidth: number,
  imageHeight: number,
): EditorLayout {
  return fitEditorLayoutLayerInFrame(layout, 'after', imageWidth, imageHeight);
}

export function storedToEditorLayout(data: ActionData): EditorLayout {
  const ef = data.editor_frame_position;
  return {
    editor_frame_position: { ...ef },
    image_before_position: componentToEditorPosition(ef, data.image_before_position),
    image_after_position: componentToEditorPosition(ef, data.image_after_position),
    action_position: componentToEditorPosition(ef, data.action_position),
  };
}

export function editorLayoutToStored(
  layout: EditorLayout,
  meta: Pick<ActionData, 'image_before' | 'image_after' | 'action_name' | 'title'>,
): ActionData {
  const ef = clampFramePosition(layout.editor_frame_position);
  return {
    ...meta,
    frame_ratio: deriveFrameRatioFromEditorFrame(ef),
    editor_frame_position: ef,
    image_before_position: editorToComponentPosition(ef, layout.image_before_position),
    image_after_position: editorToComponentPosition(ef, layout.image_after_position),
    action_position: editorToComponentPosition(ef, layout.action_position),
  };
}

function migrateLegacyRaw(raw: Record<string, unknown>): ActionData {
  const fallback = createDefaultActionData();

  if (raw.editor_frame_position != null && raw.position_space !== 'stage') {
    return {
      frame_ratio: clampFrameRatio(Number(raw.frame_ratio ?? fallback.frame_ratio)),
      editor_frame_position: parseBoundedFramePosition(raw.editor_frame_position),
      image_before: String(raw.image_before ?? ''),
      image_after: String(raw.image_after ?? ''),
      action_name: String(raw.action_name ?? fallback.action_name),
      title: String(raw.title ?? ''),
      image_before_position: parseLayerPosition(raw.image_before_position),
      image_after_position: parseLayerPosition(raw.image_after_position),
      action_position: parseLayerPosition(raw.action_position),
    };
  }

  const editorFrame = raw.frame_position != null
    ? parseBoundedFramePosition(raw.frame_position)
    : { ...DEFAULT_FULL_FRAME };

  let imageBefore = parseLayerPosition(raw.image_before_position);
  let imageAfter = parseLayerPosition(raw.image_after_position);
  let actionPos = parseLayerPosition(raw.action_position);

  if (raw.position_space === 'stage') {
    imageBefore = editorToComponentPosition(editorFrame, imageBefore);
    imageAfter = editorToComponentPosition(editorFrame, imageAfter);
    actionPos = editorToComponentPosition(editorFrame, actionPos);
  } else if (raw.frame_ratio != null && raw.stage_ratio == null && raw.frame_position == null) {
    // Legacy: positions already component-frame-relative
  } else if (raw.stage_ratio != null || raw.frame_position != null) {
    imageBefore = editorToComponentPosition(editorFrame, imageBefore);
    imageAfter = editorToComponentPosition(editorFrame, imageAfter);
    actionPos = editorToComponentPosition(editorFrame, actionPos);
  }

  const frameRatio = raw.frame_ratio != null
    ? clampFrameRatio(Number(raw.frame_ratio))
    : deriveFrameRatioFromEditorFrame(editorFrame);

  return {
    frame_ratio: frameRatio,
    editor_frame_position: editorFrame,
    image_before: String(raw.image_before ?? ''),
    image_after: String(raw.image_after ?? ''),
    action_name: String(raw.action_name ?? fallback.action_name),
    title: String(raw.title ?? ''),
    image_before_position: imageBefore,
    image_after_position: imageAfter,
    action_position: actionPos,
  };
}

export function parseActionData(content: string): ActionData {
  const trimmed = content.trim();
  if (!trimmed) return createDefaultActionData();

  try {
    return migrateLegacyRaw(JSON.parse(trimmed) as Record<string, unknown>);
  } catch {
    return createDefaultActionData();
  }
}

export function serializeActionData(data: ActionData): string {
  const normalized: ActionData = {
    ...data,
    frame_ratio: clampFrameRatio(data.frame_ratio),
    editor_frame_position: clampFramePosition(data.editor_frame_position),
    image_before_position: clampLayerPosition(data.image_before_position),
    image_after_position: clampLayerPosition(data.image_after_position),
    action_position: clampLayerPosition(data.action_position),
  };
  return JSON.stringify(normalized);
}

export function resolveActionAfterImage(data: ActionData): string {
  return data.image_after.trim();
}

export function collectActionImageFilenames(content: string): string[] {
  const data = parseActionData(content);
  const names: string[] = [];
  const before = data.image_before.trim();
  const after = data.image_after.trim();
  if (before) names.push(before);
  if (after) names.push(after);
  return names;
}

export function createInitialActionContent(): string {
  return serializeActionData(createDefaultActionData());
}

export function collectActionImageFilenamesFromProject(
  pages: Array<{ components: Array<{ type: string; content: string }> }>,
): Set<string> {
  const names = new Set<string>();
  for (const page of pages) {
    for (const component of page.components) {
      if (component.type !== 'action') continue;
      for (const name of collectActionImageFilenames(component.content)) {
        names.add(name);
      }
    }
  }
  return names;
}
