import { useCallback, useEffect, useRef, useState } from 'react';
import type { LoadedProject } from '../types';
import {
  formatRatioForCss,
  layerPositionStyle,
  parseActionData,
  resolveActionAfterImage,
  resolveActionLabelPlacement,
  type ActionData,
  type FramePosition,
} from '../lib/actionComponent';

const BLINK_MS = 3000;
const FADE_MS = 500;
const HOLD_AFTER_MS = 5000;

type PlayPhase = 'idle' | 'blink' | 'fade' | 'after';

interface ActionComponentProps {
  content: string;
  project: LoadedProject;
  pendingImageNames?: ReadonlySet<string>;
}

interface ActionFrameViewportProps {
  data: ActionData;
  project: LoadedProject;
  pendingImageNames?: ReadonlySet<string>;
  phase: PlayPhase;
}

export function ActionFrameViewport({
  data,
  project,
  pendingImageNames,
  phase,
}: ActionFrameViewportProps) {
  const beforeFilename = data.image_before.trim();
  const afterFilename = resolveActionAfterImage(data);
  const beforeSrc = beforeFilename ? project.imageUrls.get(beforeFilename) : undefined;
  const afterSrc = afterFilename ? project.imageUrls.get(afterFilename) : undefined;
  const beforePending = beforeFilename ? (pendingImageNames?.has(beforeFilename) ?? false) : false;
  const afterPending = afterFilename ? (pendingImageNames?.has(afterFilename) ?? false) : false;

  const showBefore = phase === 'idle' || phase === 'blink' || phase === 'fade';
  const showAfter = phase === 'after';
  const showCover = phase === 'blink' || phase === 'fade';
  const coverFading = phase === 'fade';

  return (
    <div className="action-frame-viewport">
      {showBefore && (
        beforePending ? (
          <span className="loading-image action-frame-loading">Loading image…</span>
        ) : (
          <ActionImageLayer
            src={beforeSrc}
            alt={beforeFilename || 'before'}
            position={data.image_before_position}
            visible
            stackOrder={1}
          />
        )
      )}
      {showAfter && afterFilename && (
        afterPending ? (
          <span className="loading-image action-frame-loading">Loading image…</span>
        ) : (
          <ActionImageLayer
            src={afterSrc}
            alt={afterFilename || 'after'}
            position={data.image_after_position}
            visible
            fadingIn
            stackOrder={2}
          />
        )
      )}

      {showCover && data.action_name.trim() && (
        <ActionCoverOverlay
          position={data.action_position}
          label={data.action_name}
          blinking={phase === 'blink'}
          fading={coverFading}
        />
      )}
    </div>
  );
}

export function ActionImageLayer({
  src,
  alt,
  position,
  visible,
  fadingIn,
  stackOrder,
  dimmed,
}: {
  src: string | undefined;
  alt: string;
  position: FramePosition;
  visible: boolean;
  fadingIn?: boolean;
  stackOrder?: number;
  dimmed?: boolean;
}) {
  if (!visible) return null;

  return (
    <div
      className={`action-image-layer${dimmed ? ' action-image-layer-dim' : ''}`}
      style={{
        ...layerPositionStyle(position),
        ...(stackOrder != null ? { zIndex: stackOrder } : {}),
      }}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          className={`action-image${fadingIn ? ' action-image-appear' : ''}`}
        />
      ) : (
        <span className="action-image-missing">No image</span>
      )}
    </div>
  );
}

export function ActionComponent({ content, project, pendingImageNames }: ActionComponentProps) {
  const data = parseActionData(content);
  const [phase, setPhase] = useState<PlayPhase>('idle');
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }, []);

  const hasAfterImage = data.image_after.trim().length > 0;

  const startRunning = useCallback(() => {
    clearTimers();
    setPhase('blink');

    const fadeTimer = window.setTimeout(() => setPhase('fade'), BLINK_MS);
    if (hasAfterImage) {
      const afterTimer = window.setTimeout(() => setPhase('after'), BLINK_MS + FADE_MS);
      const idleTimer = window.setTimeout(
        () => setPhase('idle'),
        BLINK_MS + FADE_MS + HOLD_AFTER_MS,
      );
      timersRef.current = [fadeTimer, afterTimer, idleTimer];
    } else {
      const idleTimer = window.setTimeout(() => setPhase('idle'), BLINK_MS + FADE_MS);
      timersRef.current = [fadeTimer, idleTimer];
    }
  }, [clearTimers, hasAfterImage]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const isRunning = phase !== 'idle';

  const frameRatioCss = formatRatioForCss(data.frame_ratio);

  return (
    <div
      className="action-component"
      style={{ '--action-frame-ratio': frameRatioCss } as React.CSSProperties}
    >
      <div
        className="action-frame"
        style={{ aspectRatio: frameRatioCss }}
      >
        <ActionFrameViewport
          data={data}
          project={project}
          pendingImageNames={pendingImageNames}
          phase={phase}
        />
      </div>
      <div className="action-frame-footer">
        <div className="action-frame-footer-start">
          {isRunning ? (
            <span
              className="action-play-indicator"
              role="status"
              aria-label="Running"
              title="Running"
            >
              <span className="action-play-spinner" aria-hidden />
            </span>
          ) : (
            <button
              type="button"
              className="action-play-btn"
              onClick={(event) => {
                event.stopPropagation();
                startRunning();
              }}
              title="Play animation"
              aria-label="Play animation"
            >
              <span className="action-play-icon" aria-hidden>
                ▶
              </span>
            </button>
          )}
          {data.title.trim() && (
            <span className="action-frame-title">{data.title}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionCoverOverlay({
  position,
  label,
  blinking,
  fading,
}: {
  position: FramePosition;
  label: string;
  blinking: boolean;
  fading: boolean;
}) {
  const style = layerPositionStyle(position);
  const placement = resolveActionLabelPlacement(position);
  const bubbleAbove = placement === 'above';

  return (
    <>
      <div
        className={`action-cover-zone${blinking ? ' action-cover-zone-blink' : ''}${fading ? ' action-cover-zone-fade-out' : ''}`}
        style={style}
      />
      <div
        className={`action-bubble action-bubble-${placement}${fading ? ' action-bubble-fade-out' : ''}`}
        style={{
          top: bubbleAbove ? style.top : `calc(${style.top} + ${style.height})`,
          left: `calc(${style.left} + ${style.width} / 2)`,
        }}
      >
        <span className="action-bubble-text">{label}</span>
        <span className="action-bubble-tail" aria-hidden />
      </div>
    </>
  );
}
