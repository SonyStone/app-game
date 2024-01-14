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

type InputEvent = PointerEvent & MouseEvent & TouchEvent;

export type MinimumInputEvent = Pick<InputEvent, 'type' | 'pointerId' | 'clientX' | 'clientY' | 'pointerType'> &
  Partial<Pick<InputEvent, 'tiltX' | 'tiltY' | 'pressure' | 'width' | 'height'>> &
  Partial<{ altitudeAngle: number; azimuthAngle: number }>;

export interface HammerInput {
  eventType: 'start' | 'move' | 'end' | 'cancel';
  isFirst: boolean;
  isFinal: boolean;
  timeStamp: number;
  /** delta time from first input */
  deltaTime?: number;

  /** start center */
  start: Vec2Tuple;

  center: Vec2Tuple;
  pointers: Vec2Tuple[];
  changedPointers: MinimumInputEvent[];
  pointerType: MinimumInputEvent['pointerType'];
  angle?: number;
  distance?: number;

  /** Movement of the X and Y axises. */
  delta: Vec2Tuple;

  /** Scaling that has been done when multi-touch. 1 on a single touch. */
  scale?: number;

  /** Rotation that has been done when multi-touch. 0 on a single touch. */
  rotation?: number;

  /** pressure that has been done with stylus. 1 with a mouse */
  pressure?: number;

  /** tilt that has been done with stylus. [0, 0] with a mouse */
  tilt: Vec2Tuple;

  altitudeAngle: number;

  azimuthAngle: number;

  /** a finger wheel on an airbrush stylus */
  // tangentialPressure: number;

  /**  */
  offsetDirection?: DIRECTION;
  overallVelocity: Vec2Tuple;
}

interface EventsHandlerOptions {
  now: () => number;
}

export const DEFAULT_ALTITUDE_ANGLE = Math.PI / 2;

/**
 * Pointer events input
 * handle mouse events
 */
export function createPointerEventsHandler(
  options: EventsHandlerOptions = {
    now: Date.now
  }
) {
  let pointersMap = new Map<number, MinimumInputEvent>();
  let firstInput: ClonedInputData | undefined = undefined;
  let firstMultiple: ClonedInputData | undefined = undefined;
  const computeDelta = createComputeDelta();

  function pointerEventInputHandler(event: MinimumInputEvent) {
    const eventType = getEventType(event);
    const removePointer = getRemovePointer(pointersMap, event, eventType);
    const changedPointers = [event];
    const changedPointersLen = changedPointers.length;
    const pointersLen = pointersMap.size;
    const { isFirst, isFinal } = getIsFirstFinal(eventType, changedPointersLen, pointersLen);

    if (isFirst) {
      firstInput = undefined;
      firstMultiple = undefined;
      computeDelta.clear();
    }

    if (pointersLen === 1) {
      firstMultiple = undefined;
    }

    const pointers = [...pointersMap.values()].map((event) => [event.clientX, event.clientY] as Vec2Tuple);
    const center = getCenter(pointers);
    const timeStamp = options.now();
    const delta = computeDelta.computeDelta(center, eventType);

    // store the first input to calculate the distance and direction
    if (!firstInput) {
      firstInput = simpleCloneInputData({
        eventType,
        timeStamp,
        pointers,
        center,
        delta
      });
    }

    // to compute scale and rotation we need to store the multiple touches
    if (pointers.length > 1 && !firstMultiple) {
      firstMultiple = simpleCloneInputData({
        eventType,
        timeStamp,
        pointers,
        center,
        delta
      });
    } else if (pointers.length === 1) {
      firstMultiple = undefined;
    }

    const offsetCenter = firstMultiple ? firstMultiple.center : firstInput?.center;

    const deltaTime = timeStamp - firstInput.timeStamp;

    const start = firstInput.center;
    const angle = getAngle(offsetCenter, center);
    const distance = getDistance(offsetCenter, center);

    const offsetDirection = getDirection(delta);
    const overallVelocity = getVelocity(deltaTime, delta);

    const pressure = event.pressure;
    const tilt = [event.tiltX, event.tiltY] as Vec2Tuple;

    const altitudeAngle = event.altitudeAngle ?? DEFAULT_ALTITUDE_ANGLE;
    const azimuthAngle = event.azimuthAngle ?? 0;

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
      altitudeAngle,
      azimuthAngle,
      rotation,
      scale,
      pressure,
      tilt
    };

    computeDelta.saveInput(input);

    if (removePointer) {
      pointersMap.delete(event.pointerId);
    }

    return input;
  }

  return pointerEventInputHandler;
}

function getEventType(event: Pick<MinimumInputEvent, 'type'>) {
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

function getRemovePointer<T extends Pick<MinimumInputEvent, 'pointerId'>>(
  pointersMap: Map<number, T>,
  event: T,
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
      pointersMap.set(event.pointerId, event);
      remove_pointer = true;
      break;
    }
    case 'cancel': {
      pointersMap.set(event.pointerId, event);
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
