import type { Accessor, Setter } from 'solid-js';

import type { CommandTransaction } from '../../../editor/commands';
import { createTransformSelectedCommand } from '../../../editor/commands/transformCommands';
import { rectFromPoints, translateMatrix, type Point, type Rect } from '../../../editor/geometry';
import { setPointerCaptureSafely } from '../../../editor/pointer';
import { mergeSelectionTargets, nodeSelectionTarget, type SelectionTarget } from '../../../editor/selection-targets';
import type { SvgSpatialIndex } from '../../../editor/svg-spatial-index';
import type { ActiveDrag, ActiveMarqueeDrag, ActiveMoveSelectionDrag, DragSelectionMode } from '../../../editor/types';
import type { SvgElementNode } from '../../../svg-model';
import { normalizeClientRect } from '../../selection/selection-geometry';
import { topLevelSelectedElementIds } from '../../selection/transform-selection';
import type { ViewportRendererAdapter } from '../rendererAdapter';

export interface SelectionToolController {
  readonly handleCanvasSelectionPointerDown: (event: PointerEvent) => boolean;
  readonly handleNodeSelectionPointerDown: (nodeId: string, event: PointerEvent) => boolean;
  readonly handleSelectionTargetPointerDown: (target: SelectionTarget, event: PointerEvent) => boolean;
  readonly updateMarqueeDragFromEvent: (drag: ActiveMarqueeDrag, event: PointerEvent) => void;
  readonly finishMarqueeDragFromEvent: (drag: ActiveMarqueeDrag, event: PointerEvent) => void;
  readonly updateMoveSelectionDragFromEvent: (drag: ActiveMoveSelectionDrag, event: PointerEvent) => void;
  readonly finishMoveSelectionDrag: (drag: ActiveMoveSelectionDrag) => void;
}

export function createSelectionToolController(options: {
  readonly activeRoot: Accessor<SvgElementNode>;
  readonly selectedIds: Accessor<readonly string[]>;
  readonly selectedTargets: Accessor<readonly SelectionTarget[]>;
  readonly setSelectedTargets: (targets: readonly SelectionTarget[]) => void;
  readonly selectTarget: (target: SelectionTarget, event?: PointerEvent) => void;
  readonly selectNode: (nodeId: string, event?: MouseEvent | PointerEvent) => void;
  readonly clearSelection: () => void;
  readonly clearContextMenu: () => void;
  readonly setActiveDrag: Setter<ActiveDrag | undefined>;
  readonly setMarqueeRect: Setter<Rect | undefined>;
  readonly clientToSvgPoint: (clientX: number, clientY: number, snapToGrid?: boolean) => Point;
  readonly dragSelectionMode: Accessor<DragSelectionMode>;
  readonly renderer: Pick<
    ViewportRendererAdapter,
    'clientRectToViewportOverlay' | 'hitTestMarqueeTargets' | 'selectionTargetFromEventTarget'
  >;
  readonly spatialIndex?: Accessor<SvgSpatialIndex | undefined>;
  readonly beginCommandTransaction: () => CommandTransaction | undefined;
}) {
  let moveSelectionTransaction: CommandTransaction | undefined;

  function handleCanvasSelectionPointerDown(event: PointerEvent): boolean {
    const target = options.renderer.selectionTargetFromEventTarget(event.target);

    if (target) {
      options.selectTarget(target, event);
      return true;
    }

    if (event.button === 0) {
      options.clearContextMenu();
      startMarqueeDrag(event);
      setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
      return true;
    }

    return false;
  }

  function handleNodeSelectionPointerDown(nodeId: string, event: PointerEvent): boolean {
    if (event.button !== 0) {
      return false;
    }

    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      options.selectNode(nodeId, event);
      return true;
    }

    const existing = options.selectedIds();

    if (existing.includes(nodeId)) {
      startMoveSelectionDrag(event, existing);
      return true;
    }

    options.setSelectedTargets([nodeSelectionTarget(nodeId)]);
    startMoveSelectionDrag(event, [nodeId]);
    return true;
  }

  function handleSelectionTargetPointerDown(target: SelectionTarget, event: PointerEvent): boolean {
    switch (target.kind) {
      case 'node':
        return handleNodeSelectionPointerDown(target.nodeId, event);
      case 'path-command':
      case 'path-anchor':
        if (event.button !== 0) {
          return false;
        }

        options.selectTarget(target, event);
        return true;
      default: {
        const exhaustive: never = target;
        throw new Error(`Unhandled selection target: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  function startMoveSelectionDrag(event: PointerEvent, ids: readonly string[]): void {
    const selectedElementIds = topLevelSelectedElementIds(options.activeRoot(), ids);

    if (selectedElementIds.length === 0) {
      return;
    }

    const point = options.clientToSvgPoint(event.clientX, event.clientY, false);
    moveSelectionTransaction = options.beginCommandTransaction();
    options.setActiveDrag({
      type: 'move-selection',
      pointerId: event.pointerId,
      selectedIds: selectedElementIds,
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
      options.setActiveDrag(nextDrag);
    }

    const point = options.clientToSvgPoint(clientX, clientY, false);
    const transform = translateMatrix(point.x - drag.startWorldX, point.y - drag.startWorldY);
    moveSelectionTransaction?.update(
      createTransformSelectedCommand({
        ids: drag.selectedIds,
        transform,
        label: 'Move selection'
      })
    );
  }

  function updateMoveSelectionDragFromEvent(drag: ActiveMoveSelectionDrag, event: PointerEvent): void {
    updateMoveSelectionDrag(drag, event.clientX, event.clientY);
  }

  function finishMoveSelectionDrag(drag: ActiveMoveSelectionDrag): void {
    if (drag.committed) {
      moveSelectionTransaction?.commit();
    } else {
      moveSelectionTransaction?.cancel();
    }

    moveSelectionTransaction = undefined;
    options.setActiveDrag(undefined);
  }

  function startMarqueeDrag(event: PointerEvent): void {
    const rect = normalizeClientRect(event.clientX, event.clientY, event.clientX, event.clientY);
    options.setMarqueeRect(clientRectToOverlayRect(rect));
    options.setActiveDrag({
      type: 'marquee',
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      mode: options.dragSelectionMode(),
      additive: event.ctrlKey || event.metaKey,
      initialSelectionTargets: options.selectedTargets()
    });
  }

  function updateMarqueeDrag(drag: ActiveMarqueeDrag, clientX: number, clientY: number): void {
    const next = { ...drag, currentClientX: clientX, currentClientY: clientY } satisfies ActiveMarqueeDrag;
    options.setActiveDrag(next);
    options.setMarqueeRect(
      clientRectToOverlayRect(normalizeClientRect(drag.startClientX, drag.startClientY, clientX, clientY))
    );
  }

  function updateMarqueeDragFromEvent(drag: ActiveMarqueeDrag, event: PointerEvent): void {
    updateMarqueeDrag(drag, event.clientX, event.clientY);
  }

  function finishMarqueeDrag(drag: ActiveMarqueeDrag, clientX: number, clientY: number): void {
    options.setMarqueeRect(undefined);

    if (Math.hypot(clientX - drag.startClientX, clientY - drag.startClientY) < 4) {
      options.clearSelection();
      options.setActiveDrag(undefined);
      return;
    }

    const clientRect = normalizeClientRect(drag.startClientX, drag.startClientY, clientX, clientY);
    const targets = marqueeTargetsForClientRect(clientRect, drag.mode);
    const nextTargets = drag.additive ? mergeSelectionTargets(drag.initialSelectionTargets, targets) : targets;
    options.setSelectedTargets(nextTargets);
    options.setActiveDrag(undefined);
  }

  function finishMarqueeDragFromEvent(drag: ActiveMarqueeDrag, event: PointerEvent): void {
    finishMarqueeDrag(drag, event.clientX, event.clientY);
  }

  function clientRectToOverlayRect(clientRect: Rect): Rect {
    return options.renderer.clientRectToViewportOverlay(clientRect);
  }

  function marqueeTargetsForClientRect(clientRect: Rect, mode: DragSelectionMode): readonly SelectionTarget[] {
    const rendererTargets = options.renderer.hitTestMarqueeTargets(clientRect, mode);

    if (rendererTargets.length > 0) {
      return rendererTargets;
    }

    const spatialIndex = options.spatialIndex?.();
    const worldRect = spatialIndex ? clientRectToWorldRect(clientRect) : undefined;

    if (!spatialIndex || !worldRect) {
      return rendererTargets;
    }

    return spatialIndex.nodesInRect(worldRect, mode).map((entry) => nodeSelectionTarget(entry.nodeId));
  }

  function clientRectToWorldRect(clientRect: Rect): Rect | undefined {
    const x2 = clientRect.x + clientRect.width;
    const y2 = clientRect.y + clientRect.height;

    return rectFromPoints([
      options.clientToSvgPoint(clientRect.x, clientRect.y, false),
      options.clientToSvgPoint(x2, clientRect.y, false),
      options.clientToSvgPoint(x2, y2, false),
      options.clientToSvgPoint(clientRect.x, y2, false)
    ]);
  }

  return {
    handleCanvasSelectionPointerDown,
    handleNodeSelectionPointerDown,
    handleSelectionTargetPointerDown,
    updateMarqueeDragFromEvent,
    finishMarqueeDragFromEvent,
    updateMoveSelectionDragFromEvent,
    finishMoveSelectionDrag
  } satisfies SelectionToolController;
}
