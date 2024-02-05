import { Vec2Tuple } from '@packages/ogl/math/vec-2';
import { HammerInput } from '../pointerevent';
import simpleCloneInputData, { ClonedInputData } from './simple-clone-input-data';

export function createComputeDelta() {
  const session: {
    offsetDelta: Vec2Tuple;
    prevDelta: Vec2Tuple;
    prevInput?: ClonedInputData;
  } = {
    offsetDelta: [0, 0],
    prevDelta: [0, 0],
    prevInput: undefined
  };

  function computeDelta(center: Vec2Tuple, eventType: HammerInput['eventType']) {
    let offset = session.offsetDelta;
    let prevDelta = session.prevDelta;
    let prevInput = session.prevInput;

    if (eventType === 'start' || prevInput?.eventType === 'end') {
      prevDelta = session.prevDelta = [prevInput?.delta?.[0] || 0, prevInput?.delta?.[1] || 0];

      offset = session.offsetDelta = [center[0], center[1]];
    }

    const delta = [prevDelta[0] + (center[0] - offset[0]), prevDelta[1] + (center[1] - offset[1])] as Vec2Tuple;

    return delta;
  }

  return {
    computeDelta,
    saveInput(input: HammerInput) {
      session.prevInput = simpleCloneInputData(input);
    },
    clear() {
      session.offsetDelta = [0, 0];
      session.prevDelta = [0, 0];
      session.prevInput = undefined;
    }
  };
}
