/**
 * Concurrency-limited task execution pool.
 *
 * Instead of Promise.all() (all at once) or sequential awaits (one at a time),
 * this runs N tasks concurrently with a configurable limit.
 *
 * Example: 65 tool calls with concurrency 10 = 7 waves of 10 parallel calls
 * → 65 sequential calls at 100ms each = 6.5s
 * → 7 waves at 100ms each = 0.7s (9x faster)
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<Array<{ status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown }>> {
  const results: Array<{ status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown }> = [];
  let index = 0;

  async function runNext(): Promise<void> {
    while (index < tasks.length) {
      const currentIndex = index++;
      try {
        const value = await tasks[currentIndex]();
        results[currentIndex] = { status: "fulfilled", value };
      } catch (reason) {
        results[currentIndex] = { status: "rejected", reason };
      }
    }
  }

  // Start N workers that each pull from the task queue
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => runNext());
  await Promise.all(workers);

  return results;
}

/**
 * Map over items with concurrency limit.
 * Convenience wrapper around runWithConcurrency.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<Array<{ item: T; result?: R; error?: unknown }>> {
  let idx = 0;
  const tasks = items.map((item, i) => async () => fn(item, i));
  const results = await runWithConcurrency(tasks, concurrency);

  return items.map((item, i) => {
    const r = results[i];
    if (r.status === "fulfilled") return { item, result: r.value };
    return { item, error: r.reason };
  });
}
