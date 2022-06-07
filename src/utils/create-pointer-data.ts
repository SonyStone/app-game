import * as v2 from '@webgl/math/v2';
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
    distance: 0,
  };

  return createMemo(
    () => {
      const event = pointer$();
      if (!event) return pointerData;

      const box = element.getBoundingClientRect();
      const offset_x = box.left; // Help get X,Y in relation to the canvas position.
      const offset_y = box.top;
      const x = event.pageX - offset_x;
      const y = event.pageY - offset_y;

      switch (event?.type) {
        case 'pointerdown':
          v2.set(x, y, pointerData.start);
          v2.set(x, y, pointerData.prev);
          v2.set(x, y, pointerData.move);
          pointerData.distance = 0;
          break;
        case 'pointermove':
          v2.copy(pointerData.move, pointerData.prev);
          v2.set(x, y, pointerData.move);
          pointerData.distance = v2.distanceSq(
            pointerData.move,
            pointerData.prev
          );
          break;
        default:
          v2.set(x, y, pointerData.move);
          v2.set(x, y, pointerData.end);
          pointerData.distance = v2.distanceSq(
            pointerData.move,
            pointerData.prev
          );
          break;
      }

      if (event.pointerType === 'pen') {
        pointerData.pressure = event.pressure;
        v2.set(event.tiltX, event.tiltY, pointerData.tilt);
        v2.set(
          (event as any).altitudeAngle,
          (event as any).azimuthAngle,
          pointerData.angle
        );
      } else {
        pointerData.pressure = 1;
        v2.set(0, 0, pointerData.tilt);
      }

      return pointerData;
    },
    pointerData,
    {
      equals: (_, next) => next.distance === 0,
    }
  );
}
