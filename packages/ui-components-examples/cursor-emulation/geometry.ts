export type Point = {
  readonly x: number;
  readonly y: number;
};

export type CubicPath = readonly [Point, Point, Point, Point];

export type ViewportBounds = {
  readonly height: number;
  readonly width: number;
};

export function centerOfRect(rect: DOMRectReadOnly): Point {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function cubicPathD(path: CubicPath): string {
  const [start, controlA, controlB, end] = path;

  return `M ${formatPathNumber(start.x)} ${formatPathNumber(start.y)} C ${formatPathNumber(controlA.x)} ${formatPathNumber(controlA.y)} ${formatPathNumber(controlB.x)} ${formatPathNumber(controlB.y)} ${formatPathNumber(end.x)} ${formatPathNumber(end.y)}`;
}

export function distance(first: Point, second: Point): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function easeInOutCubic(progress: number): number {
  const t = clamp(progress, 0, 1);

  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function eventPoint(event: PointerEvent): Point {
  return {
    x: event.clientX,
    y: event.clientY
  };
}

export function pointOnCubic(path: CubicPath, progress: number): Point {
  const [start, controlA, controlB, end] = path;
  const t = clamp(progress, 0, 1);
  const inverse = 1 - t;
  const inverseSquared = inverse * inverse;
  const squared = t * t;

  return {
    x:
      inverseSquared * inverse * start.x +
      3 * inverseSquared * t * controlA.x +
      3 * inverse * squared * controlB.x +
      squared * t * end.x,
    y:
      inverseSquared * inverse * start.y +
      3 * inverseSquared * t * controlA.y +
      3 * inverse * squared * controlB.y +
      squared * t * end.y
  };
}

function formatPathNumber(value: number): string {
  return value.toFixed(2);
}
