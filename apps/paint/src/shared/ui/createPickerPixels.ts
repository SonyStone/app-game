import { createEventListener } from '@solid-primitives/event-listener';
import { createResizeObserver } from '@solid-primitives/resize-observer';
import { createContext, createEffect, createMemo, createSignal, onSettled, useContext, type Accessor } from 'solid-js';

/** Uniform CSS transform applied by a fitted picker host. ResizeObserver reports sizes before this transform. */
export const PickerScale = createContext<Accessor<number>>(() => 1);

/**
 * Observes a square picker's displayed width and density. `maxPixels` caps device pixels, uncapped by default.
 * Zero-sized or unmounted canvases do no bitmap work.
 */
export function createPickerPixels(canvas: Accessor<HTMLCanvasElement | undefined>, maxPixels = Infinity) {
  const scale = useContext(PickerScale);
  const [target, setTarget] = createSignal<HTMLCanvasElement>();
  const [width, setWidth] = createSignal(0);
  const [dpr, setDpr] = createSignal(globalThis.devicePixelRatio || 1);
  const density = () => {
    setDpr(globalThis.devicePixelRatio || 1);
  };
  createEventListener(() => window, 'resize', density);
  createResizeObserver(target, (rect) => {
    setWidth(rect.width);
  });
  onSettled(() => {
    const element = canvas();
    if (!element) {
      return;
    }

    setTarget(element);
    const cssWidth = getComputedStyle(element).width;
    setWidth(cssWidth.endsWith('px') ? Number.parseFloat(cssWidth) : element.clientWidth);
  });
  createEffect(dpr, (ratio) => {
    if (!window.matchMedia) {
      return;
    }

    const query = window.matchMedia(`(resolution: ${ratio}dppx)`);
    query.addEventListener('change', density);
    return () => {
      query.removeEventListener('change', density);
    };
  });

  return createMemo(() => Math.min(maxPixels, Math.max(0, Math.round(width() * scale() * dpr()))));
}
