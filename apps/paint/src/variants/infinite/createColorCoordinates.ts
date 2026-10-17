import { createSignal } from 'solid-js';

/**
 * A color's coordinates in a model that `#rrggbb` does not determine fully, such as HSB (no hue for grays) or CMYK (no
 * inks for black). Reads `color()` through `fromHex`, which receives the coordinates shown before so it can keep
 * what the color leaves open. `show` puts edited coordinates up for the `hex` they make; they stay while `color()` is
 * that hex, so a drag through gray keeps its hue, and give way to `fromHex` when `color()` turns to another color.
 */
export function createColorCoordinates<T>(color: () => string, fromHex: (hex: string, previous?: T) => T) {
  const [shown, setShown] = createSignal<{ value: T; hex: string }>((previous) =>
    previous && previous.hex === color() ? previous : { value: fromHex(color(), previous?.value), hex: color() }
  );

  return {
    coordinates: () => shown().value,
    /** Shows `value`, which makes the color `hex`. */
    show: (value: T, hex: string) => {
      setShown({ value, hex });
    }
  };
}
