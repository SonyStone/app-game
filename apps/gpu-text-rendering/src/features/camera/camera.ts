import type { TextDocument } from '../document/document';
import type { Point } from '../scene/SceneSpace';

/** Camera center in page coordinates; zoom is the inverse magnification, rotation is in radians. */
export type Camera = { x: number; y: number; zoom: number; rotation: number };

/** Converts CSS coordinates to page coordinates, undoing rotation before page aspect scaling. */
export function screenToWorld(camera: Camera, point: Point, width: number, height: number, pageAspect: number): Point {
  const x = (2 * point.x - width) / height;
  const y = 1 - (2 * point.y) / height;

  const c = Math.cos(camera.rotation);
  const s = Math.sin(camera.rotation);

  return {
    x: camera.x + (c * x + s * y) * camera.zoom,
    y: camera.y + (-s * x + c * y) * camera.zoom * pageAspect
  };
}

/** Projects document coordinates to canvas-local CSS pixels; inverse of screenToWorld. */
export function worldToScreen(camera: Camera, point: Point, width: number, height: number, pageAspect: number): Point {
  const x = (point.x - camera.x) / camera.zoom;
  const y = (point.y - camera.y) / (camera.zoom * pageAspect);
  const c = Math.cos(camera.rotation);
  const s = Math.sin(camera.rotation);

  return {
    x: (width + (c * x - s * y) * height) / 2,
    y: ((1 - s * x - c * y) * height) / 2
  };
}

/**
 * Returns the camera after pan, pinch and rotation together, keeping the old focal point beneath the new one.
 * Returns the same camera for an empty viewport or a non-positive or non-finite scale.
 */
export function moveCamera(
  camera: Camera,
  from: Point,
  to: Point,
  scale: number,
  angle: number,
  width: number,
  height: number,
  pageAspect: number
): Camera {
  if (width <= 0 || height <= 0 || !Number.isFinite(scale) || scale <= 0) {
    return camera;
  }

  const anchor = screenToWorld(camera, from, width, height, pageAspect);

  // A whole-document overview can exceed the normal zoom limit on a narrow viewport.
  // Preserve that scale while panning, and let pinch/scroll approach the normal range smoothly.
  const turned = {
    ...camera,
    zoom: Math.min(Math.max(64, camera.zoom), Math.max(1 / 65536, camera.zoom / scale)),
    rotation: Math.atan2(Math.sin(camera.rotation + angle), Math.cos(camera.rotation + angle))
  };

  const moved = screenToWorld(turned, to, width, height, pageAspect);

  return { ...turned, x: camera.x + anchor.x - moved.x, y: camera.y + anchor.y - moved.y };
}

/**
 * Returns the unrotated camera that fits `bounds` inside a `size` CSS-pixel viewport less `padding` on each side,
 * centered in the padded area. Padding larger than the viewport leaves at least one pixel.
 */
export function fitCamera(
  bounds: ReturnType<typeof documentBounds>,
  size: { width: number; height: number },
  pageAspect: number,
  /** Reserved CSS pixels on each side. Default zero. */
  padding: { top: number; right: number; bottom: number; left: number } = { top: 0, right: 0, bottom: 0, left: 0 }
): Camera {
  const { left, right, bottom, top } = bounds;
  const { width, height } = size;
  const availableWidth = Math.max(1, width - padding.left - padding.right);
  const availableHeight = Math.max(1, height - padding.top - padding.bottom);
  const zoom =
    Math.max(((right - left) * height) / availableWidth, ((top - bottom) * height) / (pageAspect * availableHeight)) /
    2;

  return {
    x: (left + right) / 2 + ((padding.right - padding.left) * zoom) / Math.max(1, height),
    y: (bottom + top) / 2 - ((padding.bottom - padding.top) * zoom * pageAspect) / Math.max(1, height),
    zoom,
    rotation: 0
  };
}

/** Bounds of laid-out pages in DocumentSpace units; see pageRects. Pages must be non-empty. */
export function documentBounds(pages: readonly PageLayout[]) {
  let left = Infinity;
  let right = -Infinity;
  let bottom = Infinity;
  let top = -Infinity;

  for (const page of pageRects(pages)) {
    left = Math.min(left, page.x);
    right = Math.max(right, page.x + page.width);
    bottom = Math.min(bottom, page.y);
    top = Math.max(top, page.y + page.height);
  }

  return { left, right, bottom, top };
}

/**
 * Page rectangles in DocumentSpace units: x in first-page widths, y in first-page heights, y up, with (x, y) at each
 * page's bottom-left corner. Pages must be non-empty and positioned by layoutPages.
 */
export function pageRects(pages: readonly PageLayout[]) {
  const first = pages[0]!;

  return pages.map((page) => {
    const height = page.height / first.height;

    return { x: -page.x, y: 1 - page.y - height, width: page.width / first.width, height };
  });
}

/** Page size in points and its layoutPages offset in first-page units. */
type PageLayout = Pick<TextDocument['pages'][number], 'x' | 'y' | 'width' | 'height'>;

/** Column-major matrix rotating NDC coordinates without stretching a non-square canvas. */
export function rotationMatrix(angle: number, aspect: number): [number, number, number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return [c, s / aspect, -s * aspect, c];
}
