import { useEffect, useRef } from 'react';
import { isTypingTarget } from '../lib/keyboard';

interface UseCtrlCommentLinkHoldOptions {
  /** A comment is selected and linkable. */
  enabled: boolean;
  ctrlActive: boolean;
  setCtrlActive: (active: boolean) => void;
  /** End Ctrl session — persist only when preview changed. */
  onRelease: () => void;
}

/** Hold Control to preview comment anchors in temp state; release to persist if changed. */
export function useCtrlCommentLinkHold({
  enabled,
  ctrlActive,
  setCtrlActive,
  onRelease,
}: UseCtrlCommentLinkHoldOptions) {
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
      if (e.key === 'Alt' && !e.repeat) {
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        if (isTypingTarget(e.target)) return;
        if (ctrlActiveRef.current && !heldViaCtrlRef.current) return;
        heldViaCtrlRef.current = true;
        setCtrlActive(true);
        return;
      }
      // Any other key pressed while Alt is held → cancel the session
      if (heldViaCtrlRef.current && e.key !== 'Alt') {
        endSession();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
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
