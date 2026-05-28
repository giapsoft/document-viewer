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
): () => void {
  let cancelled = false;

  const tryScroll = () => {
    if (cancelled) return;
    scrollToComponentInContainer(
      scrollRef.current,
      componentRefs.current,
      componentId,
    );
  };

  const frame = requestAnimationFrame(() => {
    tryScroll();
    requestAnimationFrame(tryScroll);
  });

  return () => {
    cancelled = true;
    cancelAnimationFrame(frame);
  };
}
