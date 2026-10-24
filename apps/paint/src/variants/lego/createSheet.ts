import { createSignal } from 'solid-js';

/**
 * How far the box of parts is pulled up from the bottom edge while editing, like a bottom sheet: a wheel or a drag
 * moves its edge freely, and once the motion ends it settles on a stop: closed, the middle, where the drawing beside
 * it shrinks to a card the most, or full, nearly the whole view. While something is carried off it, the sheet sinks to
 * a strip along the bottom that puts things away (see `BoardView`), and rises again to where it was.
 *
 * `viewHeight` gives the height of the view the sheet rises in, in CSS pixels.
 */
export function createSheet(viewHeight: () => number) {
  /** How far the sheet is up, in CSS pixels above the bottom edge; 0 is closed. */
  const [height, setHeight] = createSignal(0);
  /** Whether the sheet moves to a stop by itself, animated, rather than following a wheel or a finger. */
  const [settling, setSettling] = createSignal(false);
  const [sunk, setSunk] = createSignal(false);
  const stops = () => sheetStops(viewHeight());

  return {
    height,
    settling,
    /** Whether the sheet is sunk to its put-away strip while something is carried. */
    sunk,
    /** Sinks the sheet to its strip, or raises it back to where it was, animated. */
    setSunk(next: boolean) {
      setSettling(true);
      setSunk(next);
    },
    /** The middle stop, where the card beside the sheet is smallest. */
    middle: () => stops()[1],
    /** Moves the sheet's edge to `next` CSS pixels up, as a wheel or a finger drags it, within its stops. */
    follow(next: number) {
      const all = stops();
      setSettling(false);
      setHeight(Math.max(0, Math.min(all[all.length - 1]!, next)));
    },
    /**
     * Ends a wheel or a drag: settles on the next stop up for `direction` 1, the next one down for -1, and the nearest
     * one for 0.
     */
    settle(direction: -1 | 0 | 1) {
      setSettling(true);
      setHeight(settledHeight(height(), stops(), direction));
    },
    /** Moves the sheet to stop `stop`, animated. */
    to(stop: 'closed' | 'middle' | 'full') {
      const all = stops();
      setSettling(true);
      setHeight(stop === 'closed' ? all[0]! : stop === 'middle' ? all[1]! : all[2]!);
    },
    /** Moves the sheet one stop down, if it is open; returns whether it was. */
    back() {
      if (height() <= 0) {
        return false;
      }

      setSettling(true);
      setHeight(settledHeight(height() - 1, stops(), -1));
      return true;
    }
  };
}

/** The heights the sheet rests at in a view `viewHeight` tall: closed, the middle and full. */
export function sheetStops(viewHeight: number) {
  const full = Math.max(0, viewHeight - fullGap);
  return [0, Math.min(full, Math.max(middleLeast, Math.round(viewHeight * 0.45))), full] as const;
}

/**
 * The stop a sheet `height` up settles on among `stops`: the first one at or above it heading up (`direction` 1), the
 * last one at or below it heading down (-1), or the nearest.
 */
export function settledHeight(height: number, stops: readonly number[], direction: -1 | 0 | 1) {
  if (direction > 0) {
    return stops.find((stop) => stop >= height - slack) ?? stops[stops.length - 1]!;
  }

  if (direction < 0) {
    return [...stops].reverse().find((stop) => stop <= height + slack) ?? stops[0]!;
  }

  return stops.reduce((best, stop) => (Math.abs(stop - height) < Math.abs(best - height) ? stop : best));
}

/** CSS pixels of the view left above the full sheet, for the edit button. */
const fullGap = 64;

/** The least height of the middle stop, enough for the workbench and a row of parts. */
const middleLeast = 300;

/** CSS pixels a sheet may be past a stop and still count as resting on it. */
const slack = 4;
