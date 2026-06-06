import { useEffect, useState } from 'react';

const DEFAULT_INTERVAL_MS = 45_000;

export function useRemoteStalePoll(
  enabled: boolean,
  checkStale: () => Promise<boolean>,
  intervalMs = DEFAULT_INTERVAL_MS,
): boolean {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setStale(false);
      return;
    }

    let cancelled = false;

    const tick = async () => {
      try {
        const nextStale = await checkStale();
        if (!cancelled) setStale(nextStale);
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
  }, [enabled, checkStale, intervalMs]);

  return stale;
}
