import { createElementNode, type SvgElementNode } from '../svg-model';
import { formatCoordinate, type Point } from './geometry';

/** The shapes GodSVG's "New shape" menu offers, in its order. */
export const newShapeNames = ['path', 'circle', 'ellipse', 'rect', 'line', 'polygon', 'polyline'] as const;

/**
 * Creates a shape at a canvas point like GodSVG's `user_setup`: circles, ellipses, and rects get size `unit` there
 * (GodSVG uses 1; scale it to the document with `newShapeUnit` so the shape is visible), a line runs `unit` to the
 * right with a black stroke, and paths, polygons, and polylines start as a single point to extend.
 */
export function createShapeAt(name: (typeof newShapeNames)[number], point: Point, unit: number): SvgElementNode {
  const x = formatCoordinate(point.x);
  const y = formatCoordinate(point.y);
  const size = formatCoordinate(unit);
  const attrs = (values: Readonly<Record<string, string>>) => Object.entries(values).map(([attrName, value]) => ({ name: attrName, value }));

  switch (name) {
    case 'circle':
      return createElementNode(name, attrs({ cx: x, cy: y, r: size }));
    case 'ellipse':
      return createElementNode(name, attrs({ cx: x, cy: y, rx: size, ry: size }));
    case 'rect':
      return createElementNode(name, attrs({ x, y, width: size, height: size }));
    case 'line':
      return createElementNode(name, attrs({ x1: x, y1: y, x2: formatCoordinate(point.x + unit), y2: y, stroke: 'black' }));
    case 'polyline':
      return createElementNode(name, attrs({ points: `${x} ${y}`, fill: 'none', stroke: 'black' }));
    case 'polygon':
      return createElementNode(name, attrs({ points: `${x} ${y}` }));
    case 'path':
      return createElementNode(name, attrs({ d: `M ${x} ${y}` }));
  }
}

/** A size for new shapes: a tenth of the smaller viewBox side, rounded up to 1, 2, or 5 times a power of ten. */
export function newShapeUnit(viewBox: readonly [number, number, number, number]): number {
  const target = Math.max(Math.min(viewBox[2], viewBox[3]) / 10, Number.EPSILON);
  const power = 10 ** Math.floor(Math.log10(target));
  const step = [1, 2, 5, 10].find((factor) => factor * power >= target) ?? 10;
  return step * power;
}
