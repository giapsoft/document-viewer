export function scrollElementIntoContainer(
  container: HTMLElement,
  element: HTMLElement,
  behavior: ScrollBehavior = 'smooth',
) {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const offset =
    elementRect.top - containerRect.top + container.scrollTop;
  const target =
    offset - container.clientHeight / 2 + element.clientHeight / 2;

  container.scrollTo({
    top: Math.max(0, target),
    behavior,
  });
}

export function scrollToComponentInContainer(
  container: HTMLElement | null,
  componentRefs: Map<string, HTMLElement>,
  componentId: string,
): boolean {
  const element = componentRefs.get(componentId);
  if (container && element) {
    scrollElementIntoContainer(container, element);
    return true;
  }
  return false;
}

const SCROLL_RETRY_DELAYS_MS = [0, 0, 0, 50, 100, 200, 350, 500];

export function scheduleScrollToComponent(
  scrollRef: { current: HTMLDivElement | null },
  componentRefs: { current: Map<string, HTMLElement> },
  componentId: string,
  panelRef?: { current: HTMLElement | null },
  onDone?: (success: boolean) => void,
): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const runScrollWithRetry = () => {
    let attempt = 0;

    const tryScroll = () => {
      if (cancelled) return;

      if (scrollToComponentInContainer(
        scrollRef.current,
        componentRefs.current,
        componentId,
      )) {
        if (!cancelled) onDone?.(true);
        return;
      }

      attempt += 1;
      if (attempt >= SCROLL_RETRY_DELAYS_MS.length) {
        if (!cancelled) onDone?.(false);
        return;
      }

      const delay = SCROLL_RETRY_DELAYS_MS[attempt];
      if (delay === 0) {
        requestAnimationFrame(tryScroll);
      } else {
        timer = setTimeout(tryScroll, delay);
      }
    };

    tryScroll();
  };

  const panel = panelRef?.current;
  // Shrunk panels are 36px wide; wait for the expand transition before measuring layout.
  if (!panel || panel.offsetWidth > 48) {
    runScrollWithRetry();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }

  let finished = false;
  const finish = () => {
    if (finished || cancelled) return;
    finished = true;
    panel.removeEventListener('transitionend', onTransitionEnd);
    clearTimeout(fallbackTimer);
    runScrollWithRetry();
  };

  const onTransitionEnd = (e: TransitionEvent) => {
    if (e.target !== panel) return;
    finish();
  };

  panel.addEventListener('transitionend', onTransitionEnd);
  const fallbackTimer = setTimeout(finish, 280);

  return () => {
    cancelled = true;
    finished = true;
    panel.removeEventListener('transitionend', onTransitionEnd);
    clearTimeout(fallbackTimer);
    if (timer !== undefined) clearTimeout(timer);
  };
}
