export type ScrollIntoContainerOptions = {
  behavior?: ScrollBehavior;
};

export function scrollElementIntoContainer(
  container: HTMLElement,
  element: HTMLElement,
  options?: ScrollIntoContainerOptions,
) {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const offset =
    elementRect.top - containerRect.top + container.scrollTop;
  const target =
    offset - container.clientHeight / 2 + element.clientHeight / 2;
  const top = Math.max(0, target);
  const behavior = options?.behavior ?? 'auto';

  if (behavior === 'smooth') {
    container.scrollTo({ top, behavior: 'smooth' });
  } else {
    container.scrollTop = top;
  }
}

export function scrollToComponentInContainer(
  container: HTMLElement | null,
  componentRefs: Map<string, HTMLElement>,
  componentId: string,
  options?: ScrollIntoContainerOptions,
): boolean {
  const element = componentRefs.get(componentId);
  if (container && element) {
    scrollElementIntoContainer(container, element, options);
    return true;
  }
  return false;
}

const SCROLL_RETRY_DELAYS_MS = [0, 0, 0, 50, 100, 200, 350, 500, 800, 1200];
/** Let a newly opened panel mount components (img/md) before measuring. */
const PANEL_COLD_OPEN_DELAY_MS = 100;
const PANEL_COLD_OPEN_LAYOUT_DELAY_MS = 320;
const LAYOUT_SETTLE_MS = 60;
const LAYOUT_MAX_WAIT_MS = 450;
/** Panel transitions + late image loads on the imgs page. */
const LAYOUT_FOLLOW_UP_MS = 2500;
const IMAGE_READY_MAX_WAIT_MS = 3000;
const SCROLL_TARGET_MAX_WAIT_MS = 2500;

function getPageContentEl(scrollEl: HTMLElement | null): HTMLElement | null {
  return scrollEl?.querySelector<HTMLElement>('.page-content') ?? null;
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

function observeLayoutChanges(
  elements: Iterable<HTMLElement | null | undefined>,
  onChange: () => void,
): () => void {
  const observed = [...elements].filter((el): el is HTMLElement => !!el);
  if (observed.length === 0) return () => {};

  const observer = new ResizeObserver(() => onChange());
  for (const el of observed) observer.observe(el);
  return () => observer.disconnect();
}

function getLayoutObserveTargets(
  scrollRef: { current: HTMLDivElement | null },
  componentRefs: { current: Map<string, HTMLElement> },
  componentId: string,
  panelRef?: { current: HTMLElement | null },
): HTMLElement[] {
  const scrollEl = scrollRef.current;
  return [
    panelRef?.current,
    scrollEl,
    getPageContentEl(scrollEl),
    componentRefs.current.get(componentId),
  ].filter((el): el is HTMLElement => !!el);
}

/** Wait for scroll container + target component DOM after a cold panel open. */
function waitForScrollTargets(
  scrollRef: { current: HTMLDivElement | null },
  componentRefs: { current: Map<string, HTMLElement> },
  componentId: string,
  onReady: () => void,
  initialDelayMs = PANEL_COLD_OPEN_DELAY_MS,
): () => void {
  let cancelled = false;
  let delayTimer: ReturnType<typeof setTimeout> | undefined;
  let raf = 0;
  const startedAt = performance.now();

  const finish = () => {
    if (cancelled) return;
    cancelled = true;
    if (delayTimer !== undefined) clearTimeout(delayTimer);
    cancelAnimationFrame(raf);
    onReady();
  };

  const tick = () => {
    if (cancelled) return;

    const hasScroll = scrollRef.current !== null;
    const hasTarget = componentRefs.current.has(componentId);
    if (hasScroll && hasTarget) {
      finish();
      return;
    }

    if (performance.now() - startedAt >= SCROLL_TARGET_MAX_WAIT_MS) {
      finish();
      return;
    }

    raf = requestAnimationFrame(tick);
  };

  delayTimer = setTimeout(() => {
    if (!cancelled) tick();
  }, initialDelayMs);

  return () => {
    cancelled = true;
    if (delayTimer !== undefined) clearTimeout(delayTimer);
    cancelAnimationFrame(raf);
  };
}

function waitForLayoutSettled(
  getTargets: () => HTMLElement[],
  onSettled: () => void,
): () => void {
  let cancelled = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  let cleanupObserve = () => {};

  const finish = () => {
    if (cancelled || settled) return;
    settled = true;
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    if (maxWaitTimer !== undefined) clearTimeout(maxWaitTimer);
    cleanupObserve();
    onSettled();
  };

  const scheduleSettle = debounce(finish, LAYOUT_SETTLE_MS);

  const attachObservers = () => {
    cleanupObserve();
    cleanupObserve = observeLayoutChanges(getTargets(), scheduleSettle);
  };

  attachObservers();
  scheduleSettle();
  maxWaitTimer = setTimeout(finish, LAYOUT_MAX_WAIT_MS);

  return () => {
    cancelled = true;
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    if (maxWaitTimer !== undefined) clearTimeout(maxWaitTimer);
    cleanupObserve();
  };
}

function waitForImagesInContainer(
  scrollRef: { current: HTMLDivElement | null },
  onReady: () => void,
): () => void {
  let cancelled = false;
  let maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Set<HTMLImageElement>();
  const listeners = new Map<HTMLImageElement, () => void>();

  let ready = false;
  const scheduleReady = debounce(() => {
    if (cancelled || ready) return;
    ready = true;
    onReady();
  }, LAYOUT_SETTLE_MS);

  const detachImg = (img: HTMLImageElement) => {
    const handler = listeners.get(img);
    if (!handler) return;
    img.removeEventListener('load', handler);
    img.removeEventListener('error', handler);
    listeners.delete(img);
    pending.delete(img);
  };

  const attachImg = (img: HTMLImageElement) => {
    if (listeners.has(img) || img.complete) return;
    pending.add(img);
    const handler = () => {
      detachImg(img);
      scheduleReady();
    };
    listeners.set(img, handler);
    img.addEventListener('load', handler);
    img.addEventListener('error', handler);
  };

  const scanImages = () => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) {
      scheduleReady();
      return;
    }
    scrollEl.querySelectorAll('img').forEach((node) => attachImg(node));
    if (pending.size === 0) scheduleReady();
  };

  const mutationObserver = new MutationObserver(scanImages);
  const scrollEl = scrollRef.current;
  if (scrollEl) {
    mutationObserver.observe(scrollEl, { childList: true, subtree: true });
  }
  scanImages();

  maxWaitTimer = setTimeout(scheduleReady, IMAGE_READY_MAX_WAIT_MS);

  return () => {
    cancelled = true;
    ready = true;
    mutationObserver.disconnect();
    if (maxWaitTimer !== undefined) clearTimeout(maxWaitTimer);
    for (const img of [...pending]) detachImg(img);
  };
}

function runScrollWithRetry(
  scrollRef: { current: HTMLDivElement | null },
  componentRefs: { current: Map<string, HTMLElement> },
  componentId: string,
  onDone: (success: boolean) => void,
  scrollOptions?: ScrollIntoContainerOptions,
): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;

  const tryScroll = () => {
    if (cancelled) return;

    if (
      scrollToComponentInContainer(
        scrollRef.current,
        componentRefs.current,
        componentId,
        scrollOptions,
      )
    ) {
      if (!cancelled) onDone(true);
      return;
    }

    attempt += 1;
    if (attempt >= SCROLL_RETRY_DELAYS_MS.length) {
      if (!cancelled) onDone(false);
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

  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}

function watchLayoutAndRescroll(
  scrollRef: { current: HTMLDivElement | null },
  componentRefs: { current: Map<string, HTMLElement> },
  componentId: string,
  panelRef?: { current: HTMLElement | null },
): () => void {
  const cleanups: (() => void)[] = [];

  const rescroll = () => {
    scrollToComponentInContainer(
      scrollRef.current,
      componentRefs.current,
      componentId,
    );
  };

  const scheduleRescroll = debounce(rescroll, LAYOUT_SETTLE_MS);

  cleanups.push(
    observeLayoutChanges(
      getLayoutObserveTargets(scrollRef, componentRefs, componentId, panelRef),
      scheduleRescroll,
    ),
  );
  cleanups.push(waitForImagesInContainer(scrollRef, scheduleRescroll));

  const stopTimer = setTimeout(() => {
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
  }, LAYOUT_FOLLOW_UP_MS);

  return () => {
    clearTimeout(stopTimer);
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
  };
}

export function scrollMdHighlightInContainer(
  container: HTMLElement | null,
  componentRefs: Map<string, HTMLElement>,
  componentId: string,
): boolean {
  if (!container) return false;

  const componentEl = componentRefs.get(componentId);
  const mark =
    componentEl?.querySelector<HTMLElement>('.md-comment-highlight-outstanding') ??
    componentEl?.querySelector<HTMLElement>('.md-comment-highlight-focused') ??
    container.querySelector<HTMLElement>('.md-comment-highlight-outstanding') ??
    container.querySelector<HTMLElement>('.md-comment-highlight-focused');
  if (!mark) return false;

  scrollElementIntoContainer(container, mark);
  return true;
}

function runMdHighlightScrollWithRetry(
  scrollRef: { current: HTMLDivElement | null },
  componentRefs: { current: Map<string, HTMLElement> },
  componentId: string,
  onDone: (success: boolean) => void,
): () => void {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;

  const tryScroll = () => {
    if (cancelled) return;

    if (
      scrollMdHighlightInContainer(
        scrollRef.current,
        componentRefs.current,
        componentId,
      )
    ) {
      if (!cancelled) onDone(true);
      return;
    }

    attempt += 1;
    if (attempt >= SCROLL_RETRY_DELAYS_MS.length) {
      if (!cancelled) onDone(false);
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

  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}

function watchLayoutAndRescrollMdHighlight(
  scrollRef: { current: HTMLDivElement | null },
  componentRefs: { current: Map<string, HTMLElement> },
  componentId: string,
  panelRef?: { current: HTMLElement | null },
): () => void {
  const cleanups: (() => void)[] = [];

  const rescroll = () => {
    scrollMdHighlightInContainer(
      scrollRef.current,
      componentRefs.current,
      componentId,
    );
  };

  const scheduleRescroll = debounce(rescroll, LAYOUT_SETTLE_MS);

  cleanups.push(
    observeLayoutChanges(
      getLayoutObserveTargets(scrollRef, componentRefs, componentId, panelRef),
      scheduleRescroll,
    ),
  );
  cleanups.push(waitForImagesInContainer(scrollRef, scheduleRescroll));

  const stopTimer = setTimeout(() => {
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
  }, LAYOUT_FOLLOW_UP_MS);

  return () => {
    clearTimeout(stopTimer);
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
  };
}

/** Scroll panel to a focused markdown comment highlight inside a component. */
export function scheduleScrollToMdCommentHighlight(
  scrollRef: { current: HTMLDivElement | null },
  componentRefs: { current: Map<string, HTMLElement> },
  componentId: string,
  panelRef?: { current: HTMLElement | null },
  onDone?: (success: boolean) => void,
): () => void {
  let cancelled = false;
  const cleanups: (() => void)[] = [];

  const cancelAll = () => {
    if (cancelled) return;
    cancelled = true;
    for (const cleanup of cleanups) cleanup();
  };

  let scrollStarted = false;
  const runScroll = () => {
    if (cancelled || scrollStarted) return;
    scrollStarted = true;

    const cleanupRetry = runMdHighlightScrollWithRetry(
      scrollRef,
      componentRefs,
      componentId,
      (success) => {
        if (cancelled) return;
        if (success) {
          cleanups.push(
            watchLayoutAndRescrollMdHighlight(
              scrollRef,
              componentRefs,
              componentId,
              panelRef,
            ),
          );
        }
        onDone?.(success);
      },
    );
    cleanups.push(cleanupRetry);
  };

  const cleanupTargetWait = waitForScrollTargets(
    scrollRef,
    componentRefs,
    componentId,
    () => {
      if (cancelled) return;

      const cleanupLayoutWait = waitForLayoutSettled(
        () => getLayoutObserveTargets(scrollRef, componentRefs, componentId, panelRef),
        () => {
          if (cancelled) return;
          const cleanupImageWait = waitForImagesInContainer(scrollRef, runScroll);
          cleanups.push(cleanupImageWait);
        },
      );
      cleanups.push(cleanupLayoutWait);
    },
  );
  cleanups.push(cleanupTargetWait);

  return cancelAll;
}

function waitForPanelOpenLayout(
  panelRef: { current: HTMLElement | null } | undefined,
  onReady: () => void,
  maxWaitMs = PANEL_COLD_OPEN_LAYOUT_DELAY_MS,
): () => void {
  const el = panelRef?.current;
  if (!el) {
    onReady();
    return () => {};
  }

  let cancelled = false;
  let done = false;
  const finish = () => {
    if (cancelled || done) return;
    done = true;
    onReady();
  };

  const onTransitionEnd = (event: TransitionEvent) => {
    if (event.target !== el) return;
    if (event.propertyName === 'flex' || event.propertyName === 'width') {
      finish();
    }
  };

  el.addEventListener('transitionend', onTransitionEnd);
  const timer = setTimeout(finish, maxWaitMs);

  return () => {
    cancelled = true;
    clearTimeout(timer);
    el.removeEventListener('transitionend', onTransitionEnd);
  };
}

export function scheduleScrollToComponent(
  scrollRef: { current: HTMLDivElement | null },
  componentRefs: { current: Map<string, HTMLElement> },
  componentId: string,
  panelRef?: { current: HTMLElement | null },
  onDone?: (success: boolean) => void,
  options?: { coldOpen?: boolean; immediate?: boolean; smooth?: boolean },
): () => void {
  const coldOpen = options?.coldOpen ?? false;
  const immediate = options?.immediate ?? false;
  const scrollOptions: ScrollIntoContainerOptions | undefined = options?.smooth
    ? { behavior: 'smooth' }
    : undefined;
  const initialDelayMs = immediate
    ? 0
    : coldOpen
      ? PANEL_COLD_OPEN_LAYOUT_DELAY_MS
      : PANEL_COLD_OPEN_DELAY_MS;
  let cancelled = false;
  const cleanups: (() => void)[] = [];

  const cancelAll = () => {
    if (cancelled) return;
    cancelled = true;
    for (const cleanup of cleanups) cleanup();
  };

  let scrollStarted = false;
  const runScroll = () => {
    if (cancelled || scrollStarted) return;
    scrollStarted = true;

    const cleanupRetry = runScrollWithRetry(
      scrollRef,
      componentRefs,
      componentId,
      (success) => {
        if (cancelled) return;
        if (success) {
          cleanups.push(
            watchLayoutAndRescroll(
              scrollRef,
              componentRefs,
              componentId,
              panelRef,
            ),
          );
        }
        onDone?.(success);
      },
      scrollOptions,
    );
    cleanups.push(cleanupRetry);
  };

  const cleanupTargetWait = waitForScrollTargets(
    scrollRef,
    componentRefs,
    componentId,
    () => {
      if (cancelled) return;

      if (immediate) {
        if (coldOpen) {
          const cleanupPanelWait = waitForPanelOpenLayout(panelRef, runScroll, 120);
          cleanups.push(cleanupPanelWait);
        } else {
          runScroll();
        }
        return;
      }

      const startLayoutWait = () => {
        const cleanupLayoutWait = waitForLayoutSettled(
          () => getLayoutObserveTargets(scrollRef, componentRefs, componentId, panelRef),
          () => {
            if (cancelled) return;
            const cleanupImageWait = waitForImagesInContainer(scrollRef, runScroll);
            cleanups.push(cleanupImageWait);
          },
        );
        cleanups.push(cleanupLayoutWait);
      };

      if (coldOpen) {
        const cleanupPanelWait = waitForPanelOpenLayout(panelRef, startLayoutWait);
        cleanups.push(cleanupPanelWait);
      } else {
        startLayoutWait();
      }
    },
    initialDelayMs,
  );
  cleanups.push(cleanupTargetWait);

  return cancelAll;
}
