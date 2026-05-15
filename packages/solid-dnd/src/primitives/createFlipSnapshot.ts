import { type Rect } from '../core/rect';
import { calculateDeltas, type MeasurableElement, measureElements } from './flipUtils';

export type SimpleRect = Readonly<{ x: number; y: number; width: number; height: number }>;

export type FlipDeltasResult<K> = Readonly<{
  first: Map<K, Rect>;
  last: Map<K, Rect>;
  deltas: ReturnType<typeof calculateDeltas<K>>;
  containerRect: SimpleRect | null;
}>;

export function createFlipSnapshot<K>() {
  let first: Map<K, Rect> | null = null;
  let firstContainerRect: SimpleRect | null = null;
  let last: Map<K, Rect> | null = null;

  return {
    captureFirst(elements: ReadonlyMap<K, MeasurableElement>, container?: MeasurableElement | null): void {
      first = measureElements(elements);
      if (container) {
        const rect = container.getBoundingClientRect();
        firstContainerRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      } else {
        firstContainerRect = null;
      }
    },

    hasFirst(): boolean {
      return first !== null;
    },

    captureLast(elements: ReadonlyMap<K, MeasurableElement>): void {
      last = measureElements(elements);
    },

    computeDeltas(): FlipDeltasResult<K> | null {
      if (!first || !last) {
        return null;
      }

      const result: FlipDeltasResult<K> = {
        first,
        last,
        deltas: calculateDeltas(first, last),
        containerRect: firstContainerRect
      };

      first = null;
      firstContainerRect = null;
      return result;
    }
  };
}
