import type { Point } from '../../editor/geometry';

export type TouchPoint = { readonly pointerId: number; readonly clientX: number; readonly clientY: number };

export type TouchGesture = {
  readonly pointerIds: readonly number[];
  readonly startWorldX: number;
  readonly startWorldY: number;
  readonly startDistance: number;
  readonly startAngle: number;
  readonly startZoom: number;
  readonly startRotation: number;
};

export function pointerEventToTouchPoint(event: PointerEvent): TouchPoint {
  return { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
}

export function centroidOfPoints(points: readonly TouchPoint[]): Point {
  const total = points.reduce(
    (sum, point) => ({ x: sum.x + point.clientX, y: sum.y + point.clientY }),
    { x: 0, y: 0 }
  );
  return { x: total.x / points.length, y: total.y / points.length };
}

export function distanceBetween(first: TouchPoint, second: TouchPoint): number {
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
}

export function angleBetween(first: TouchPoint, second: TouchPoint): number {
  return Math.atan2(second.clientY - first.clientY, second.clientX - first.clientX);
}

export function firstTwoTouchPoints(points: readonly TouchPoint[]): readonly [TouchPoint, TouchPoint] | undefined {
  const first = points[0];
  const second = points[1];
  return first && second ? [first, second] : undefined;
}
