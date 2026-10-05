import type { Point } from '@app-game/paint-core/camera';
import type { PuckPicker } from '@app-game/navigation-puck/input';
import { createSignal, untrack, type Accessor } from 'solid-js';
import type { SketchIconName } from '../../shared/ui/SketchIcon';

/**
 * A ring of actions around the navigation puck, chosen by pressing them or, as in a marking menu, by pressing the
 * pen's barrel button (or the right mouse button), dragging past the puck towards an action and releasing. `picker`
 * connects the drag to the puck's input binding; `highlighted` is the action the drag points at. Must be created
 * within a Solid owner.
 */
export function createRadialMenu(options: {
  /** Center of the open puck, in client CSS pixels; the menu is shown only while it is defined. */
  center: Accessor<Point | undefined>;
  /** The actions; read when a drag moves and when one is chosen. */
  items: Accessor<readonly RadialItem[]>;
  /** Closes the puck and the menu with it. */
  close: () => void;
}) {
  const [highlighted, setHighlighted] = createSignal<string>();

  const picker: PuckPicker = {
    move: (point) => setHighlighted(itemAt(point)?.id),
    release(point) {
      setHighlighted(undefined);
      const item = itemAt(point);
      item?.run();
      return !!item;
    },
    cancel: () => setHighlighted(undefined)
  };

  return {
    /** Id of the action a barrel-button drag points at. */
    highlighted,
    picker,
    /** Runs the enabled action `id`, then closes the menu. */
    choose(id: string) {
      const item = untrack(options.items).find((candidate) => candidate.id === id && !candidate.disabled);
      if (!item) {
        return;
      }

      options.close();
      item.run();
    }
  };

  /** The enabled action in the slot that `point` points at from beyond the puck, if any. */
  function itemAt(point: Point) {
    const center = untrack(options.center);
    if (!center) {
      return undefined;
    }

    const dx = point.x - center.x,
      dy = point.y - center.y;
    if (Math.hypot(dx, dy) < radialLayout.puck / 2 + deadZone) {
      return undefined;
    }

    const slot = slotAt(Math.atan2(dx, -dy));
    return untrack(options.items).find((item) => item.slot === slot && !item.disabled);
  }
}

/** One action of the ring. */
export type RadialItem = {
  id: string;
  /** Accessible name and tooltip. */
  label: string;
  /** Clock position: 0 at the top, then clockwise, up to `radialLayout.slots - 1`. */
  slot: number;
  /** The icon shown, or `text` instead, such as a brush preset's initials. */
  icon?: SketchIconName;
  text?: string;
  run: () => void;
  disabled?: boolean;
  /** Shown as current, like the active tool. */
  active?: boolean;
};

/**
 * The ring's geometry in CSS pixels: a puck of `puck` diameter, `slots` positions on a circle of `radius`, buttons of
 * `item` diameter, and the `reach` from the center that has to fit in the view.
 */
export const radialLayout = { puck: 120, radius: 102, item: 44, slots: 12, reach: 128 } as const;

/** The slot nearest to a clockwise angle from the top, in radians. */
export function slotAt(angle: number) {
  const step = (Math.PI * 2) / radialLayout.slots;
  return (((Math.round(angle / step) % radialLayout.slots) + radialLayout.slots) % radialLayout.slots);
}

/** Drags must leave the puck by this many CSS pixels before they point at an action. */
const deadZone = 8;
