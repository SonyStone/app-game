import { ResultAsync } from 'neverthrow';

/**
 * Retains composed prefixes after two consecutive direct-draw frames cost more than `slowMs`. `cost` is called right
 * after the caller's synchronous submission and resolves that frame's cost in milliseconds, or undefined for a frame
 * that says nothing about the device's speed, which is skipped. Decisions last until this document session is disposed.
 */
export function createCompositionBudget(
  cost: () => Promise<number | undefined>,
  changed: () => void,
  /** Frame cost above which a direct draw counts as slow, in the unit `cost` resolves. */
  slowMs = 8
) {
  const retained = new Set<number>();
  const samples = new Map<number, number>();
  let observing = false;
  let active = true;

  return {
    has: (page: number) => retained.has(page),
    get size() {
      return retained.size;
    },
    /** At most one cost is pending; diagnostic direct rendering must not call this. */
    observe(pages: number[]) {
      if (!active || observing || pages.length === 0) {
        return;
      }

      observing = true;
      queueMicrotask(() => {
        if (!active) {
          return;
        }

        void ResultAsync.fromThrowable(cost, () => undefined)().then((result) => {
          observing = false;
          if (!active || result.isErr() || result.value === undefined) {
            return;
          }

          let updated = false;
          const slow = result.value > slowMs;
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
