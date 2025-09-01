import { createMemo } from 'solid-js';

import { Vec2 } from '@packages/math';
import { createPointerStream } from './createPointerStream';

export function createPointerData(element: HTMLElement) {
  const pointer$ = createPointerStream(element);

  const buffer = new ArrayBuffer(Float32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS * 6);

  const pointerData = {
    start: new Vec2(new Float32Array(buffer, 0, Vec2.ELEMENTS)),
    end: new Vec2(new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS, Vec2.ELEMENTS)),
    move: new Vec2(new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS * 2, Vec2.ELEMENTS)),
    prev: new Vec2(new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS * 3, Vec2.ELEMENTS)),
    tilt: new Vec2(new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS * 4, Vec2.ELEMENTS)),
    angle: new Vec2(new Float32Array(buffer, Float32Array.BYTES_PER_ELEMENT * Vec2.ELEMENTS * 5, Vec2.ELEMENTS)),
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
          pointerData.distance = Vec2.distanceSq(pointerData.move, pointerData.prev);
          break;
        default:
          pointerData.move.set(x, y);
          pointerData.end.set(x, y);
          pointerData.distance = Vec2.distanceSq(pointerData.move, pointerData.prev);
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
