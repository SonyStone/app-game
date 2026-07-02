import { getAttribute, setAttribute, svgSize, type SvgElementNode } from '../../svg-model';
import type { Point } from '../../editor/geometry';
import type { ViewRect } from '../../editor/types';

export type SvgSize = ReturnType<typeof svgSize>;

export const emptySvgSize = {
  width: 0,
  height: 0,
  viewBox: [0, 0, 0, 0]
} satisfies SvgSize;

export function sameSvgSize(previous: SvgSize, next: SvgSize): boolean {
  return (
    previous.width === next.width &&
    previous.height === next.height &&
    previous.viewBox.every((value, index) => value === next.viewBox[index])
  );
}

export function createRotatedGridRect(rect: ViewRect, rotation: number): ViewRect {
  if (Math.abs(rotation) < 0.0001) {
    return rect;
  }

  const size = Math.hypot(rect.width, rect.height);

  return {
    x: rect.x + rect.width / 2 - size / 2,
    y: rect.y + rect.height / 2 - size / 2,
    width: size,
    height: size
  };
}

export function createRasterPreviewRect(size: SvgSize): ViewRect {
  const [x, y, width, height] = size.viewBox;
  const padding = Math.max(width, height, 1);

  return {
    x: x - padding,
    y: y - padding,
    width: width + padding * 2,
    height: height + padding * 2
  };
}

export function rotatePoint(point: Point, radians: number): Point {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos
  };
}

export function createRasterPreviewRoot(root: SvgElementNode, rect: ViewRect): SvgElementNode {
  const xmlns = getAttribute(root, 'xmlns', true) || 'http://www.w3.org/2000/svg';
  let next = setAttribute(root, 'xmlns', xmlns);
  next = setAttribute(
    next,
    'viewBox',
    `${formatPreviewNumber(rect.x)} ${formatPreviewNumber(rect.y)} ${formatPreviewNumber(rect.width)} ${formatPreviewNumber(rect.height)}`
  );
  next = setAttribute(next, 'width', formatPreviewNumber(rect.width));
  next = setAttribute(next, 'height', formatPreviewNumber(rect.height));
  return next;
}

function formatPreviewNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
}
