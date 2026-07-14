import type { Accessor, Setter } from 'solid-js';

import { createLegacyEditorCommand, type CommandTransaction } from '../../../editor/commands';
import type { Point } from '../../../editor/geometry';
import { setPointerCaptureSafely } from '../../../editor/pointer';
import type { SelectionTarget } from '../../../editor/selection-targets';
import type { ActiveDrag, ActiveHandleDrag, HandleDescriptor } from '../../../editor/types';
import { createRafQueue } from '../../ui/createRafQueue';

interface PendingHandleMove {
  readonly pointerId: number;
  readonly handle: HandleDescriptor;
  readonly clientX: number;
  readonly clientY: number;
}

export interface ElementHandleToolController {
  readonly beginElementHandleDrag: (event: PointerEvent, handle: HandleDescriptor) => boolean;
  readonly updateElementHandleDrag: (drag: ActiveHandleDrag, event: PointerEvent) => void;
  readonly finishElementHandleDrag: () => void;
  readonly cancelPendingHandleDragUpdate: () => void;
}

export function createElementHandleToolController(options: {
  readonly activeDrag: Accessor<ActiveDrag | undefined>;
  readonly setActiveDrag: Setter<ActiveDrag | undefined>;
  readonly selectTarget: (target: SelectionTarget, event?: PointerEvent) => void;
  readonly clientToSvgPoint: (clientX: number, clientY: number, snapToGrid?: boolean) => Point;
  readonly beginCommandTransaction: () => CommandTransaction | undefined;
}): ElementHandleToolController {
  let pendingHandleMove: PendingHandleMove | undefined;
  let handleTransaction: CommandTransaction | undefined;
  const handleMoveFrame = createRafQueue(flushPendingHandleMove);

  function beginElementHandleDrag(event: PointerEvent, handle: HandleDescriptor): boolean {
    if (event.pointerType === 'touch' || event.button !== 0) {
      return false;
    }

    event.stopPropagation();
    const target = handle.selectionTargets?.[0];

    if (target) {
      options.selectTarget(target, event);
    }

    handleTransaction = options.beginCommandTransaction();
    options.setActiveDrag({
      type: 'handle',
      pointerId: event.pointerId,
      handle
    });
    setPointerCaptureSafely(event.currentTarget as Element, event.pointerId);
    return true;
  }

  function updateElementHandleDrag(drag: ActiveHandleDrag, event: PointerEvent): void {
    pendingHandleMove = {
      pointerId: event.pointerId,
      handle: drag.handle,
      clientX: event.clientX,
      clientY: event.clientY
    };
    handleMoveFrame.schedule();
  }

  function finishElementHandleDrag(): void {
    handleMoveFrame.cancel();
    flushPendingHandleMove();
    handleTransaction?.commit();
    handleTransaction = undefined;
    options.setActiveDrag(undefined);
  }

  function cancelPendingHandleDragUpdate(): void {
    handleMoveFrame.cancel();
    pendingHandleMove = undefined;
  }

  function flushPendingHandleMove(): void {
    const pending = pendingHandleMove;

    if (!pending) {
      return;
    }

    pendingHandleMove = undefined;
    const drag = options.activeDrag();
    const handle = pending.handle;

    if (drag?.type !== 'handle' || drag.pointerId !== pending.pointerId) {
      return;
    }

    const point = options.clientToSvgPoint(pending.clientX, pending.clientY);
    const command =
      handle.commandMode === 'command'
        ? handle.createCommand(point.x, point.y)
        : createLegacyEditorCommand(
            {
              id: 'viewport.drag-handle',
              label: `Drag ${handle.label}`,
              apply: (root) => handle.update(root, point.x, point.y)
            },
            'Legacy SVG handle descriptors expose update closures instead of operation-backed createCommand factories.'
          );

    handleTransaction?.update(command);
  }

  return {
    beginElementHandleDrag,
    updateElementHandleDrag,
    finishElementHandleDrag,
    cancelPendingHandleDragUpdate
  } satisfies ElementHandleToolController;
}
