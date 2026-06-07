const DEFAULT_CONCURRENCY = 8;
/** Background image hydration — keep low so text/metadata keep bandwidth. */
const REMOTE_IMAGE_LOAD_CONCURRENCY = 2;
/** Background markdown sidecars — moderate concurrency after editor opens. */
const REMOTE_MD_LOAD_CONCURRENCY = 4;

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await fn(items[index], index);
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function runWithConcurrency(
  tasks: Array<() => Promise<void>>,
  concurrency = DEFAULT_CONCURRENCY,
): Promise<void> {
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      await tasks[index]();
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker()),
  );
}

export { DEFAULT_CONCURRENCY, REMOTE_IMAGE_LOAD_CONCURRENCY, REMOTE_MD_LOAD_CONCURRENCY };
