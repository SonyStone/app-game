import type { Sample } from './brush';

/** Interpolates optional stylus axes; rotation follows the short arc across 0/360 degrees. */
export function interpolateTabletAxes(
  a: Sample,
  b: Sample,
  t: number
): Pick<Sample, 'tiltX' | 'tiltY' | 'rotation' | 'tangentialPressure' | 'pointerType'> {
  const result: ReturnType<typeof interpolateTabletAxes> = {};
  const pointerType = b.pointerType ?? a.pointerType;
  if (pointerType !== undefined) result.pointerType = pointerType;
  for (const key of ['tiltX', 'tiltY', 'rotation', 'tangentialPressure'] as const) {
    if (a[key] === undefined && b[key] === undefined) continue;
    const start = a[key] ?? b[key] ?? 0;
    let delta = (b[key] ?? start) - start;
    if (key === 'rotation') delta = ((delta + 540) % 360) - 180;
    result[key] = start + delta * t;
  }
  return result;
}
