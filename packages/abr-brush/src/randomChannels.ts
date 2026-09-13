/** Independent Park–Miller channels for reproducible brush dynamics.
 * Captured states are installed verbatim. A seed initializes product strokes instead.
 * State snapshots are copies and may be serialized across worker boundaries.
 */
export function createBrushRandomChannels(seed = 0x152dc2e1, initial?: readonly number[]) {
  if (initial && (initial.length !== 24 || initial.some(value => !Number.isInteger(value) || value < 1 || value >= 2147483647)))
    throw new RangeError('Brush random state requires 24 integers in 1..2147483646.');
  const streams = Array.from({length: 24}, (_, index) => {
    let state = initial?.[index] ?? ((((seed ^ index) >>> 0) % 2147483646) + 1);
    const next = () => {
      const quotient = Math.trunc(state / 127773);
      state = 16807 * (state - quotient * 127773) - 2836 * quotient;
      if (state < 0) state += 2147483647;
      return state / 2147483648;
    };
    return Object.assign(next, {state: () => state, restore: (value: number) => {state = value;}});
  });
  return {
    /** Selects a channel by its stable index, from 0 through 23. */
    channel(index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= streams.length) throw new RangeError('Invalid brush random channel.');
      return streams[index]!;
    },
    /** Returns independent state values after the samples consumed so far. */
    snapshot: () => streams.map(stream => stream.state())
  };
}
