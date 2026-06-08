import { useEffect, useRef, useState } from 'react';

const DEFAULT_INTERVAL_MS = 45_000;

export function useRemoteStalePoll(
  enabled: boolean,
  checkStale: () => Promise<boolean>,
  intervalMs = DEFAULT_INTERVAL_MS,
  /** Re-run stale check when this value changes (e.g. after reload). */
  refreshKey?: string | null,
  /** Called when server is newer; e.g. auto-reload when the session is not dirty. */
  onStale?: () => void | Promise<void>,
): boolean {
  const [stale, setStale] = useState(false);
  const onStaleRef = useRef(onStale);
  onStaleRef.current = onStale;
  const pullingRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setStale(false);
      return;
    }

    let cancelled = false;

    const tick = async () => {
      try {
        const nextStale = await checkStale();
        if (cancelled) return;

        if (nextStale && onStaleRef.current && !pullingRef.current) {
          pullingRef.current = true;
          try {
            await onStaleRef.current();
          } finally {
            pullingRef.current = false;
          }
          if (cancelled) return;
          const stillStale = await checkStale();
          if (!cancelled) setStale(stillStale);
          return;
        }

        setStale(nextStale);
      } catch {
        if (!cancelled) setStale(false);
      }
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, checkStale, intervalMs, refreshKey]);

  return stale;
}
