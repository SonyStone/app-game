import { clamp } from '@packages/math/utils/clamp';
import { createSignal, onCleanup } from 'solid-js';

export function createMouseWheelZoom(element: HTMLElement) {
  let scale = 1;
  const dollyScale = Math.pow(0.95, 1);

  const [radius, setRadius] = createSignal(0);

  const onMouseWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (event.deltaY < 0) {
      scale *= dollyScale;
    } else if (event.deltaY > 0) {
      scale /= dollyScale;
    }

    setRadius(clamp(radius() * scale, 0, 10));

    scale = 1;
  };

  element.addEventListener('wheel', onMouseWheel, {
    passive: false
  });

  onCleanup(() => {
    element.removeEventListener('wheel', onMouseWheel);
  });

  return { radius, setRadius };
}
