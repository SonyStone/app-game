import { v2 } from '@webgl/math';
import { createMemo } from 'solid-js';

import { createPointerStream } from './create-pointer-stream';

export function createPointerData(element: HTMLElement) {
  const pointer$ = createPointerStream(element);
  const pointerData = {
    start: v2.create(),
    end: v2.create(),
    move: v2.create(),
    prev: v2.create(),
    tilt: v2.create(),
    angle: v2.create(),
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
          v2.set(pointerData.start, x, y);
          v2.set(pointerData.prev, x, y);
          v2.set(pointerData.move, x, y);
          pointerData.distance = 0;
          break;
        case 'pointermove':
          v2.copy(pointerData.prev, pointerData.move);
          v2.set(pointerData.move, x, y);
          pointerData.distance = v2.distanceSquared(pointerData.move, pointerData.prev);
          break;
        default:
          v2.set(pointerData.move, x, y);
          v2.set(pointerData.end, x, y);
          pointerData.distance = v2.distanceSquared(pointerData.move, pointerData.prev);
          break;
      }

      if (event.pointerType === 'pen') {
        pointerData.pressure = event.pressure;
        v2.set(pointerData.tilt, event.tiltX, event.tiltY);
        v2.set(pointerData.angle, (event as any).altitudeAngle, (event as any).azimuthAngle);
      } else {
        pointerData.pressure = 1;
        v2.set(pointerData.tilt, 0, 0);
      }

      return pointerData;
    },
    pointerData,
    {
      equals: (_, next) => next.distance === 0
    }
  );
}
