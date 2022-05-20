import { Accessor, createEffect, createSignal, onCleanup } from 'solid-js';

export function createEvent<K extends keyof HTMLElementEventMap>(
  elemenet: HTMLElement,
  type: K
): Accessor<HTMLElementEventMap[K] | undefined> {
  const [pointer, setPointer] = createSignal<HTMLElementEventMap[K]>();

  createEffect(() => {
    elemenet.addEventListener(type, setPointer as any);
  });

  onCleanup(() => {
    elemenet.removeEventListener(type, setPointer as any);
  });

  return pointer;
}
