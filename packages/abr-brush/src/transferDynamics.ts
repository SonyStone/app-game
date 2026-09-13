/**
 * Photoshop's sampled Paintbrush flow/opacity factor before mask accumulation.
 * Base is the tool's flow for channel 7, or 1 for opacity channel 6. Device
 * control is normalized before minimum remapping; step counts spacing events.
 * Random returns a Park-Miller state divided by 2^31 and advances only when
 * the evaluated value and jitter are positive.
 */
export function transferValue(
  base: number,
  control: number,
  fade: number,
  minimum: number,
  jitter: number,
  deviceValue: number,
  step: number,
  random: () => number
): number {
  const maximum = Math.fround(base);
  const floor = Math.fround(maximum * Math.fround(Math.fround(minimum) * Math.fround(0.01)));
  let value = maximum;
  if (control === 1) {
    value = step >= fade
      ? floor
      : Math.fround(maximum + Math.fround(step / fade) * Math.fround(floor - maximum));
  } else if (control === 2 || control === 3 || control === 4 || control === 8) {
    value = Math.fround(floor + Math.fround(deviceValue) * Math.fround(maximum - floor));
  }
  if (jitter <= 0 || value <= 0) return value;
  const amplitude = Math.fround(Math.fround(Math.fround(jitter) * Math.fround(0.01)) * value);
  const centered = Math.fround(Math.fround(random()) - 0.5);
  const delta = Math.fround(Math.fround(amplitude + amplitude) * centered);
  value = Math.fround(value + delta);
  if (value < 0) value = -value;
  else if (value > 1) value = Math.fround(1 - Math.fround(value - 1));
  return Math.max(0, Math.min(1, value));
}
