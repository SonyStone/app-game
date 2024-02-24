import { createEventListener } from "@solid-primitives/event-listener";
import { ReactiveSet } from "@solid-primitives/set";
import { Key } from "ts-keycode-enum";

export function captureKeyboard(element: Window) {
  const pressed = new ReactiveSet<Key>();

  createEventListener(
    element,
    "keydown",
    (event) => {
      pressed.add(event.keyCode);
    },
    { capture: false }
  );

  createEventListener(
    element,
    "keyup",
    (event) => {
      pressed.delete(event.keyCode);
    },
    { capture: false }
  );

  return pressed;
}
