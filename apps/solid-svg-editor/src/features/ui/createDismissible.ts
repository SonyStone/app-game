import { createEventListenerMap } from '@solid-primitives/event-listener';
import type { Accessor } from 'solid-js';

/**
 * Closes a popover while it is open: on a pointer press outside `container` or on Escape.
 *
 * `container` should hold both the popover and the button that toggles it, so pressing the button toggles instead of
 * closing and immediately reopening.
 */
export function createDismissible(options: {
  readonly open: Accessor<boolean>;
  readonly container: Accessor<Element | undefined>;
  readonly close: () => void;
}): void {
  createEventListenerMap(
    window,
    {
      pointerdown: (event) => {
        if (options.open() && !options.container()?.contains(event.target as Node | null)) {
          options.close();
        }
      },
      keydown: (event) => {
        if (options.open() && event.key === 'Escape') {
          event.preventDefault();
          options.close();
        }
      }
    },
    { capture: true }
  );
}
