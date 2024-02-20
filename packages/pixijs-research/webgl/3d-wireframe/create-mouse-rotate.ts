import { FVec2 } from '@webgl/math';
import { createSignal, onCleanup } from 'solid-js';

export function createMouseRotate(element: HTMLElement) {
  const rotateStart = FVec2.create();
  const rotateEnd = FVec2.create();
  const rotateDelta = FVec2.create();
  let thetaDelta = 0;
  let phiDelta = 0;

  const [theta, setTheta] = createSignal(0);
  const [phi, setPhi] = createSignal(0);

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
    } else {
      rotateEnd.set(event.clientX, event.clientY);

      rotateDelta.copy(rotateEnd).sub(rotateStart);

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

      rotateStart.copy(rotateEnd);
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
      rotateStart.set(event.clientX, event.clientY);
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
