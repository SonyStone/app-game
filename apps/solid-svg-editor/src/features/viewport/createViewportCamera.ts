import { createMemo, createSignal, createTrackedEffect, type Accessor } from 'solid-js';

import { radiansToDegrees, type Point } from '../../editor/geometry';
import { clamp } from '../../editor/tree-utils';
import type { AppSettings, ViewRect } from '../../editor/types';
import { createRotatedGridRect, rotatePoint, type SvgSize } from './viewport-math';

export function createViewportCamera(options: {
  readonly rootSize: Accessor<SvgSize>;
  readonly settings: Accessor<AppSettings>;
  readonly canvasSvg: Accessor<SVGSVGElement | undefined>;
}) {
  const [cameraCenter, setCameraCenter] = createSignal({ x: 450, y: 450 });
  const [zoom, setZoom] = createSignal(1);
  const [viewportSize, setViewportSize] = createSignal({ width: 900, height: 700 });
  const [viewportRotation, setViewportRotation] = createSignal(0);

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

  createTrackedEffect(() => {
    const size = options.rootSize();
    const currentViewport = viewportSize();

    if (currentViewport.width <= 0 || currentViewport.height <= 0) {
      return;
    }

    const fitZoom = Math.min(currentViewport.width / size.viewBox[2], currentViewport.height / size.viewBox[3]) * 0.82;

    if (Number.isFinite(fitZoom) && fitZoom > 0) {
      setZoom(fitZoom);
      setCameraCenter({ x: size.viewBox[0] + size.viewBox[2] / 2, y: size.viewBox[1] + size.viewBox[3] / 2 });
      setViewportRotation(0);
    }
  });

  function centerFrame(): void {
    const size = options.rootSize();
    const currentViewport = viewportSize();
    const fitZoom = Math.min(currentViewport.width / size.viewBox[2], currentViewport.height / size.viewBox[3]) * 0.86;
    setZoom(Number.isFinite(fitZoom) && fitZoom > 0 ? fitZoom : 1);
    setCameraCenter({ x: size.viewBox[0] + size.viewBox[2] / 2, y: size.viewBox[1] + size.viewBox[3] / 2 });
    setViewportRotation(0);
  }

  function zoomBy(factor: number, origin?: { readonly x: number; readonly y: number }): void {
    const currentZoom = zoom();
    const nextZoom = clamp(currentZoom * factor, 0.125, 512);

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
