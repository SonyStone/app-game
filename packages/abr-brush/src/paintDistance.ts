/** Integrates distance in pressure-scaled diameters. The caller owns the fractional
 * interval so a disposable preview can restore it with the other stroke state.
 */
export function createPaintDistance(size: number, spacing: number, pressureSize: boolean, minimumAdvance?: number) {
  const widened =
    minimumAdvance && Number.isFinite(minimumAdvance) && minimumAdvance > 0
      ? Math.max(spacing, Math.min(0.25, minimumAdvance / size))
      : spacing;
  const base = size * widened;
  const floor = Math.max(0.05, 0.5 * widened, base * 0.04);
  const step = (pressure: number) => (pressureSize ? Math.max(floor, base * pressure) : Math.max(0.05, base));
  return {
    ratio: widened / spacing,
    step,
    segment(length: number, start: number, end: number, remaining: number, emit: (t: number) => boolean) {
      if (!length) {
        return remaining;
      }

      const delta = end - start;
      const crossing = (floor / base - start) / delta;
      let from = 0;
      let to = pressureSize && crossing > 0 && crossing < 1 ? crossing : 1;
      while (from < 1) {
        const span = length * (to - from);
        const first = step(start + delta * from);
        const change = step(start + delta * to) - first;
        const slope = change / span;
        const intervals = slope === 0 ? span / first : Math.log1p(change / first) / slope;
        while (remaining <= intervals + 1e-10) {
          const offset = slope === 0 ? remaining * first : (first * Math.expm1(slope * remaining)) / slope;
          if (!emit(from + Math.min(span, offset) / length)) {
            return 1;
          }
          remaining++;
        }
        remaining -= intervals;
        from = to;
        to = 1;
      }
      return remaining;
    }
  };
}
