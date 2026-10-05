import { createEventListener } from '@solid-primitives/event-listener';

/**
 * Keeps the browser's context menu closed across the whole document while the owner lives: in a painting app the
 * right button and a pen's barrel button belong to the navigation puck, and a stray menu over the canvas or a panel
 * interrupts drawing. Text fields keep theirs, for paste. Covers dialogs and other content outside the app's root.
 * Must be created within a Solid owner.
 */
export function createContextMenuBlock() {
  createEventListener(
    document,
    'contextmenu',
    (event) => {
      if (!editable(event.target)) {
        event.preventDefault();
      }
    },
    { capture: true }
  );
}

function editable(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
  );
}
