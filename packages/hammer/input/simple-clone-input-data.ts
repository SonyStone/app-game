import type { Vec2Tuple } from '@packages/ogl/math/vec-2_old';
import { HammerInput } from '../pointerevent';
import { round } from '../utils/utils-consts';
import getCenter from './get-center';

export interface ClonedInputData {
  eventType: HammerInput['eventType'];
  timeStamp: number;
  pointers: Vec2Tuple[];
  center: Vec2Tuple;
  delta: Vec2Tuple;
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
  let pointers: Vec2Tuple[] = [];
  let i = 0;
  while (i < input.pointers.length) {
    pointers[i] = [round(input.pointers[i][0]), round(input.pointers[i][1])];
    i++;
  }

  return {
    eventType: input.eventType,
    timeStamp: input.timeStamp,
    pointers,
    center: getCenter(pointers),
    delta: [input.delta[0], input.delta[1]]
  };
}
