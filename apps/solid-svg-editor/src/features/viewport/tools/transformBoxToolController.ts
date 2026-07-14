import type { Accessor, Setter } from 'solid-js';

import type { CommandTransaction } from '../../../editor/commands';
import { createTransformSelectedCommand } from '../../../editor/commands/transformCommands';
import { rectCenter, type Point, type Rect } from '../../../editor/geometry';
import { setPointerCaptureSafely } from '../../../editor/pointer';
import type { ActiveDrag, ActiveTransformBoxDrag, TransformBoxHandleDescriptor } from '../../../editor/types';
import type { SvgElementNode } from '../../../svg-model';
import {
  topLevelSelectedElementIds,
  transformMatrixForBoxHandle
} from '../../selection/transform-selection';

export interface TransformBoxToolController {
  readonly beginTransformBoxDrag: (event: PointerEvent, handle: TransformBoxHandleDescriptor) => boolean;
  readonly updateTransformBoxDragFromEvent: (drag: ActiveTransformBoxDrag, event: PointerEvent) => void;
  readonly finishTransformBoxDrag: () => void;
}

export function createTransformBoxToolController(options: {
  readonly activeRoot: Accessor<SvgElementNode>;
  readonly selectedIds: Accessor<readonly string[]>;
  readonly selectionBox: Accessor<Rect | undefined>;
  readonly setActiveDrag: Setter<ActiveDrag | undefined>;
  readonly clientToSvgPoint: (clientX: number, clientY: number, snapToGrid?: boolean) => Point;
  readonly beginCommandTransaction: () => CommandTransaction | undefined;
}): TransformBoxToolController {
  let transformBoxTransaction: CommandTransaction | undefined;

  function beginTransformBoxDrag(event: PointerEvent, handle: TransformBoxHandleDescriptor): boolean {
    if (event.pointerType === 'touch' || event.button !== 0) {
      return false;
    }

    const box = options.selectionBox();
    const ids = topLevelSelectedElementIds(options.activeRoot(), options.selectedIds());

    if (!box || ids.length === 0) {
      return false;
    }

    event.stopPropagation();
    transformBoxTransaction = options.beginCommandTransaction();
    const center = rectCenter(box);
    const point = options.clientToSvgPoint(event.clientX, event.clientY, false);
    options.setActiveDrag({
      type: 'transform-box',
      pointerId: event.pointerId,
      handleKind: handle.kind,
      selectedIds: ids,
      startBox: box,
      startAngle: Math.atan2(point.y - center.y, point.x - center.x)
    });
    setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
    return true;
  }

  function updateTransformBoxDrag(drag: ActiveTransformBoxDrag, clientX: number, clientY: number): void {
    const point = options.clientToSvgPoint(clientX, clientY, false);
    const transform = transformMatrixForBoxHandle(drag.startBox, drag.handleKind, point, drag.startAngle);
    transformBoxTransaction?.update(
      createTransformSelectedCommand({
        ids: drag.selectedIds,
        transform,
        label: 'Transform selection'
      })
    );
  }

  function updateTransformBoxDragFromEvent(drag: ActiveTransformBoxDrag, event: PointerEvent): void {
    updateTransformBoxDrag(drag, event.clientX, event.clientY);
  }

  function finishTransformBoxDrag(): void {
    transformBoxTransaction?.commit();
    transformBoxTransaction = undefined;
    options.setActiveDrag(undefined);
  }

  return {
    beginTransformBoxDrag,
    updateTransformBoxDragFromEvent,
    finishTransformBoxDrag
  } satisfies TransformBoxToolController;
}
