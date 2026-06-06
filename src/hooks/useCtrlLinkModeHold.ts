import { useEffect, useRef } from 'react';
import { isTypingTarget } from '../lib/keyboard';

interface UseCtrlLinkModeHoldOptions {
  enabled: boolean;
  ctrlActive: boolean;
  setCtrlActive: (active: boolean) => void;
  /** End Ctrl session — persist only when preview changed. */
  onRelease: () => void;
}

/** Hold Control to preview component links in temp state; release to persist if changed. */
export function useCtrlLinkModeHold({
  enabled,
  ctrlActive,
  setCtrlActive,
  onRelease,
}: UseCtrlLinkModeHoldOptions) {
  const heldViaCtrlRef = useRef(false);
  const endingSessionRef = useRef(false);
  const ctrlActiveRef = useRef(ctrlActive);
  ctrlActiveRef.current = ctrlActive;

  useEffect(() => {
    if (!enabled) return;

    const endSession = () => {
      if (!heldViaCtrlRef.current || endingSessionRef.current) return;
      endingSessionRef.current = true;
      heldViaCtrlRef.current = false;
      try {
        onRelease();
      } finally {
        endingSessionRef.current = false;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Control' || e.repeat) return;
      if (isTypingTarget(e.target)) return;
      if (ctrlActiveRef.current && !heldViaCtrlRef.current) return;

      heldViaCtrlRef.current = true;
      setCtrlActive(true);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Control') return;
      endSession();
    };

    const onBlur = () => endSession();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled, setCtrlActive, onRelease]);
}
