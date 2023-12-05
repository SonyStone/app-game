import { Vec2Tuple } from 'ogl';
import { DIRECTION, INPUT_CANCEL, INPUT_END, INPUT_MOVE, INPUT_START } from './input-consts';
import { createComputeDelta } from './input/compute-delta';
import getAngle from './input/get-angle';
import getDirection from './input/get-direction';
import getDistance from './input/get-distance';
import getRotation from './input/get-rotation';
import getScale from './input/get-scale';
import getVelocity from './input/get-velocity';
import simpleCloneInputData, { ClonedInputData } from './input/simple-clone-input-data';

const POINTER_INPUT_MAP = {
  pointerdown: INPUT_START,
  pointermove: INPUT_MOVE,
  pointerup: INPUT_END,
  pointercancel: INPUT_CANCEL,
  pointerout: INPUT_CANCEL
};

export interface HammerInput {
  eventType: 'start' | 'move' | 'end' | 'cancel';
  isFirst: boolean;
  isFinal: boolean;
  timeStamp: number;
  start: Vec2Tuple;
  center: Vec2Tuple;
  pointers: Vec2Tuple[];
  changedPointers: PointerEvent[];
  pointerType: PointerEvent['pointerType'];
  deltaTime?: number;
  angle?: number;
  distance?: number;
  delta: Vec2Tuple;
  scale?: number;
  rotation?: number;
  offsetDirection?: DIRECTION;
  overallVelocity: Vec2Tuple;
}

type ExtPointerEvent = PointerEvent & {
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel' | 'pointerout';
  pointerType: 'mouse' | 'pan' | 'touch';
};

const store: { [key: number]: ExtPointerEvent } = {};

/**
 * Pointer events input
 * handle mouse events
 */
export function createPointerEventsHandler() {
  let pointersMap = new Map<number, PointerEvent>();
  let firstInput: HammerInput | undefined = undefined;
  let firstMultiple: ClonedInputData | undefined = undefined;
  let offsetDelta = [0, 0] as Vec2Tuple;
  let prevDelta = [0, 0] as Vec2Tuple;
  let prevInput = undefined;
  const computeDelta = createComputeDelta();

  function pointerEventInputHandler(event: PointerEvent) {
    const eventType = getEventType(event);
    const removePointer = getRemovePointer(pointersMap, event, eventType);
    const changedPointers = [event];
    const changedPointersLen = changedPointers.length;
    const pointersLen = pointersMap.size;
    const { isFirst, isFinal } = getIsFirstFinal(eventType, changedPointersLen, pointersLen);

    if (isFirst) {
      firstInput = undefined;
      firstMultiple = undefined;
      offsetDelta = [0, 0] as Vec2Tuple;
      prevDelta = [0, 0] as Vec2Tuple;
      prevInput = undefined;
    }

    if (pointersLen === 1) {
      firstMultiple = undefined;
    }

    const offsetCenter = firstMultiple ? firstMultiple.center : firstInput?.center ?? ([0, 0] as Vec2Tuple);

    const pointers = [...pointersMap.values()].map((event) => [event.clientX, event.clientY] as Vec2Tuple);
    const timeStamp = performance.now();
    const deltaTime = timeStamp - (firstInput?.timeStamp ?? 0);

    const center = getCenter(pointers);
    const start = firstInput?.center ?? center;
    const angle = getAngle(offsetCenter, center);
    const distance = getDistance(offsetCenter, center);

    const delta = computeDelta(center, eventType);
    const offsetDirection = getDirection(delta);
    const overallVelocity = getVelocity(deltaTime, delta);

    const scale = firstMultiple ? getScale(firstMultiple.pointers, pointers) : 1;
    const rotation = firstMultiple ? getRotation(firstMultiple.pointers, pointers) : 0;

    const input: HammerInput = {
      eventType,
      isFirst,
      isFinal,
      timeStamp,
      start,
      center,
      pointers,
      angle,
      distance,
      changedPointers,
      delta,
      offsetDirection,
      overallVelocity,
      pointerType: event.pointerType,
      rotation,
      scale
    };

    // store the first input to calculate the distance and direction
    if (!firstInput) {
      firstInput = input;
    }

    // to compute scale and rotation we need to store the multiple touches
    if (pointersLen > 1 && !firstMultiple) {
      firstMultiple = simpleCloneInputData(input);
    } else if (pointersLen === 1) {
      firstMultiple = undefined;
    }

    if (removePointer) {
      pointersMap.delete(event.pointerId);
    }

    prevInput = input;

    return input;
  }

  return pointerEventInputHandler;
}

function getEventType(event: PointerEvent) {
  let event_type: HammerInput['eventType'] = 'cancel';
  switch (event.type) {
    case 'pointerdown': {
      event_type = 'start';
      break;
    }
    case 'pointermove': {
      event_type = 'move';
      break;
    }
    case 'pointerup': {
      event_type = 'end';
      break;
    }
    case 'pointerleave': {
      event_type = 'cancel';
      break;
    }
    case 'pointercancel': {
      event_type = 'cancel';
      break;
    }
    default: {
      event_type = 'cancel';
      break;
    }
  }
  return event_type;
}

function getRemovePointer(
  pointersMap: Map<number, PointerEvent>,
  event: PointerEvent,
  eventType: HammerInput['eventType']
) {
  let remove_pointer = false;
  switch (eventType) {
    case 'start': {
      pointersMap.clear();
      pointersMap.set(event.pointerId, event);
      remove_pointer = false;
      break;
    }
    case 'move': {
      pointersMap.set(event.pointerId, event);
      remove_pointer = false;
      break;
    }
    case 'end': {
      remove_pointer = true;
      break;
    }
    case 'cancel': {
      remove_pointer = true;
      break;
    }
    default: {
      remove_pointer = true;
      break;
    }
  }

  return remove_pointer;
}

function getIsFirstFinal(eventType: HammerInput['eventType'], changedPointersLen: number, pointersLen: number) {
  let isFirst = false;
  let isFinal = false;

  if (changedPointersLen - pointersLen === 0) {
    switch (eventType) {
      case 'start': {
        isFirst = true;
        isFinal = false;
        break;
      }
      case 'move': {
        isFirst = false;
        isFinal = false;
        break;
      }
      case 'end': {
        isFirst = false;
        isFinal = true;
        break;
      }
      case 'cancel': {
        isFirst = false;
        isFinal = true;
        break;
      }
      default: {
        isFirst = false;
        isFinal = false;
        break;
      }
    }
  } else {
    isFirst = false;
    isFinal = false;
  }

  return {
    isFirst,
    isFinal
  };
}

function getCenter(pointers: Vec2Tuple[]): Vec2Tuple {
  const pointers_length = pointers.length;

  if (pointers_length === 0) {
    return [0, 0] as Vec2Tuple;
  }

  if (pointers_length === 1) {
    return [pointers[0][0], pointers[0][1]];
  }

  const center = [0, 0];

  for (const pointer of pointers) {
    center[0] += pointer[0];
    center[1] += pointer[1];
  }

  center[0] /= pointers_length;
  center[1] /= pointers_length;

  return center as Vec2Tuple;
}
