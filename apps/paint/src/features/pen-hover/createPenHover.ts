import { createEventListener } from '@solid-primitives/event-listener';
import { createImmediateSignal } from '../../shared/createImmediateSignal';

/**
 * Whether the browser reports the pen hovering, as it was last seen to. Some tablets have no pen hover at all, and
 * Chrome on Android stops reporting it in a tab once another window covered it (the file chooser, an installed app,
 * the app opening the tab) until a new tab is opened; the pen then shows up only on touching down.
 *
 * `hovers` is `undefined` until the pen first touches down, `false` once it touches down without having hovered
 * since its last lift, and `true` as soon as it hovers again. It is readable at once, also in the same event, so that
 * window listeners created after this one can act on the press that found it out. Listens on the window in the
 * capture phase without stopping anything. Must be created within a Solid owner.
 */
export function createPenHover() {
  const [, setHovers, hovers] = createImmediateSignal<boolean | undefined>(undefined);
  /** The pen hovered since it last lifted, or since this started. */
  let hovered = false;
  const options = { capture: true, passive: true };

  createEventListener(
    window,
    ['pointerover', 'pointermove'],
    (event) => {
      if (event.pointerType === 'pen' && event.buttons === 0) {
        hovered = true;
        if (hovers() !== true) {
          setHovers(true);
        }
      }
    },
    options
  );
  createEventListener(
    window,
    'pointerdown',
    (event) => {
      if (event.pointerType === 'pen' && hovers() !== hovered) {
        setHovers(hovered);
      }
    },
    options
  );
  createEventListener(
    window,
    ['pointerup', 'pointercancel'],
    (event) => {
      if (event.pointerType === 'pen') {
        hovered = false;
      }
    },
    options
  );

  return {
    /** Whether the pen hovers: `undefined` while unknown; see {@link createPenHover}. */
    hovers
  };
}
