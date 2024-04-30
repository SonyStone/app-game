import { Vec3 } from '@packages/ogl';

/**
 * Normalize the mouse coordinates to the range [-1, 1]
 */
export function mouseNormalize(event: PointerEvent | MouseEvent, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const y = ((event.clientY - rect.top) / rect.height) * -2 + 1;

  let mouseNormalized = new Vec3(x, y, 0.5);

  return mouseNormalized;
}
