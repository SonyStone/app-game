import { describe, expect, it } from 'vitest';

import type { Point } from '../src/editor/geometry';
import type { ActiveCanvasRotateDrag, ActiveDrag, ActivePanDrag } from '../src/editor/types';
import { createViewNavigationToolController } from '../src/features/viewport/tools/viewNavigationToolController';

type ViewNavigationControllerOptions = Parameters<typeof createViewNavigationToolController>[0];

describe('createViewNavigationToolController', () => {
  it('handles wheel zoom, ctrl-gated zoom, and shift-wheel rotation', () => {
    let zoomFactor: number | undefined;
    let zoomOrigin: Point | undefined;
    let rotationDelta: number | undefined;
    let rotationOrigin: Point | undefined;
    let preventedCount = 0;
    let previewKeeps = 0;
    const controller = createViewNavigationToolController({
      ...baseOptions(),
      useCtrlForZoom: () => true,
      keepViewportPreviewAlive: () => {
        previewKeeps += 1;
      },
      zoomBy: (factor, origin) => {
        zoomFactor = factor;
        zoomOrigin = origin;
      },
      rotateViewportBy: (delta, origin) => {
        rotationDelta = delta;
        rotationOrigin = origin;
      }
    });

    expect(controller.handleViewportWheel(wheelEvent({ deltaY: -10, clientX: 4, clientY: 8 }))).toBe(false);

    expect(controller.handleViewportWheel(wheelEvent({ ctrlKey: true, deltaY: -10, clientX: 4, clientY: 8, prevented }))).toBe(true);
    expect(zoomFactor).toBe(Math.SQRT2);
    expect(zoomOrigin).toEqual({ x: 4, y: 8 });

    expect(controller.handleViewportWheel(wheelEvent({ shiftKey: true, deltaY: 20, clientX: 3, clientY: 9, prevented }))).toBe(true);
    expect(rotationDelta).toBe(-0.1);
    expect(rotationOrigin).toEqual({ x: 3, y: 9 });
    expect(preventedCount).toBe(2);
    expect(previewKeeps).toBe(2);

    function prevented(): void {
      preventedCount += 1;
    }
  });

  it('begins pan drags and flushes the latest pan move on finish', () => {
    let activeDrag: ActiveDrag | undefined;
    let cameraCenter: Point | undefined;
    let previewDelay: number | undefined;
    const controller = createViewNavigationToolController({
      ...baseOptions(),
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      zoom: () => 2,
      viewportRotation: () => 3,
      clientToSvgPoint: (clientX, clientY) => ({ x: clientX + 1, y: clientY + 2 }),
      centerForClientPoint: (worldPoint, clientX, clientY, zoom, rotation) => ({
        x: worldPoint.x + clientX + zoom,
        y: worldPoint.y + clientY + rotation
      }),
      setCameraCenter: (point) => {
        cameraCenter = typeof point === 'function' ? point(cameraCenter ?? { x: 0, y: 0 }) : point;
        return cameraCenter;
      },
      keepViewportPreviewAlive: (delay) => {
        previewDelay = delay;
      }
    });

    controller.beginPanDrag(pointerEvent({ pointerId: 9, clientX: 10, clientY: 20 }));

    expect(activeDrag).toEqual({ type: 'pan', pointerId: 9, startWorldX: 11, startWorldY: 22 });

    controller.updatePanDrag(activeDrag as ActivePanDrag, pointerEvent({ pointerId: 9, clientX: 40, clientY: 50 }));
    controller.finishPanDrag();

    expect(cameraCenter).toEqual({ x: 53, y: 75 });
    expect(previewDelay).toBe(100);
    expect(activeDrag).toBeUndefined();
  });

  it('updates canvas rotation drags relative to the starting angle', () => {
    let activeDrag: ActiveDrag | undefined;
    let viewportRotation = 2;
    let previewKeeps = 0;
    const controller = createViewNavigationToolController({
      ...baseOptions(),
      setActiveDrag: (next) => {
        activeDrag = typeof next === 'function' ? next(activeDrag) : next;
        return activeDrag;
      },
      viewportRotation: () => viewportRotation,
      setViewportRotation: (next) => {
        viewportRotation = typeof next === 'function' ? next(viewportRotation) : next;
        return viewportRotation;
      },
      angleFromViewportCenter: (clientX, clientY) => clientX / 10 + clientY / 100,
      keepViewportPreviewAlive: () => {
        previewKeeps += 1;
      }
    });

    controller.beginCanvasRotateDrag(pointerEvent({ pointerId: 5, clientX: 10, clientY: 20 }));

    expect(activeDrag).toEqual({ type: 'rotate-canvas', pointerId: 5, startAngle: 1.2, startRotation: 2 });

    controller.updateCanvasRotateDrag(activeDrag as ActiveCanvasRotateDrag, pointerEvent({ pointerId: 5, clientX: 30, clientY: 20 }));

    expect(viewportRotation).toBe(4);

    controller.finishCanvasRotateDrag();

    expect(activeDrag).toBeUndefined();
    expect(previewKeeps).toBe(2);
  });

  it('tracks two-touch gestures and applies zoom, rotation, and camera updates', () => {
    let zoom = 2;
    let viewportRotation = 0.25;
    let cameraCenter: Point | undefined;
    let previewKeeps = 0;
    const controller = createViewNavigationToolController({
      ...baseOptions(),
      zoom: () => zoom,
      setZoom: (next) => {
        zoom = typeof next === 'function' ? next(zoom) : next;
        return zoom;
      },
      viewportRotation: () => viewportRotation,
      setViewportRotation: (next) => {
        viewportRotation = typeof next === 'function' ? next(viewportRotation) : next;
        return viewportRotation;
      },
      centerForClientPoint: (worldPoint, clientX, clientY, nextZoom, nextRotation) => ({
        x: worldPoint.x + clientX + nextZoom,
        y: worldPoint.y + clientY + nextRotation
      }),
      setCameraCenter: (point) => {
        cameraCenter = typeof point === 'function' ? point(cameraCenter ?? { x: 0, y: 0 }) : point;
        return cameraCenter;
      },
      keepViewportPreviewAlive: () => {
        previewKeeps += 1;
      }
    });

    controller.beginTouchPoint(pointerEvent({ pointerType: 'touch', pointerId: 1, clientX: 0, clientY: 0 }));
    controller.beginTouchPoint(pointerEvent({ pointerType: 'touch', pointerId: 2, clientX: 0, clientY: 10 }));

    expect(controller.hasTouchPoint(1)).toBe(true);
    expect(controller.activeTouchGesture()).toMatchObject({
      pointerIds: [1, 2],
      startWorldX: 0,
      startWorldY: 5,
      startDistance: 10,
      startZoom: 2,
      startRotation: 0.25
    });

    controller.updateTouchPoint(pointerEvent({ pointerType: 'touch', pointerId: 2, clientX: 0, clientY: 20 }));

    expect(zoom).toBe(4);
    expect(viewportRotation).toBe(0.25);
    expect(cameraCenter).toEqual({ x: 4, y: 15.25 });

    controller.finishTouchPoint(1);
    expect(controller.activeTouchGesture()).toMatchObject({ pointerIds: [2], startDistance: 0 });

    controller.finishTouchPoint(2);
    expect(controller.activeTouchGesture()).toBeUndefined();
    expect(previewKeeps).toBeGreaterThanOrEqual(4);
  });
});

function baseOptions(): ViewNavigationControllerOptions {
  return {
    setActiveDrag: (next) => (typeof next === 'function' ? next(undefined) : next),
    zoom: () => 1,
    setZoom: (next) => (typeof next === 'function' ? next(1) : next),
    viewportRotation: () => 0,
    setViewportRotation: (next) => (typeof next === 'function' ? next(0) : next),
    setCameraCenter: (next) => (typeof next === 'function' ? next({ x: 0, y: 0 }) : next),
    clientToSvgPoint: (clientX: number, clientY: number): Point => ({ x: clientX, y: clientY }),
    centerForClientPoint: (worldPoint: Point) => worldPoint,
    angleFromViewportCenter: () => 0,
    zoomBy: () => undefined,
    rotateViewportBy: () => undefined,
    useCtrlForZoom: () => false,
    keepViewportPreviewAlive: () => undefined
  } satisfies ViewNavigationControllerOptions;
}

function pointerEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    clientX: 0,
    clientY: 0,
    pointerId: 1,
    pointerType: 'mouse',
    ...overrides
  } as PointerEvent;
}

function wheelEvent(overrides: Partial<WheelEvent> & { readonly prevented?: () => void } = {}): WheelEvent {
  const preventDefault = overrides.prevented ?? (() => undefined);

  return {
    clientX: 0,
    clientY: 0,
    ctrlKey: false,
    deltaY: 0,
    metaKey: false,
    preventDefault,
    shiftKey: false,
    ...overrides
  } as WheelEvent;
}
