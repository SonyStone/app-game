import { Accessor, createSignal, onCleanup } from 'solid-js';

export function createPointerStream(
  elemenet: HTMLElement
): Accessor<PointerEvent | undefined> {
  const [pointer, setPointer] = createSignal<PointerEvent>();

  elemenet.addEventListener('pointerdown', onDown);

  function onDown(event: PointerEvent) {
    setPointer(event);
    elemenet.addEventListener('pointermove', onMove);

    elemenet.addEventListener('pointerup', onUp);
    elemenet.addEventListener('pointercancel', onUp);
    elemenet.addEventListener('pointerleave', onUp);
    elemenet.addEventListener('pointerout', onUp);
  }

  function onMove(event: PointerEvent) {
    setPointer(event);
  }

  function onUp(event: PointerEvent) {
    setPointer(event);
    elemenet.removeEventListener('pointermove', onMove);
    elemenet.removeEventListener('pointerup', onUp);
    elemenet.removeEventListener('pointercancel', onUp);
    elemenet.removeEventListener('pointerleave', onUp);
    elemenet.removeEventListener('pointerout', onUp);

    elemenet.addEventListener('pointerdown', onDown);
  }

  onCleanup(() => {
    elemenet.removeEventListener('pointerdown', onDown);
    elemenet.removeEventListener('pointermove', onMove);
    elemenet.removeEventListener('pointerup', onUp);
    elemenet.removeEventListener('pointercancel', onUp);
    elemenet.removeEventListener('pointerleave', onUp);
    elemenet.removeEventListener('pointerout', onUp);
  });

  return pointer;
}
