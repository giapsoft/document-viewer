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
): void {
  const element = componentRefs.get(componentId);
  if (container && element) {
    scrollElementIntoContainer(container, element);
  }
}

export function scheduleScrollToComponent(
  scrollRef: { current: HTMLDivElement | null },
  componentRefs: { current: Map<string, HTMLElement> },
  componentId: string,
  panelRef?: { current: HTMLElement | null },
): () => void {
  let cancelled = false;

  const runScroll = () => {
    if (cancelled) return;
    const tryScroll = () => {
      if (cancelled) return;
      scrollToComponentInContainer(
        scrollRef.current,
        componentRefs.current,
        componentId,
      );
    };
    requestAnimationFrame(() => {
      tryScroll();
      requestAnimationFrame(tryScroll);
    });
  };

  const panel = panelRef?.current;
  // Shrunk panels are 36px wide; wait for the expand transition before measuring layout.
  if (!panel || panel.offsetWidth > 48) {
    runScroll();
    return () => {
      cancelled = true;
    };
  }

  let finished = false;
  const finish = () => {
    if (finished || cancelled) return;
    finished = true;
    panel.removeEventListener('transitionend', onTransitionEnd);
    clearTimeout(fallbackTimer);
    runScroll();
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
  };
}
