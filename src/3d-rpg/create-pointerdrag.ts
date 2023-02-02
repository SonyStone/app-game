import { createEmitter } from "@solid-primitives/event-bus";
import {
  makeEventListenerStack,
  preventDefault,
  stopPropagation,
} from "@solid-primitives/event-listener";
import { Accessor, createSignal } from "solid-js";

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

  return Object.defineProperties(
    (element: Element) => {
      const [listenElement, clearElement] =
        makeEventListenerStack<Record<string, PointerEvent>>(element);

      const [listenDocument, clearDocument] = makeEventListenerStack(document);

      const downHandler = preventDefault(
        stopPropagation((event: PointerEvent) => {
          setPointerDown(event);
          setPointerMove(undefined);
          setPointerUp(undefined);
          setPressed(true);

          clearElement();
          listenDocument("pointermove", moveHandler);
          listenDocument("pointerleave", upHandler);
          listenDocument("pointercancel", upHandler);
          listenDocument("pointerup", upHandler);
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

          clearDocument();
          listenElement("pointerdown", downHandler);
        })
      );

      listenElement("pointerdown", downHandler);
    },
    {
      down: {
        enumerable: true,
        value: pointerDown,
      },
      move: {
        enumerable: true,
        value: pointerMove,
      },
      up: {
        enumerable: true,
        value: pointerUp,
      },
      pressed: {
        enumerable: true,
        value: pressed,
      },
    }
  ) as any as Pointerdrag;
}
