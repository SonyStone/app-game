import { createEventListener, preventDefault, stopPropagation } from '@solid-primitives/event-listener';
import type { Accessor } from 'solid-js';
import { createSignal } from 'solid-js';

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
  const [pressed, setPressed] = createSignal<boolean>(false, { ownedWrite: true });
  const [element, setElement] = createSignal<HTMLElement | undefined>(undefined, { ownedWrite: true });

  const downHandler = preventDefault(
    stopPropagation((event: PointerEvent) => {
      setPointerDown(event);
      setPointerMove(undefined);
      setPointerUp(undefined);
      setPressed(true);
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
    })
  );

  createEventListener(() => (pressed() ? undefined : element()), 'pointerdown', downHandler);
  createEventListener(() => (pressed() ? document : undefined), 'pointermove', moveHandler);
  createEventListener(() => (pressed() ? document : undefined), 'pointerleave', upHandler);
  createEventListener(() => (pressed() ? document : undefined), 'pointercancel', upHandler);
  createEventListener(() => (pressed() ? document : undefined), 'pointerup', upHandler);

  function bind(nextElement: HTMLElement): void {
    setElement(nextElement);
  }

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
