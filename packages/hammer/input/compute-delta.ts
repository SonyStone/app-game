import { Vec2 } from '@app-game/math';
import { HammerInput } from '../pointerevent';
import simpleCloneInputData, { ClonedInputData } from './simple-clone-input-data';

export function createComputeDelta() {
  const session: {
    offsetDelta: Vec2;
    prevDelta: Vec2;
    prevInput?: ClonedInputData;
  } = {
    offsetDelta: new Vec2(),
    prevDelta: new Vec2(),
    prevInput: undefined
  };

  function computeDelta(center: Vec2, eventType: HammerInput['eventType']) {
    let offset = session.offsetDelta;
    let prevDelta = session.prevDelta;
    const prevInput = session.prevInput;

    if (eventType === 'start' || prevInput?.eventType === 'end') {
      prevDelta = session.prevDelta = new Vec2().set(prevInput?.delta?.x || 0, prevInput?.delta?.y || 0);

      offset = session.offsetDelta = new Vec2().set(center.x, center.y);
    }

    const delta = new Vec2().set(prevDelta.x + (center.x - offset.x), prevDelta.y + (center.y - offset.y));

    return delta;
  }

  return {
    computeDelta,
    saveInput(input: HammerInput) {
      session.prevInput = simpleCloneInputData(input);
    },
    clear() {
      session.offsetDelta = new Vec2();
      session.prevDelta = new Vec2();
      session.prevInput = undefined;
    }
  };
}
