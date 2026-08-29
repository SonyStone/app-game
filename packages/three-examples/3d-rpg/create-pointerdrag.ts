import { preventDefault, stopPropagation } from '@solid-primitives/event-listener';
import type { Accessor } from 'solid-js';
import { createSignal, onCleanup } from 'solid-js';

interface Pointerdrag {
  (element: HTMLElement): void;
  get down(): Accessor<PointerEvent | undefined>;
  get move(): Accessor<PointerEvent | undefined>;
  get up(): Accessor<PointerEvent | undefined>;
  get pressed(): Accessor<boolean>;
}

export function createPointerdrag() {
  const [pointerDown, setPointerDown] = createSignal<PointerEvent>();
  const [pointerMove, setPointerMove] = createSignal<PointerEvent>();
  const [pointerUp, setPointerUp] = createSignal<PointerEvent>();
  const [pressed, setPressed] = createSignal<boolean>(false);
  let currentElement: Element | undefined;

  const downHandler = preventDefault(
    stopPropagation((event: PointerEvent) => {
      setPointerDown(event);
      setPointerMove(undefined);
      setPointerUp(undefined);
      setPressed(true);

      currentElement?.removeEventListener('pointerdown', downHandler as EventListener);
      document.addEventListener('pointermove', moveHandler as EventListener);
      document.addEventListener('pointerleave', upHandler as EventListener);
      document.addEventListener('pointercancel', upHandler as EventListener);
      document.addEventListener('pointerup', upHandler as EventListener);
    })
  );

  const moveHandler = preventDefault(
    stopPropagation((event: PointerEvent) => {
      setPointerMove(event);
      setPointerUp(undefined);
      setPressed(true);
    })
  );

  const upHandler = preventDefault(
    stopPropagation((event: PointerEvent) => {
      setPointerDown(undefined);
      setPointerMove(undefined);
      setPointerUp(event);
      setPressed(false);

      clearDocumentListeners();
      currentElement?.addEventListener('pointerdown', downHandler as EventListener);
    })
  );

  function clearDocumentListeners(): void {
    document.removeEventListener('pointermove', moveHandler as EventListener);
    document.removeEventListener('pointerleave', upHandler as EventListener);
    document.removeEventListener('pointercancel', upHandler as EventListener);
    document.removeEventListener('pointerup', upHandler as EventListener);
  }

  function bind(element: Element): void {
    currentElement?.removeEventListener('pointerdown', downHandler as EventListener);
    currentElement = element;
    currentElement.addEventListener('pointerdown', downHandler as EventListener);
  }

  onCleanup(() => {
    currentElement?.removeEventListener('pointerdown', downHandler as EventListener);
    clearDocumentListeners();
  });

  return Object.defineProperties(bind, {
    down: {
      enumerable: true,
      value: pointerDown
    },
    move: {
      enumerable: true,
      value: pointerMove
    },
    up: {
      enumerable: true,
      value: pointerUp
    },
    pressed: {
      enumerable: true,
      value: pressed
    }
  }) as any as Pointerdrag;
}
