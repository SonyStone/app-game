import { createEffect, createSignal, onCleanup, onMount, type Accessor, type Setter } from 'solid-js';

import { rectCenter, rectFromPoints, translateMatrix, unionRects, type Point, type Rect } from '../../editor/geometry';
import { setPointerCaptureSafely } from '../../editor/pointer';
import { clamp } from '../../editor/tree-utils';
import type {
  ActiveDrag,
  ActiveMarqueeDrag,
  ActiveMoveSelectionDrag,
  ActivePanDrag,
  ActiveTransformBoxDrag,
  ContextMenuState,
  DragSelectionMode,
  HandleDescriptor,
  TransformBoxHandleDescriptor
} from '../../editor/types';
import type { SvgElementNode } from '../../svg-model';
import type { PathCommandSelection } from '../selection/createEditorSelection';
import { idsInMarquee, mergeSelection, normalizeClientRect } from '../selection/selection-geometry';
import {
  applyGlobalTransformToSelected,
  topLevelSelectedElementIds,
  transformMatrixForBoxHandle
} from '../selection/transform-selection';
import {
  angleBetween,
  centroidOfPoints,
  distanceBetween,
  firstTwoTouchPoints,
  pointerEventToTouchPoint,
  type TouchGesture,
  type TouchPoint
} from './touch-gesture';

export function createViewportInteractions(options: {
  readonly activeRoot: Accessor<SvgElementNode>;
  readonly selectedIds: Accessor<readonly string[]>;
  readonly setSelectedIds: (ids: readonly string[]) => void;
  readonly setSelectionPivot: (id: string | undefined) => void;
  readonly setSelectedPathCommand: (selection: PathCommandSelection | undefined) => void;
  readonly selectNode: (nodeId: string, event?: MouseEvent | PointerEvent) => void;
  readonly clearSelection: () => void;
  readonly setContextMenu: Setter<ContextMenuState | undefined>;
  readonly pushHistory: () => void;
  readonly replaceRootWithoutHistory: (nextRoot: SvgElementNode, syncCode?: boolean) => void;
  readonly syncActiveRootCode: () => void;
  readonly canvasSvg: Accessor<SVGSVGElement | undefined>;
  readonly zoom: Accessor<number>;
  readonly setZoom: Setter<number>;
  readonly viewportSize: Accessor<{ readonly width: number; readonly height: number }>;
  readonly viewportRotation: Accessor<number>;
  readonly setViewportRotation: Setter<number>;
  readonly setCameraCenter: Setter<Point>;
  readonly clientToSvgPoint: (clientX: number, clientY: number, snapToGrid?: boolean) => Point;
  readonly centerForClientPoint: (worldPoint: Point, clientX: number, clientY: number, z: number, rotation: number) => Point;
  readonly angleFromViewportCenter: (clientX: number, clientY: number) => number;
  readonly zoomBy: (factor: number, origin?: { readonly x: number; readonly y: number }) => void;
  readonly rotateViewportBy: (delta: number, origin?: { readonly x: number; readonly y: number }) => void;
  readonly dragSelectionMode: Accessor<DragSelectionMode>;
  readonly useCtrlForZoom: Accessor<boolean>;
  readonly useRasterPreview: Accessor<boolean>;
  readonly keepViewportPreviewAlive: (delay?: number) => void;
}) {
  const [activeDrag, setActiveDrag] = createSignal<ActiveDrag | undefined>();
  const [activeTouchGesture, setActiveTouchGesture] = createSignal<TouchGesture | undefined>();
  const [selectionBox, setSelectionBox] = createSignal<Rect | undefined>();
  const [marqueeRect, setMarqueeRect] = createSignal<Rect | undefined>();

  const touchPointers = new Map<number, TouchPoint>();
  let pendingPanFrame: number | undefined;
  let pendingPanMove: { readonly drag: ActivePanDrag; readonly clientX: number; readonly clientY: number } | undefined;
  let pendingHandleFrame: number | undefined;
  let pendingHandleMove:
    | {
        readonly pointerId: number;
        readonly handle: HandleDescriptor;
        readonly clientX: number;
        readonly clientY: number;
      }
    | undefined;
  let selectionBoxFrame: number | undefined;

  onMount(() => {
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
    window.addEventListener('pointercancel', onWindowPointerCancel);

    onCleanup(() => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerCancel);
    });
  });

  onCleanup(() => {
    if (pendingPanFrame !== undefined) {
      window.cancelAnimationFrame(pendingPanFrame);
    }

    if (pendingHandleFrame !== undefined) {
      window.cancelAnimationFrame(pendingHandleFrame);
    }

    if (selectionBoxFrame !== undefined) {
      window.cancelAnimationFrame(selectionBoxFrame);
    }
  });

  createEffect(() => {
    options.activeRoot();
    options.selectedIds();
    options.viewportRotation();
    options.zoom();
    options.viewportSize();
    options.useRasterPreview();
    scheduleSelectionBoxUpdate();
  });

  function scheduleSelectionBoxUpdate(): void {
    if (selectionBoxFrame !== undefined) {
      window.cancelAnimationFrame(selectionBoxFrame);
    }

    selectionBoxFrame = window.requestAnimationFrame(() => {
      selectionBoxFrame = undefined;
      setSelectionBox(measureSelectionBox(options.selectedIds()));
    });
  }

  function measureSelectionBox(ids: readonly string[]): Rect | undefined {
    const selected = new Set(ids.filter((id) => id !== options.activeRoot().id));

    if (selected.size === 0 || options.useRasterPreview()) {
      return undefined;
    }

    const rects: Rect[] = [];

    for (const element of document.querySelectorAll<SVGGraphicsElement>('[data-node-id]')) {
      const id = element.getAttribute('data-node-id');

      if (!id || !selected.has(id)) {
        continue;
      }

      const clientRect = element.getBoundingClientRect();

      if (clientRect.width <= 0 || clientRect.height <= 0) {
        continue;
      }

      const worldRect = clientRectToWorldRect(clientRect);

      if (worldRect) {
        rects.push(worldRect);
      }
    }

    return unionRects(rects);
  }

  function clientRectToWorldRect(clientRect: DOMRectReadOnly): Rect | undefined {
    return rectFromPoints([
      options.clientToSvgPoint(clientRect.left, clientRect.top, false),
      options.clientToSvgPoint(clientRect.right, clientRect.top, false),
      options.clientToSvgPoint(clientRect.right, clientRect.bottom, false),
      options.clientToSvgPoint(clientRect.left, clientRect.bottom, false)
    ]);
  }

  function clientRectToOverlayRect(clientRect: Rect): Rect {
    const viewport = options.canvasSvg()?.parentElement?.getBoundingClientRect();

    if (!viewport) {
      return clientRect;
    }

    return {
      x: clientRect.x - viewport.left,
      y: clientRect.y - viewport.top,
      width: clientRect.width,
      height: clientRect.height
    };
  }

  function schedulePanMove(drag: ActivePanDrag, clientX: number, clientY: number): void {
    pendingPanMove = { drag, clientX, clientY };

    if (pendingPanFrame !== undefined) {
      return;
    }

    pendingPanFrame = window.requestAnimationFrame(() => {
      pendingPanFrame = undefined;
      flushPendingPanMove();
    });
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

  function scheduleHandleMove(pointerId: number, handle: HandleDescriptor, clientX: number, clientY: number): void {
    pendingHandleMove = { pointerId, handle, clientX, clientY };

    if (pendingHandleFrame !== undefined) {
      return;
    }

    pendingHandleFrame = window.requestAnimationFrame(() => {
      pendingHandleFrame = undefined;
      flushPendingHandleMove();
    });
  }

  function flushPendingHandleMove(): void {
    const pending = pendingHandleMove;

    if (!pending) {
      return;
    }

    pendingHandleMove = undefined;
    const drag = activeDrag();

    if (drag?.type !== 'handle' || drag.pointerId !== pending.pointerId) {
      return;
    }

    const point = options.clientToSvgPoint(pending.clientX, pending.clientY);
    options.replaceRootWithoutHistory(pending.handle.update(options.activeRoot(), point.x, point.y), false);
  }

  function onCanvasWheel(event: WheelEvent): void {
    if (event.shiftKey) {
      event.preventDefault();
      options.keepViewportPreviewAlive();
      options.rotateViewportBy(-event.deltaY * 0.005, { x: event.clientX, y: event.clientY });
      return;
    }

    if (options.useCtrlForZoom() && !event.ctrlKey && !event.metaKey) {
      return;
    }

    event.preventDefault();
    options.keepViewportPreviewAlive();
    options.zoomBy(event.deltaY < 0 ? Math.SQRT2 : 1 / Math.SQRT2, { x: event.clientX, y: event.clientY });
  }

  function onCanvasPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      event.preventDefault();
      options.setContextMenu(undefined);
      beginTouchPoint(event);
      setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
      return;
    }

    if (event.altKey) {
      event.preventDefault();
      options.setContextMenu(undefined);

      if (event.button === 0) {
        startCanvasRotateDrag(event);
        setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
      }

      return;
    }

    if (event.button === 1) {
      event.preventDefault();
      options.setContextMenu(undefined);
      startPanDrag(event);
      setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
      return;
    }

    const target = event.target as Element | null;
    const nodeElement = target?.closest('[data-node-id]');

    if (nodeElement) {
      const nodeId = nodeElement.getAttribute('data-node-id');

      if (nodeId) {
        options.selectNode(nodeId, event);
      }
      return;
    }

    if (event.button === 0) {
      options.setContextMenu(undefined);
      startMarqueeDrag(event);
      setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
      return;
    }
  }

  function onWindowPointerMove(event: PointerEvent): void {
    if (event.pointerType === 'touch' && touchPointers.has(event.pointerId)) {
      event.preventDefault();
      touchPointers.set(event.pointerId, pointerEventToTouchPoint(event));
      applyTouchGesture();
      return;
    }

    const drag = activeDrag();

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (drag.type === 'pan') {
      schedulePanMove(drag, event.clientX, event.clientY);
      return;
    }

    if (drag.type === 'rotate-canvas') {
      options.setViewportRotation(
        drag.startRotation + options.angleFromViewportCenter(event.clientX, event.clientY) - drag.startAngle
      );
      options.keepViewportPreviewAlive();
      return;
    }

    if (drag.type === 'marquee') {
      updateMarqueeDrag(drag, event.clientX, event.clientY);
      return;
    }

    if (drag.type === 'transform-box') {
      updateTransformBoxDrag(drag, event.clientX, event.clientY);
      return;
    }

    if (drag.type === 'move-selection') {
      updateMoveSelectionDrag(drag, event.clientX, event.clientY);
      return;
    }

    scheduleHandleMove(event.pointerId, drag.handle, event.clientX, event.clientY);
  }

  function onWindowPointerUp(event: PointerEvent): void {
    if (event.pointerType === 'touch' && touchPointers.has(event.pointerId)) {
      finishTouchPoint(event.pointerId);
      return;
    }

    const drag = activeDrag();

    if (drag?.pointerId === event.pointerId) {
      if (drag.type === 'pan') {
        if (pendingPanFrame !== undefined) {
          window.cancelAnimationFrame(pendingPanFrame);
          pendingPanFrame = undefined;
        }

        flushPendingPanMove();
        options.keepViewportPreviewAlive(100);
      } else if (drag.type === 'handle') {
        if (pendingHandleFrame !== undefined) {
          window.cancelAnimationFrame(pendingHandleFrame);
          pendingHandleFrame = undefined;
        }

        flushPendingHandleMove();
        options.syncActiveRootCode();
      } else if (drag.type === 'marquee') {
        finishMarqueeDrag(drag, event.clientX, event.clientY);
      } else if (drag.type === 'transform-box') {
        options.syncActiveRootCode();
      } else if (drag.type === 'move-selection') {
        if (drag.committed) {
          options.syncActiveRootCode();
        }
      } else if (drag.type === 'rotate-canvas') {
        options.keepViewportPreviewAlive(100);
      }

      setActiveDrag(undefined);
    }
  }

  function onWindowPointerCancel(event: PointerEvent): void {
    if (event.pointerType === 'touch' && touchPointers.has(event.pointerId)) {
      finishTouchPoint(event.pointerId);
      return;
    }

    const drag = activeDrag();

    if (drag?.pointerId === event.pointerId) {
      pendingPanMove = undefined;
      pendingHandleMove = undefined;
      setMarqueeRect(undefined);
      setActiveDrag(undefined);
    }
  }

  function startPanDrag(event: PointerEvent): void {
    const point = options.clientToSvgPoint(event.clientX, event.clientY);
    setActiveDrag({
      type: 'pan',
      pointerId: event.pointerId,
      startWorldX: point.x,
      startWorldY: point.y
    });
  }

  function startCanvasRotateDrag(event: PointerEvent): void {
    setActiveDrag({
      type: 'rotate-canvas',
      pointerId: event.pointerId,
      startAngle: options.angleFromViewportCenter(event.clientX, event.clientY),
      startRotation: options.viewportRotation()
    });
  }

  function onNodePointerDown(nodeId: string, event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      options.selectNode(nodeId, event);
      return;
    }

    const existing = options.selectedIds();

    if (existing.includes(nodeId)) {
      startMoveSelectionDrag(event, existing);
      return;
    }

    options.setSelectedIds([nodeId]);
    options.setSelectionPivot(nodeId);
    options.setSelectedPathCommand(undefined);
    startMoveSelectionDrag(event, [nodeId]);
  }

  function startMoveSelectionDrag(event: PointerEvent, ids: readonly string[]): void {
    const selectedElementIds = topLevelSelectedElementIds(options.activeRoot(), ids);

    if (selectedElementIds.length === 0) {
      return;
    }

    const point = options.clientToSvgPoint(event.clientX, event.clientY, false);
    setActiveDrag({
      type: 'move-selection',
      pointerId: event.pointerId,
      selectedIds: selectedElementIds,
      startRoot: options.activeRoot(),
      startClientX: event.clientX,
      startClientY: event.clientY,
      startWorldX: point.x,
      startWorldY: point.y,
      committed: false
    });
    setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
  }

  function updateMoveSelectionDrag(drag: ActiveMoveSelectionDrag, clientX: number, clientY: number): void {
    if (!drag.committed && Math.hypot(clientX - drag.startClientX, clientY - drag.startClientY) < 3) {
      return;
    }

    const nextDrag = drag.committed ? drag : ({ ...drag, committed: true } satisfies ActiveMoveSelectionDrag);

    if (!drag.committed) {
      options.pushHistory();
      setActiveDrag(nextDrag);
    }

    const point = options.clientToSvgPoint(clientX, clientY, false);
    const transform = translateMatrix(point.x - drag.startWorldX, point.y - drag.startWorldY);
    options.replaceRootWithoutHistory(
      applyGlobalTransformToSelected(drag.startRoot, drag.selectedIds, transform),
      false
    );
  }

  function startMarqueeDrag(event: PointerEvent): void {
    const rect = normalizeClientRect(event.clientX, event.clientY, event.clientX, event.clientY);
    setMarqueeRect(clientRectToOverlayRect(rect));
    setActiveDrag({
      type: 'marquee',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      mode: options.dragSelectionMode(),
      additive: event.ctrlKey || event.metaKey,
      initialSelection: options.selectedIds()
    });
  }

  function updateMarqueeDrag(drag: ActiveMarqueeDrag, clientX: number, clientY: number): void {
    const next = { ...drag, currentClientX: clientX, currentClientY: clientY } satisfies ActiveMarqueeDrag;
    setActiveDrag(next);
    setMarqueeRect(
      clientRectToOverlayRect(normalizeClientRect(drag.startClientX, drag.startClientY, clientX, clientY))
    );
  }

  function finishMarqueeDrag(drag: ActiveMarqueeDrag, clientX: number, clientY: number): void {
    setMarqueeRect(undefined);

    if (Math.hypot(clientX - drag.startClientX, clientY - drag.startClientY) < 4) {
      options.clearSelection();
      return;
    }

    const ids = idsInMarquee(normalizeClientRect(drag.startClientX, drag.startClientY, clientX, clientY), drag.mode);
    const nextIds = drag.additive ? mergeSelection(drag.initialSelection, ids) : ids;
    options.setSelectedIds(nextIds);
    options.setSelectionPivot(nextIds[nextIds.length - 1]);
    options.setSelectedPathCommand(undefined);
  }

  function updateTransformBoxDrag(drag: ActiveTransformBoxDrag, clientX: number, clientY: number): void {
    const point = options.clientToSvgPoint(clientX, clientY, false);
    const transform = transformMatrixForBoxHandle(drag.startBox, drag.handleKind, point, drag.startAngle);
    options.replaceRootWithoutHistory(
      applyGlobalTransformToSelected(drag.startRoot, drag.selectedIds, transform),
      false
    );
  }

  function beginTouchPoint(event: PointerEvent): void {
    touchPointers.set(event.pointerId, pointerEventToTouchPoint(event));
    beginTouchGesture();
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

  function startHandleDrag(event: PointerEvent, handle: HandleDescriptor): void {
    if (event.pointerType === 'touch' || event.button !== 0) {
      return;
    }

    event.stopPropagation();
    options.pushHistory();
    setActiveDrag({
      type: 'handle',
      pointerId: event.pointerId,
      handle
    });
    setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
  }

  function startTransformBoxDrag(event: PointerEvent, handle: TransformBoxHandleDescriptor): void {
    if (event.pointerType === 'touch' || event.button !== 0) {
      return;
    }

    const box = selectionBox();
    const ids = topLevelSelectedElementIds(options.activeRoot(), options.selectedIds());

    if (!box || ids.length === 0) {
      return;
    }

    event.stopPropagation();
    options.pushHistory();
    const center = rectCenter(box);
    const point = options.clientToSvgPoint(event.clientX, event.clientY, false);
    setActiveDrag({
      type: 'transform-box',
      pointerId: event.pointerId,
      handleKind: handle.kind,
      selectedIds: ids,
      startRoot: options.activeRoot(),
      startBox: box,
      startAngle: Math.atan2(point.y - center.y, point.x - center.x)
    });
    setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
  }

  return {
    activeDrag,
    activeTouchGesture,
    selectionBox,
    marqueeRect,
    onCanvasWheel,
    onCanvasPointerDown,
    onNodePointerDown,
    startHandleDrag,
    startTransformBoxDrag
  };
}
