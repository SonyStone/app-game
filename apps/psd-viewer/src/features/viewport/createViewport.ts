import { createEventListener } from '@solid-primitives/event-listener';
import { createElementSize } from '@solid-primitives/resize-observer';
import { createMemo, createSignal, type Accessor } from 'solid-js';
import { fitView, panView, zoomView, type View } from './view';

/**
 * Owns zoom and pan of an image inside a viewport element. The view starts fitted and follows the viewport's size until
 * the user zooms or pans; `reset` is read as the reset key and returns to the fitted view, for example for a new
 * document. Attach `setElement` as the viewport's ref and spread `surface` on it: the wheel zooms about the pointer,
 * dragging pans. `transform` is the CSS transform for the image layer, its origin at the top left.
 */
export function createViewport(
  imageSize: Accessor<{ width: number; height: number } | undefined>,
  reset: Accessor<unknown>
) {
  const [element, setElement] = createSignal<HTMLElement>();
  const size = createElementSize(element);
  const [manual, setManual] = createSignal<View | undefined>(() => {
    reset();
    return undefined;
  });
  const fitted = createMemo<View>(() => {
    const image = imageSize();
    return image ? fitView({ width: size.width ?? 0, height: size.height ?? 0 }, image) : { scale: 1, x: 0, y: 0 };
  });
  const view = () => manual() ?? fitted();
  const percent = createMemo(() => Math.round(view().scale * 1000) / 10);
  const isFitted = () => manual() === undefined;

  const zoomAt = (factor: number, point: { x: number; y: number }) => setManual(zoomView(view(), factor, point));
  const center = () => ({ x: (size.width ?? 0) / 2, y: (size.height ?? 0) / 2 });
  const zoomIn = () => zoomAt(zoomStep, center());
  const zoomOut = () => zoomAt(1 / zoomStep, center());
  const fit = () => setManual(undefined);

  /** Shows the image at 100%, centered. */
  function actualSize() {
    const image = imageSize();
    if (!image) {
      return;
    }

    setManual({
      scale: 1,
      x: Math.round(((size.width ?? 0) - image.width) / 2),
      y: Math.round(((size.height ?? 0) - image.height) / 2)
    });
  }

  createEventListener<{ wheel: WheelEvent }>(
    element,
    'wheel',
    (event) => {
      event.preventDefault();
      const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
      // Pinch gestures arrive as wheel events with the control key and small deltas.
      const speed = event.ctrlKey ? 0.01 : 0.0015;
      zoomAt(Math.exp(-event.deltaY * speed), { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    },
    { passive: false }
  );

  let drag: { x: number; y: number } | undefined;
  const surface = {
    onPointerDown(event: PointerEvent & { currentTarget: HTMLElement }) {
      if (event.button !== 0) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      drag = { x: event.clientX, y: event.clientY };
    },
    onPointerMove(event: PointerEvent) {
      if (!drag) {
        return;
      }

      const delta = { x: event.clientX - drag.x, y: event.clientY - drag.y };
      drag = { x: event.clientX, y: event.clientY };
      setManual(panView(view(), delta));
    },
    onPointerUp() {
      drag = undefined;
    },
    onPointerCancel() {
      drag = undefined;
    }
  };

  const transform = () => {
    const { scale, x, y } = view();
    return `translate(${x}px, ${y}px) scale(${scale})`;
  };

  return { setElement, surface, transform, view, percent, isFitted, zoomIn, zoomOut, fit, actualSize };
}

/** The factor of one zoom button press. */
const zoomStep = 1.25;
