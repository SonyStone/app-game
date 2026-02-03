import { Vec2 } from '@packages/math';
import { HammerInput } from '../pointerevent';
import { round } from '../utils/utils-consts';

export interface ClonedInputData {
  eventType: HammerInput['eventType'];
  timeStamp: number;
  pointers: Vec2[];
  center: Vec2;
  delta: Vec2;
}

function getCenter(pointers: Vec2[]): Vec2 {
  const pointersLength = pointers.length;

  if (pointersLength === 0) {
    return new Vec2().set(0, 0);
  }

  if (pointersLength === 1) {
    return new Vec2().set(round(pointers[0].x), round(pointers[0].y));
  }

  let x = 0;
  let y = 0;
  for (const pointer of pointers) {
    x += pointer.x;
    y += pointer.y;
  }

  return new Vec2().set(round(x / pointersLength), round(y / pointersLength));
}

/**
 * @private
 * create a simple clone from the input used for storage of firstInput and firstMultiple
 * @param {Object} input
 * @returns {Object} clonedInputData
 */
export default function simpleCloneInputData(input: HammerInput | ClonedInputData): ClonedInputData {
  // make a simple copy of the pointers because we will get a reference if we don't
  // we only need clientXY for the calculations
  const pointers: Vec2[] = [];
  let i = 0;
  while (i < input.pointers.length) {
    pointers[i] = new Vec2().set(round(input.pointers[i].x), round(input.pointers[i].y));
    i++;
  }

  return {
    eventType: input.eventType,
    timeStamp: input.timeStamp,
    pointers,
    center: getCenter(pointers),
    delta: new Vec2().set(input.delta.x, input.delta.y)
  };
}
