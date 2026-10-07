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
  /** Another element that counts as inside, such as the toggle of a popover rendered in a portal. */
  readonly alsoInside?: Accessor<Element | undefined>;
  readonly close: () => void;
}): void {
  const isInside = (target: Node | null) =>
    Boolean(options.container()?.contains(target) || options.alsoInside?.()?.contains(target));

  createEventListenerMap(
    window,
    {
      pointerdown: (event) => {
        if (options.open() && !isInside(event.target as Node | null)) {
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
