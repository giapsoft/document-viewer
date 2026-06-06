import { useEffect, useRef } from 'react';
import { isTypingTarget } from '../lib/keyboard';

interface UseCtrlLinkModeHoldOptions {
  enabled: boolean;
  linkMode: boolean;
  setLinkMode: (enabled: boolean) => void;
}

/** Hold Control to enter link mode; release to exit (when entered via Ctrl). */
export function useCtrlLinkModeHold({
  enabled,
  linkMode,
  setLinkMode,
}: UseCtrlLinkModeHoldOptions) {
  const heldViaCtrlRef = useRef(false);
  const linkModeRef = useRef(linkMode);
  linkModeRef.current = linkMode;

  useEffect(() => {
    if (!enabled) return;

    const exitIfHeld = () => {
      if (!heldViaCtrlRef.current) return;
      heldViaCtrlRef.current = false;
      setLinkMode(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Control' || e.repeat) return;
      if (isTypingTarget(e.target)) return;
      if (linkModeRef.current && !heldViaCtrlRef.current) return;

      heldViaCtrlRef.current = true;
      setLinkMode(true);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== 'Control') return;
      exitIfHeld();
    };

    const onBlur = () => exitIfHeld();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled, setLinkMode]);
}
