import { createSignal } from 'solid-js';
import type { ViewDrag } from './createViewDrag';
import type { Point } from './layout';
import { slotToward, type Slot, type SlotId } from './slots';

/**
 * The press that opened the cluster, while it stays down, as a marking-menu flick: moving it away from where it
 * started points at the QuickMenu button in that direction (`highlighted`), releasing runs that button, and pointing
 * at Pan, Zoom or Rotate far enough starts that view drag, which follows the press until it lifts. Used for the right
 * button (a pen's barrel button) through the navigation puck's picker, and for a finger's long press. Must be created
 * within a Solid owner.
 */
export function createFlick(options: {
  view: ViewDrag;
  /** The QuickMenu's center in client pixels, the pivot of zoom and rotate. */
  pivot: () => Point | undefined;
  /** Runs an instant button: undo, redo or the eyedropper. */
  run: (slot: SlotId) => void;
}) {
  const [highlighted, setHighlighted] = createSignal<SlotId>();
  let flick: { origin: Point; slot?: Slot; navigating: boolean } | undefined;

  return {
    /** The button the press points at. */
    highlighted,
    /** A press opened the cluster at `origin`. */
    start(origin: Point) {
      flick = { origin, navigating: false };
      setHighlighted(undefined);
    },
    /** Whether a flick is in progress. */
    active: () => flick !== undefined,
    /** The press moved; Shift snaps rotation. */
    move(at: Point, shift = false) {
      if (!flick) {
        return;
      }

      if (flick.navigating) {
        options.view.move(at, shift);
        return;
      }

      const dx = at.x - flick.origin.x;
      const dy = at.y - flick.origin.y;
      const distance = Math.hypot(dx, dy);
      const slot = distance >= deadZone ? slotToward(dx, dy) : undefined;
      flick.slot = slot;
      if (slot?.nav && distance >= reach) {
        flick.navigating = true;
        setHighlighted(undefined);
        options.view.start(slot.nav, at, options.pivot() ?? flick.origin);
        return;
      }

      setHighlighted(slot?.id);
    },
    /**
     * The press lifted, or was cancelled. A lift runs the button pointed at; returns what the flick did: `navigated`
     * after a view drag, `ran` with the button it ran, or nothing.
     */
    end(cancelled: boolean): { navigated: true } | { ran: SlotId } | undefined {
      const ended = flick;
      flick = undefined;
      setHighlighted(undefined);
      if (!ended) {
        return undefined;
      }

      if (ended.navigating) {
        options.view.end();
        return cancelled ? undefined : { navigated: true };
      }

      if (cancelled || !ended.slot || ended.slot.nav) {
        return undefined;
      }

      options.run(ended.slot.id);
      return { ran: ended.slot.id };
    }
  };
}

/** The flick of the opening press; see `createFlick`. */
export type Flick = ReturnType<typeof createFlick>;

/** How far the press must move before it points at a button, and before Pan, Zoom or Rotate take over. */
const deadZone = 22;
const reach = 62;
