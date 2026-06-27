import type { Point } from './geometry';

export type DispatchPointer = {
  readonly id: string;
  readonly isPrimary: boolean;
  readonly pointerId: number;
  readonly pointerType: 'mouse' | 'touch';
};

export type DispatchPosition = {
  readonly point: Point;
  readonly pointer: DispatchPointer;
};

export type DispatchActionKind = 'click' | 'pointerdown' | 'pointerup';

export type DispatchAction = {
  readonly kind: DispatchActionKind;
  readonly pointerId: string;
};

type ButtonState = 'hover' | 'pressed' | 'released';

type PointerEventType =
  | 'pointerover'
  | 'pointerenter'
  | 'pointermove'
  | 'pointerdown'
  | 'pointerup'
  | 'pointerout'
  | 'pointerleave';

type MouseEventType =
  | 'mouseover'
  | 'mouseenter'
  | 'mousemove'
  | 'mousedown'
  | 'mouseup'
  | 'click'
  | 'mouseout'
  | 'mouseleave';

export type EventDispatcher = {
  readonly dispatchActions: (actions: readonly DispatchAction[], positions: readonly DispatchPosition[]) => void;
  readonly dispatchPositions: (positions: readonly DispatchPosition[]) => void;
  readonly reset: () => void;
};

export type EventDispatcherOptions = {
  readonly hitTest?: (point: Point) => Element | null;
};

export function createEventDispatcher(options: EventDispatcherOptions = {}): EventDispatcher {
  const lastTargets = new Map<string, Element>();
  const pressedPointers = new Set<string>();
  const hitTest = options.hitTest ?? ((point: Point) => document.elementFromPoint(point.x, point.y));

  return {
    dispatchActions(actions, positions) {
      const positionByPointerId = new Map(positions.map((position) => [position.pointer.id, position]));

      for (const action of actions) {
        const position = positionByPointerId.get(action.pointerId);

        if (!position) {
          continue;
        }

        const target = getEventTarget(position.point, hitTest);

        switch (action.kind) {
          case 'pointerdown': {
            dispatchPointerEvent(target, 'pointerdown', position.point, 'pressed', position.pointer);

            if (position.pointer.pointerType === 'mouse') {
              dispatchMouseEvent(target, 'mousedown', position.point, 'pressed');
            }

            pressedPointers.add(position.pointer.id);
            break;
          }
          case 'pointerup': {
            dispatchPointerEvent(target, 'pointerup', position.point, 'released', position.pointer);

            if (position.pointer.pointerType === 'mouse') {
              dispatchMouseEvent(target, 'mouseup', position.point, 'released');
            } else {
              dispatchPointerEvent(target, 'pointerout', position.point, 'released', position.pointer);
              dispatchPointerEvent(target, 'pointerleave', position.point, 'released', position.pointer);
              lastTargets.delete(position.pointer.id);
            }

            pressedPointers.delete(position.pointer.id);
            break;
          }
          case 'click': {
            if (position.pointer.pointerType === 'mouse') {
              dispatchMouseEvent(target, 'click', position.point, 'released', undefined, 1);
            }

            break;
          }
          default: {
            const exhaustive: never = action.kind;
            throw new Error(`Unhandled dispatch action: ${exhaustive}`);
          }
        }
      }
    },
    dispatchPositions(positions) {
      for (const position of positions) {
        const target = getEventTarget(position.point, hitTest);
        const previousTarget = lastTargets.get(position.pointer.id);
        const buttonState: ButtonState = pressedPointers.has(position.pointer.id) ? 'pressed' : 'hover';

        if (previousTarget !== target) {
          if (previousTarget) {
            dispatchPointerEvent(previousTarget, 'pointerout', position.point, buttonState, position.pointer, target);

            if (position.pointer.pointerType === 'mouse') {
              dispatchMouseEvent(previousTarget, 'mouseout', position.point, buttonState, target);
            }

            dispatchPointerEvent(previousTarget, 'pointerleave', position.point, buttonState, position.pointer, target);

            if (position.pointer.pointerType === 'mouse') {
              dispatchMouseEvent(previousTarget, 'mouseleave', position.point, buttonState, target);
            }
          }

          dispatchPointerEvent(target, 'pointerover', position.point, buttonState, position.pointer, previousTarget);

          if (position.pointer.pointerType === 'mouse') {
            dispatchMouseEvent(target, 'mouseover', position.point, buttonState, previousTarget);
          }

          dispatchPointerEvent(target, 'pointerenter', position.point, buttonState, position.pointer, previousTarget);

          if (position.pointer.pointerType === 'mouse') {
            dispatchMouseEvent(target, 'mouseenter', position.point, buttonState, previousTarget);
          }

          lastTargets.set(position.pointer.id, target);
        }

        dispatchPointerEvent(target, 'pointermove', position.point, buttonState, position.pointer);

        if (position.pointer.pointerType === 'mouse') {
          dispatchMouseEvent(target, 'mousemove', position.point, buttonState);
        }
      }
    },
    reset() {
      lastTargets.clear();
      pressedPointers.clear();
    }
  };
}

function dispatchPointerEvent(
  target: Element,
  type: PointerEventType,
  point: Point,
  buttonState: ButtonState,
  pointer: DispatchPointer,
  relatedTarget?: Element
): void {
  target.dispatchEvent(
    new PointerEvent(type, {
      ...mouseInit(type, point, buttonState, relatedTarget),
      height: pointer.pointerType === 'touch' ? 28 : 1,
      isPrimary: pointer.isPrimary,
      pointerId: pointer.pointerId,
      pointerType: pointer.pointerType,
      pressure: buttonState === 'pressed' ? 0.5 : 0,
      width: pointer.pointerType === 'touch' ? 28 : 1
    })
  );
}

function dispatchMouseEvent(
  target: Element,
  type: MouseEventType,
  point: Point,
  buttonState: ButtonState,
  relatedTarget?: Element,
  detail = 0
): void {
  target.dispatchEvent(new MouseEvent(type, mouseInit(type, point, buttonState, relatedTarget, detail)));
}

function eventBubbles(type: MouseEventType | PointerEventType): boolean {
  return type !== 'mouseenter' && type !== 'mouseleave' && type !== 'pointerenter' && type !== 'pointerleave';
}

function eventButton(type: MouseEventType | PointerEventType): number {
  return type === 'mousedown' ||
    type === 'mouseup' ||
    type === 'click' ||
    type === 'pointerdown' ||
    type === 'pointerup'
    ? 0
    : -1;
}

function getEventTarget(point: Point, hitTest: (point: Point) => Element | null): Element {
  return hitTest(point) ?? document.documentElement;
}

function mouseInit(
  type: MouseEventType | PointerEventType,
  point: Point,
  buttonState: ButtonState,
  relatedTarget?: Element,
  detail = 0
): MouseEventInit {
  return {
    bubbles: eventBubbles(type),
    button: eventButton(type),
    buttons: buttonState === 'pressed' ? 1 : 0,
    cancelable: eventBubbles(type),
    clientX: point.x,
    clientY: point.y,
    composed: true,
    detail,
    relatedTarget,
    screenX: window.screenX + point.x,
    screenY: window.screenY + point.y,
    view: window
  };
}
