import { createSignal, type Accessor, type Setter } from 'solid-js';

import type { Point } from '../../../editor/geometry';
import { clamp } from '../../../editor/tree-utils';
import type { ActiveCanvasRotateDrag, ActiveDrag, ActivePanDrag } from '../../../editor/types';
import { createRafQueue } from '../../ui/createRafQueue';
import {
  angleBetween,
  centroidOfPoints,
  distanceBetween,
  firstTwoTouchPoints,
  pointerEventToTouchPoint,
  type TouchGesture,
  type TouchPoint
} from '../touch-gesture';

interface PendingPanMove {
  readonly drag: ActivePanDrag;
  readonly clientX: number;
  readonly clientY: number;
}

export interface ViewNavigationToolController {
  readonly activeTouchGesture: Accessor<TouchGesture | undefined>;
  readonly handleViewportWheel: (event: WheelEvent) => boolean;
  readonly hasTouchPoint: (pointerId: number) => boolean;
  readonly beginTouchPoint: (event: PointerEvent) => void;
  readonly updateTouchPoint: (event: PointerEvent) => void;
  readonly finishTouchPoint: (pointerId: number) => void;
  readonly beginPanDrag: (event: PointerEvent) => void;
  readonly updatePanDrag: (drag: ActivePanDrag, event: PointerEvent) => void;
  readonly finishPanDrag: () => void;
  readonly beginCanvasRotateDrag: (event: PointerEvent) => void;
  readonly updateCanvasRotateDrag: (drag: ActiveCanvasRotateDrag, event: PointerEvent) => void;
  readonly finishCanvasRotateDrag: () => void;
  readonly cancelPendingViewNavigationUpdate: () => void;
}

export function createViewNavigationToolController(options: {
  readonly setActiveDrag: Setter<ActiveDrag | undefined>;
  readonly zoom: Accessor<number>;
  readonly setZoom: Setter<number>;
  readonly viewportRotation: Accessor<number>;
  readonly setViewportRotation: Setter<number>;
  readonly setCameraCenter: Setter<Point>;
  readonly clientToSvgPoint: (clientX: number, clientY: number, snapToGrid?: boolean) => Point;
  readonly centerForClientPoint: (worldPoint: Point, clientX: number, clientY: number, z: number, rotation: number) => Point;
  readonly angleFromViewportCenter: (clientX: number, clientY: number) => number;
  readonly zoomBy: (factor: number, origin?: { readonly x: number; readonly y: number }) => void;
  readonly rotateViewportBy: (delta: number, origin?: { readonly x: number; readonly y: number }) => void;
  readonly useCtrlForZoom: Accessor<boolean>;
  readonly keepViewportPreviewAlive: (delay?: number) => void;
}): ViewNavigationToolController {
  const [activeTouchGesture, setActiveTouchGesture] = createSignal<TouchGesture | undefined>();
  const touchPointers = new Map<number, TouchPoint>();
  let pendingPanMove: PendingPanMove | undefined;
  const panMoveFrame = createRafQueue(flushPendingPanMove);

  function handleViewportWheel(event: WheelEvent): boolean {
    if (event.shiftKey) {
      event.preventDefault();
      options.keepViewportPreviewAlive();
      options.rotateViewportBy(-event.deltaY * 0.005, { x: event.clientX, y: event.clientY });
      return true;
    }

    if (options.useCtrlForZoom() && !event.ctrlKey && !event.metaKey) {
      return false;
    }

    event.preventDefault();
    options.keepViewportPreviewAlive();
    options.zoomBy(event.deltaY < 0 ? Math.SQRT2 : 1 / Math.SQRT2, { x: event.clientX, y: event.clientY });
    return true;
  }

  function beginPanDrag(event: PointerEvent): void {
    const point = options.clientToSvgPoint(event.clientX, event.clientY);
    options.setActiveDrag({
      type: 'pan',
      pointerId: event.pointerId,
      startWorldX: point.x,
      startWorldY: point.y
    });
  }

  function updatePanDrag(drag: ActivePanDrag, event: PointerEvent): void {
    pendingPanMove = { drag, clientX: event.clientX, clientY: event.clientY };
    panMoveFrame.schedule();
  }

  function finishPanDrag(): void {
    panMoveFrame.cancel();
    flushPendingPanMove();
    options.keepViewportPreviewAlive(100);
    options.setActiveDrag(undefined);
  }

  function beginCanvasRotateDrag(event: PointerEvent): void {
    options.setActiveDrag({
      type: 'rotate-canvas',
      pointerId: event.pointerId,
      startAngle: options.angleFromViewportCenter(event.clientX, event.clientY),
      startRotation: options.viewportRotation()
    });
  }

  function updateCanvasRotateDrag(drag: ActiveCanvasRotateDrag, event: PointerEvent): void {
    options.setViewportRotation(
      drag.startRotation + options.angleFromViewportCenter(event.clientX, event.clientY) - drag.startAngle
    );
    options.keepViewportPreviewAlive();
  }

  function finishCanvasRotateDrag(): void {
    options.keepViewportPreviewAlive(100);
    options.setActiveDrag(undefined);
  }

  function hasTouchPoint(pointerId: number): boolean {
    return touchPointers.has(pointerId);
  }

  function beginTouchPoint(event: PointerEvent): void {
    touchPointers.set(event.pointerId, pointerEventToTouchPoint(event));
    beginTouchGesture();
  }

  function updateTouchPoint(event: PointerEvent): void {
    touchPointers.set(event.pointerId, pointerEventToTouchPoint(event));
    applyTouchGesture();
  }

  function finishTouchPoint(pointerId: number): void {
    touchPointers.delete(pointerId);

    if (touchPointers.size === 0) {
      setActiveTouchGesture(undefined);
      options.keepViewportPreviewAlive(100);
      return;
    }

    beginTouchGesture();
  }

  function cancelPendingViewNavigationUpdate(): void {
    panMoveFrame.cancel();
    pendingPanMove = undefined;
  }

  function flushPendingPanMove(): void {
    const pending = pendingPanMove;

    if (!pending) {
      return;
    }

    pendingPanMove = undefined;
    options.setCameraCenter(
      options.centerForClientPoint(
        { x: pending.drag.startWorldX, y: pending.drag.startWorldY },
        pending.clientX,
        pending.clientY,
        options.zoom(),
        options.viewportRotation()
      )
    );
  }

  function beginTouchGesture(): void {
    const points = Array.from(touchPointers.values()).slice(0, 2);

    if (points.length === 0) {
      setActiveTouchGesture(undefined);
      return;
    }

    const centroid = centroidOfPoints(points);
    const anchor = options.clientToSvgPoint(centroid.x, centroid.y);
    const pair = firstTwoTouchPoints(points);
    setActiveTouchGesture({
      pointerIds: points.map((point) => point.pointerId),
      startWorldX: anchor.x,
      startWorldY: anchor.y,
      startDistance: pair ? distanceBetween(pair[0], pair[1]) : 0,
      startAngle: pair ? angleBetween(pair[0], pair[1]) : 0,
      startZoom: options.zoom(),
      startRotation: options.viewportRotation()
    });
    options.keepViewportPreviewAlive();
  }

  function applyTouchGesture(): void {
    const gesture = activeTouchGesture();

    if (!gesture) {
      return;
    }

    const points = gesture.pointerIds
      .map((pointerId) => touchPointers.get(pointerId))
      .filter((point): point is TouchPoint => Boolean(point));

    if (points.length === 0) {
      setActiveTouchGesture(undefined);
      return;
    }

    const centroid = centroidOfPoints(points);
    let nextZoom = gesture.startZoom;
    let nextRotation = gesture.startRotation;
    const pair = firstTwoTouchPoints(points);

    if (pair && gesture.startDistance > 0) {
      nextZoom = clamp(gesture.startZoom * (distanceBetween(pair[0], pair[1]) / gesture.startDistance), 0.125, 512);
      nextRotation = gesture.startRotation + angleBetween(pair[0], pair[1]) - gesture.startAngle;
    }

    options.setZoom(nextZoom);
    options.setViewportRotation(nextRotation);
    options.setCameraCenter(
      options.centerForClientPoint(
        { x: gesture.startWorldX, y: gesture.startWorldY },
        centroid.x,
        centroid.y,
        nextZoom,
        nextRotation
      )
    );
    options.keepViewportPreviewAlive();
  }

  return {
    activeTouchGesture,
    handleViewportWheel,
    hasTouchPoint,
    beginTouchPoint,
    updateTouchPoint,
    finishTouchPoint,
    beginPanDrag,
    updatePanDrag,
    finishPanDrag,
    beginCanvasRotateDrag,
    updateCanvasRotateDrag,
    finishCanvasRotateDrag,
    cancelPendingViewNavigationUpdate
  } satisfies ViewNavigationToolController;
}
