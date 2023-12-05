import { Vec2Tuple } from 'ogl';
import { HammerInput } from '../pointerevent';

export function createComputeDelta() {
  // jscs throwing error on defalut destructured values and without defaults tests fail
  let offset: Vec2Tuple = [0, 0];
  let prevDelta: Vec2Tuple = [0, 0];
  let offsetDelta: Vec2Tuple = [0, 0];
  let prevInput: HammerInput;

  function computeDelta(center: Vec2Tuple, eventType: HammerInput['eventType']) {
    offset = [0, 0];
    prevDelta = [0, 0];

    if (prevInput && (eventType === 'start' || prevInput?.eventType === 'end')) {
      prevDelta = [prevInput.delta?.[0] || 0, prevInput.delta?.[1] || 0];

      offset = offsetDelta = [center[0], center[1]];
    }

    const delta = [prevDelta[0] + (center[0] - offset[0]), prevDelta[1] + (center[1] - offset[1])] as Vec2Tuple;

    return delta;
  }

  return computeDelta;
}
