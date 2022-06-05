import { from, Setter } from 'solid-js';

export const pointerdown = (element: HTMLElement) =>
  from((set: Setter<PointerEvent>) => {
    const handler = (event: PointerEvent) => {
      element.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      set(event);
    };

    element.addEventListener('pointerdown', handler);

    return () => {
      element.removeEventListener('pointerdown', handler);
    };
  });

export const pointermove = (element: HTMLElement) =>
  from((set: Setter<PointerEvent>) => {
    element.addEventListener('pointermove', set);

    return () => {
      element.removeEventListener('pointermove', set);
    };
  });

export const pointerup = (element: HTMLElement) =>
  from((set: Setter<PointerEvent>) => {
    const handler = (event: PointerEvent) => {
      element.releasePointerCapture(event.pointerId);
      set(event);
    };

    element.addEventListener('pointerup', handler);
    element.addEventListener('pointerleave', handler);
    element.addEventListener('pointercancel', handler);

    return () => element.removeEventListener('pointermove', set);
  });
