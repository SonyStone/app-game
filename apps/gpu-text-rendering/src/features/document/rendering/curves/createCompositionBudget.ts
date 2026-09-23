import { ResultAsync } from 'neverthrow';

/**
 * Retains composed prefixes after two consecutive direct-draw completion samples
 * exceed 8 ms. Sampling starts after the caller's synchronous submission; queue
 * pressure is included. Decisions last until this document session is disposed.
 */
export function createCompositionBudget(completed: () => Promise<void>, changed: () => void) {
  const retained = new Set<number>();
  const samples = new Map<number, number>();
  let observing = false;
  let active = true;

  return {
    has: (page: number) => retained.has(page),
    get size() {
      return retained.size;
    },
    /** At most one fence is pending; diagnostic direct rendering must not call this. */
    observe(pages: number[]) {
      if (!active || observing || pages.length === 0) {
        return;
      }

      observing = true;
      const started = performance.now();
      queueMicrotask(() => {
        if (!active) {
          return;
        }

        void ResultAsync.fromThrowable(completed, () => undefined)().then((result) => {
          observing = false;
          if (!active || result.isErr()) {
            return;
          }

          let updated = false;
          const slow = performance.now() - started > 8;
          for (const page of pages) {
            const count = slow ? (samples.get(page) ?? 0) + 1 : 0;
            samples.set(page, count);
            if (count >= 2 && !retained.has(page)) {
              retained.add(page);
              updated = true;
            }
          }

          if (updated) {
            changed();
          }
        });
      });
    },
    /** Pending observations become inert; no GPU resource is owned by this tracker. */
    destroy() {
      active = false;
      retained.clear();
      samples.clear();
    }
  };
}
