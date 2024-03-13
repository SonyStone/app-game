import { createMemo } from 'solid-js';

import { FVec2 } from '@packages/math';
import { createPointerStream } from './create-pointer-stream';

export function createPointerData(element: HTMLElement) {
  const pointer$ = createPointerStream(element);
  const pointerData = {
    start: FVec2.create(),
    end: FVec2.create(),
    move: FVec2.create(),
    prev: FVec2.create(),
    tilt: FVec2.create(),
    angle: FVec2.create(),
    pressure: 0,
    distance: 0
  };

  return createMemo(
    () => {
      const event = pointer$();
      if (!event) {
        return pointerData;
      }

      const box = element.getBoundingClientRect();
      const offset_x = box.left; // Help get X,Y in relation to the canvas position.
      const offset_y = box.top;
      const x = event.pageX - offset_x;
      const y = event.pageY - offset_y;

      switch (event?.type) {
        case 'pointerdown':
          pointerData.start.set(x, y);
          pointerData.prev.set(x, y);
          pointerData.move.set(x, y);
          pointerData.distance = 0;
          break;
        case 'pointermove':
          pointerData.prev.copy(pointerData.move);
          pointerData.move.set(x, y);
          pointerData.distance = FVec2.distanceSq(pointerData.move, pointerData.prev);
          break;
        default:
          pointerData.move.set(x, y);
          pointerData.end.set(x, y);
          pointerData.distance = FVec2.distanceSq(pointerData.move, pointerData.prev);
          break;
      }

      if (event.pointerType === 'pen') {
        pointerData.pressure = event.pressure;
        pointerData.tilt.set(event.tiltX, event.tiltY);
        pointerData.angle.set((event as any).altitudeAngle, (event as any).azimuthAngle);
      } else {
        pointerData.pressure = 1;
        pointerData.tilt.set(0, 0);
      }

      return pointerData;
    },
    pointerData,
    {
      equals: (_, next) => next.distance === 0
    }
  );
}
