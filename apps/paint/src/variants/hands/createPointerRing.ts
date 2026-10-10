import type { PuckPicker } from '@app-game/navigation-puck';
import { editable } from '@app-game/paint-core/input';
import { makeEventListener } from '@solid-primitives/event-listener';
import { createMemo, createSignal } from 'solid-js';
import type { PaintSession } from '../../features/session';
import type { PenMode, PenModes } from './createPenModes';
import { ringItemAt, ringLayout } from './geometry';

/**
 * The ring of pen modes for the mouse, the keyboard and a pen's buttons: the same ring the free hand opens, at the
 * pointer, wherever the session's navigation puck would open (the right button, Space held, V, a pen's side button);
 * the puck itself is not shown. A right-drag onto a mode and release latches it, as in a marking menu; releasing
 * elsewhere leaves the ring open for a click. While Space holds the ring open, releasing Space over a mode latches
 * it. A press anywhere else closes the ring; on the canvas it does nothing more. `I` latches the eyedropper.
 *
 * Listens on the window in the capture phase, ahead of the navigation puck: create it before the canvas mounts,
 * within a Solid owner.
 */
export function createPointerRing(session: PaintSession, modes: PenModes) {
  const { navigation } = session.camera;
  const [hovered, setHovered] = createSignal<PenMode>();
  const layout = createMemo(() => {
    const center = navigation.center();
    const bounds = session.stage()?.getBoundingClientRect();
    return center && bounds && ringLayout(center, modes.offered(), bounds);
  });

  listen();

  return {
    layout,
    /** The mode the pointer is over, or the right-drag points at. */
    hovered,
    setHovered,
    /** Latches `mode` and closes the ring, giving the keyboard back to the canvas. */
    choose,
    close,
    /** Right-drags from the opening press point at a mode; the release chooses it. */
    picker: {
      move(point) {
        const current = layout();
        setHovered(current && ringItemAt(current, point));
      },
      release(point) {
        const current = layout();
        const mode = current && ringItemAt(current, point);
        if (!mode) {
          return false;
        }

        // The puck closes the ring itself when this returns true.
        modes.latch(mode);
        setHovered(undefined);
        return true;
      },
      cancel() {
        setHovered(undefined);
      }
    } satisfies PuckPicker
  };

  function choose(mode: PenMode) {
    modes.latch(mode);
    close();
  }

  function close() {
    setHovered(undefined);
    navigation.close();
    session.canvas()?.focus({ preventScroll: true });
  }

  function listen() {
    const capture = { capture: true };
    makeEventListener(
      window,
      'pointerdown',
      (event) => {
        if (!navigation.center() || event.button === 2 || insideUi(event)) {
          return;
        }

        close();
        // A pen or mouse press that closes the ring does not draw; a finger pans at once.
        if (event.pointerType !== 'touch' && event.target === session.canvas()) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      capture
    );
    makeEventListener(
      window,
      'keyup',
      (event) => {
        const mode = hovered();
        if (event.code === 'Space' && navigation.held() && mode) {
          modes.latch(mode);
          setHovered(undefined);
        }
      },
      capture
    );
    makeEventListener(window, 'keydown', (event) => {
      if (
        event.key.toLowerCase() === 'i' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.repeat &&
        !editable(event.target) &&
        !(event.target instanceof Element && event.target.closest('dialog[open]'))
      ) {
        modes.latch('eyedropper');
      }
    });
  }
}

/** The pointer's ring; see `createPointerRing`. */
export type PointerRing = ReturnType<typeof createPointerRing>;

/** Elements of this variant's interface take their own presses. */
function insideUi(event: Event) {
  return event.target instanceof Element && !!event.target.closest('[data-hands-ui]');
}
