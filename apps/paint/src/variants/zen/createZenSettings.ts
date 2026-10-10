import type { Brush } from '@app-game/paint-core/brush';
import { createImmediateSignal } from '../../shared/createImmediateSignal';
import { defaultPlacement, mirrorPlacement, type Placement } from './placement';
import { defaultSlots, type ToolShape, type ToolSlot } from './tools';

/**
 * The Zen variant's own choices on this device, kept in `localStorage`: the drawing hand, where the pebble rests, the
 * fan's five brushes and which of them is in use. Storage failures keep the choices until the page closes.
 */
export function createZenSettings() {
  // Commands build on the last write, so several in one event compose.
  const [state, setState, latest] = createImmediateSignal<ZenState>(read());
  const write = (next: ZenState) => {
    setState(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // The choice still applies until the page closes.
    }
  };

  return {
    /** The hand holding the pen; the pebble starts on the other side. Left by default. */
    hand: () => state().hand,
    /** Changes the drawing hand, moving the pebble to the mirrored place. */
    setHand(hand: Hand) {
      const current = latest();
      if (hand !== current.hand) {
        write({ ...current, hand, placement: mirrorPlacement(current.placement) });
      }
    },
    /** Where the pebble rests. */
    placement: () => state().placement,
    setPlacement(placement: Placement) {
      write({ ...latest(), placement });
    },
    /** The fan's brushes, in fan order. */
    slots: () => state().slots,
    /** The slot painting now, while the brush tool uses its preset; see `setActive`. */
    active: () => state().active,
    setActive(active: number | undefined) {
      write({ ...latest(), active });
    },
    /** Merges `settings` into slot `index`, such as a size changed on the pebble. */
    updateSlot(index: number, patch: Partial<ToolSlot>) {
      const current = latest();
      const slots = current.slots.map((slot, at) =>
        at === index ? { ...slot, ...patch, settings: { ...slot.settings, ...patch.settings } } : slot
      );
      write({ ...current, slots });
    },
    /** Puts `preset` in slot `index` with only `settings` over it, or the slot's default brush back. */
    replaceSlot(index: number, slot: ToolSlot | 'default') {
      const current = latest();
      const next = slot === 'default' ? defaultSlots[index] : slot;
      if (!next) {
        return;
      }

      write({ ...current, slots: current.slots.map((existing, at) => (at === index ? next : existing)) });
    }
  };
}

/** The hand holding the pen. */
export type Hand = 'left' | 'right';

type ZenState = { hand: Hand; placement: Placement; slots: ToolSlot[]; active?: number };

const storageKey = 'paint.zen';

/** The stored state, with defaults for anything missing or malformed. */
function read(): ZenState {
  const stored = parse();
  const hand: Hand = stored.hand === 'right' ? 'right' : 'left';
  const placement = isPlacement(stored.placement) ? stored.placement : defaultPlacement(hand);
  const slots = defaultSlots.map((fallback, index) => {
    const slot = Array.isArray(stored.slots) ? (stored.slots[index] as Partial<ToolSlot> | undefined) : undefined;
    return slot && typeof slot.preset === 'string' && isShape(slot.shape) && isRecord(slot.settings)
      ? {
          shape: slot.shape,
          preset: slot.preset,
          settings: slot.settings as Partial<Brush>,
          chosen: slot.chosen === true
        }
      : fallback;
  });
  const active =
    typeof stored.active === 'number' && stored.active >= 0 && stored.active < slots.length ? stored.active : undefined;
  return { hand, placement, slots, active };
}

function parse(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlacement(value: unknown): value is Placement {
  return (
    isRecord(value) &&
    (value.edge === 'top' || value.edge === 'right' || value.edge === 'bottom' || value.edge === 'left') &&
    typeof value.t === 'number' &&
    value.t >= 0 &&
    value.t <= 1
  );
}

function isShape(value: unknown): value is ToolShape {
  return value === 'pencil' || value === 'pen' || value === 'marker' || value === 'brush' || value === 'airbrush';
}
