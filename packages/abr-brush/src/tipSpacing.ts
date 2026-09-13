/** Sampled-tip advance before the stroke driver's minimum-distance clamp.
 * Uses source dimensions before rotation/roundness and the unfloored placement scale.
 * Dimensions must be positive integers; scale must be finite and nonnegative.
 * A disabled percentage returns zero unless forced, which uses its magnitude.
 */
export function sampledTipSpacing(
  scale: number,
  source: { width: number; height: number },
  percent: number,
  forced = false
): number {
  if (percent < 1 && !forced) return 0;
  const diameter = Math.max(1, Math.min(2147483647, Math.floor(Math.min(source.width, source.height) * scale + 0.5)));
  return diameter * (Math.abs(percent) * 0.01);
}

/** Computed-tip advance from nominal size and stored integer roundness.
 * Dynamic scale applies after rounding the minor diameter, independently of raster bounds.
 * Roundness must be an integer in 1..100; scale must be finite and nonnegative.
 * A disabled percentage returns zero unless forced, which uses its magnitude.
 */
export function computedTipSpacing(
  size: number,
  roundness: number,
  scale: number,
  percent: number,
  forced = false
): number {
  if (percent <= 0 && !forced) return 0;
  const nominal = Math.max(1, Math.min(5000, Math.floor(size + 0.5)));
  const diameter = Math.max(1, Math.trunc((nominal * roundness + 50) / 100));
  return Math.max(diameter * scale, 0.25) * (Math.abs(percent) * 0.01);
}
