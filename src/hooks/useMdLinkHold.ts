import { useEffect, useRef } from 'react';
import { isTypingTarget } from '../lib/keyboard';

interface UseMdLinkHoldOptions {
  enabled: boolean;
  ctrlActive: boolean;
  setCtrlActive: (active: boolean) => void;
  /** Return true when Alt-hold should enter md link mode (e.g. range captured). */
  onActivate: () => boolean;
  onRelease: () => void;
}

/** Hold Alt to link the current md text selection to another component. */
export function useMdLinkHold({
  enabled,
  ctrlActive,
  setCtrlActive,
  onActivate,
  onRelease,
}: UseMdLinkHoldOptions) {
  const heldViaAltRef = useRef(false);
  const endingSessionRef = useRef(false);
  const ctrlActiveRef = useRef(ctrlActive);
  ctrlActiveRef.current = ctrlActive;
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  useEffect(() => {
    if (!enabled) return;

    const endSession = () => {
      if (!heldViaAltRef.current || endingSessionRef.current) return;
      endingSessionRef.current = true;
      heldViaAltRef.current = false;
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
        if (ctrlActiveRef.current && !heldViaAltRef.current) return;
        if (!onActivateRef.current()) return;
        heldViaAltRef.current = true;
        setCtrlActive(true);
        return;
      }
      if (heldViaAltRef.current && e.key !== 'Alt') {
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
