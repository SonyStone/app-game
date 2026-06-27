import { clamp, distance, eventPoint, type Point } from './geometry';

export type PinchScaleController = {
  readonly onPointerDown: (event: PointerEvent) => void;
  readonly onPointerMove: (event: PointerEvent) => void;
  readonly onPointerUp: (event: PointerEvent) => void;
  readonly reset: () => void;
};

export type PinchScaleControllerOptions = {
  readonly getScale: () => number;
  readonly maxScale?: number;
  readonly minScale?: number;
  readonly onEvent?: (event: PointerEvent) => void;
  readonly setScale: (scale: number) => void;
};

export function createPinchScaleController(options: PinchScaleControllerOptions): PinchScaleController {
  const pointers = new Map<number, Point>();
  let startDistance: number | undefined;
  let startScale = options.getScale();

  return {
    onPointerDown(event) {
      event.preventDefault();
      options.onEvent?.(event);
      pointers.set(event.pointerId, eventPoint(event));

      const points = getTwoPoints(pointers);

      if (points) {
        startDistance = distance(points[0], points[1]);
        startScale = options.getScale();
      }
    },
    onPointerMove(event) {
      if (!pointers.has(event.pointerId)) {
        return;
      }

      event.preventDefault();
      pointers.set(event.pointerId, eventPoint(event));

      const points = getTwoPoints(pointers);

      if (!points || startDistance === undefined || startDistance <= 0) {
        return;
      }

      const nextScale = startScale * (distance(points[0], points[1]) / startDistance);

      options.setScale(clamp(nextScale, options.minScale ?? 0.55, options.maxScale ?? 1.9));
    },
    onPointerUp(event) {
      event.preventDefault();
      options.onEvent?.(event);
      pointers.delete(event.pointerId);

      if (pointers.size < 2) {
        startDistance = undefined;
        startScale = options.getScale();
      }
    },
    reset() {
      pointers.clear();
      startDistance = undefined;
      startScale = options.getScale();
    }
  };
}

function getTwoPoints(pointers: ReadonlyMap<number, Point>): readonly [Point, Point] | undefined {
  const iterator = pointers.values();
  const first = iterator.next();
  const second = iterator.next();

  if (first.done === true || second.done === true) {
    return undefined;
  }

  return [first.value, second.value];
}
