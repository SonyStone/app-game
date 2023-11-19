import * as v2 from '@webgl/math/mut-v2';
import { createSignal, onCleanup } from 'solid-js';

export function createMouseRotate(element: HTMLElement) {
  const rotateStart = v2.create();
  const rotateEnd = v2.create();
  const rotateDelta = v2.create();
  let thetaDelta = 0;
  let phiDelta = 0;

  const [theta, setTheta] = createSignal(0);
  const [phi, setPhi] = createSignal(0);

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
    } else {
      v2.set(rotateEnd, event.clientX, event.clientY);

      v2.copy(rotateDelta, rotateEnd);
      v2.subtract(rotateDelta, rotateStart);

      // rotateLeft
      {
        const angle = (Math.PI * rotateDelta[0]) / element.clientHeight;
        thetaDelta -= angle;
      }

      // rotateUp
      {
        const angle = (Math.PI * rotateDelta[1]) / element.clientHeight;
        phiDelta -= angle;
      }

      v2.copy(rotateStart, rotateEnd);
    }

    setTheta(theta() + thetaDelta);
    setPhi(phi() + phiDelta);

    thetaDelta = 0;
    phiDelta = 0;
  };

  const onPointerUp = (event: PointerEvent) => {
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
  };

  const onPointerDown = (event: PointerEvent) => {
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);

    if (event.pointerType === 'touch') {
    } else {
      v2.set(rotateStart, event.clientX, event.clientY);
    }
  };

  element.addEventListener('pointerdown', onPointerDown, {
    passive: false
  });

  onCleanup(() => {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
  });

  return {
    theta,
    setTheta,
    phi,
    setPhi
  };
}
