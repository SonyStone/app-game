import { createMemo, createSignal, untrack, type Accessor } from 'solid-js';

import { radiansToDegrees, type Point } from '../../editor/geometry';
import { clamp } from '../../editor/tree-utils';
import type { AppSettings, ViewRect } from '../../editor/types';
import { createRotatedGridRect, rotatePoint, type SvgSize } from './viewport-math';

/**
 * Owns the viewport camera: center, zoom, and rotation.
 *
 * Until the user pans, zooms, or rotates, the camera is derived from the document and viewport sizes, so it frames
 * the document and follows resizes. The first manual change switches to a stored camera that resizes keep as is.
 * `centerFrame` returns to the framing camera. Setters accept plain values and compose within one event.
 */
export function createViewportCamera(options: {
  readonly rootSize: Accessor<SvgSize>;
  readonly settings: Accessor<AppSettings>;
  readonly canvasSvg: Accessor<SVGSVGElement | undefined>;
}) {
  const [viewportSize, setViewportSize] = createSignal({ width: 900, height: 700 });
  const [manualCamera, setManualCamera] = createSignal<CameraState | undefined>(undefined);
  const framingCamera = createMemo(() => frameDocument(options.rootSize(), viewportSize()));
  const camera = createMemo(() => manualCamera() ?? framingCamera());
  const cameraCenter = createMemo(() => camera().center);
  const zoom = createMemo(() => camera().zoom);
  const viewportRotation = createMemo(() => camera().rotation);

  // Updaters see earlier writes from the same event, so a pinch can set zoom, rotation, and center in a row.
  function updateCamera(change: Partial<CameraState>): void {
    setManualCamera((current) => ({ ...(current ?? untrack(framingCamera)), ...change }));
  }

  const setCameraCenter = (center: Point) => updateCamera({ center });
  const setZoom = (value: number) => updateCamera({ zoom: value });
  const setViewportRotation = (rotation: number) => updateCamera({ rotation });

  const viewRect = createMemo((): ViewRect => {
    const size = viewportSize();
    const z = zoom();
    const center = cameraCenter();
    return {
      x: center.x - size.width / z / 2,
      y: center.y - size.height / z / 2,
      width: size.width / z,
      height: size.height / z
    };
  });

  const gridViewRect = createMemo(() => createRotatedGridRect(viewRect(), viewportRotation()));

  const viewportTransform = createMemo(() => {
    const center = cameraCenter();
    return `rotate(${radiansToDegrees(viewportRotation())} ${center.x} ${center.y})`;
  });

  /** Frames the active document again; the camera then follows document and viewport size changes. */
  function centerFrame(): void {
    setManualCamera(undefined);
  }

  function zoomBy(factor: number, origin?: { readonly x: number; readonly y: number }): void {
    const currentZoom = zoom();
    const nextZoom = clamp(currentZoom * factor, minZoom, maxZoom);

    if (!origin) {
      setZoom(nextZoom);
      return;
    }

    const anchor = clientToSvgPoint(origin.x, origin.y, false);
    setZoom(nextZoom);
    setCameraCenter(centerForClientPoint(anchor, origin.x, origin.y, nextZoom, viewportRotation()));
  }

  function rotateViewportBy(delta: number, origin?: { readonly x: number; readonly y: number }): void {
    const nextRotation = viewportRotation() + delta;

    if (!origin) {
      setViewportRotation(nextRotation);
      return;
    }

    const anchor = clientToSvgPoint(origin.x, origin.y, false);
    setViewportRotation(nextRotation);
    setCameraCenter(centerForClientPoint(anchor, origin.x, origin.y, zoom(), nextRotation));
  }

  function clientToSvgPoint(clientX: number, clientY: number, snapToGrid = true): Point {
    const transformed = clientToSvgPointWithCamera(clientX, clientY, cameraCenter(), zoom(), viewportRotation());
    const settings = options.settings();
    const snap = snapToGrid && settings.snapEnabled ? settings.snapSize : 0;

    if (snap > 0) {
      return {
        x: Math.round(transformed.x / snap) * snap,
        y: Math.round(transformed.y / snap) * snap
      };
    }

    return { x: transformed.x, y: transformed.y };
  }

  function clientToSvgPointWithCamera(
    clientX: number,
    clientY: number,
    center: Point,
    z: number,
    rotation: number
  ): Point {
    const offset = clientOffsetFromViewportCenter(clientX, clientY, z);
    const worldOffset = rotatePoint(offset, -rotation);
    return { x: center.x + worldOffset.x, y: center.y + worldOffset.y };
  }

  function centerForClientPoint(
    worldPoint: Point,
    clientX: number,
    clientY: number,
    z: number,
    rotation: number
  ): Point {
    const offset = clientOffsetFromViewportCenter(clientX, clientY, z);
    const worldOffset = rotatePoint(offset, -rotation);
    return { x: worldPoint.x - worldOffset.x, y: worldPoint.y - worldOffset.y };
  }

  function clientOffsetFromViewportCenter(clientX: number, clientY: number, z: number): Point {
    const svg = options.canvasSvg();

    if (!svg) {
      return { x: 0, y: 0 };
    }

    const rect = svg.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: (clientX - rect.left - rect.width / 2) / z,
      y: (clientY - rect.top - rect.height / 2) / z
    };
  }

  function angleFromViewportCenter(clientX: number, clientY: number): number {
    const svg = options.canvasSvg();

    if (!svg) {
      return 0;
    }

    const rect = svg.getBoundingClientRect();
    return Math.atan2(clientY - rect.top - rect.height / 2, clientX - rect.left - rect.width / 2);
  }

  return {
    cameraCenter,
    setCameraCenter,
    zoom,
    setZoom,
    viewportSize,
    setViewportSize,
    viewportRotation,
    setViewportRotation,
    viewRect,
    gridViewRect,
    viewportTransform,
    centerFrame,
    zoomBy,
    rotateViewportBy,
    clientToSvgPoint,
    centerForClientPoint,
    angleFromViewportCenter
  };
}

type CameraState = {
  readonly center: Point;
  readonly zoom: number;
  readonly rotation: number;
};

const minZoom = 0.125;
const maxZoom = 512;
const framingMargin = 0.86;

function frameDocument(size: SvgSize, viewport: { readonly width: number; readonly height: number }): CameraState {
  const [x, y, width, height] = size.viewBox;
  const fitZoom = Math.min(viewport.width / width, viewport.height / height) * framingMargin;

  return {
    center: { x: x + width / 2, y: y + height / 2 },
    zoom: Number.isFinite(fitZoom) && fitZoom > 0 ? clamp(fitZoom, minZoom, maxZoom) : 1,
    rotation: 0
  };
}
