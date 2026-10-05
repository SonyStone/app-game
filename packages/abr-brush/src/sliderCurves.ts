/**
 * Photoshop's brush sliders move along straight segments between breakpoints rather than linearly, so small values
 * get most of the track. Recovered from Photoshop 2025 (26.0.0) in `photoshop-analysis`
 * (`evidence/2026-10-05-brush-sliders/REPORT.md`) and checked against its instructions. Positions run from 0 to 1.
 */

/** A slider curve: positions from 0 to 1 and their values, in order. */
export type SliderCurve = readonly (readonly [position: number, value: number])[];

/**
 * Photoshop's brush Size slider: 102 px at 50.5% of the track, 200 px at 75%, 500 px at 90%, then `max`, 5000 px in
 * Photoshop. For another largest size Photoshop keeps the breakpoints and moves only the end, as this does; `max`
 * must be over 500 px.
 */
export function brushSizeCurve(max: number): SliderCurve {
  return [
    [0, 1],
    [0.505, 102],
    [0.75, 200],
    [0.9, 500],
    [1, max]
  ];
}

/** Photoshop's brush Spacing slider, in percent of the tip: the Size curve to 500% at 90%, then 975% and 1000%. */
export const brushSpacingCurve: SliderCurve = [
  [0, 1],
  [0.505, 102],
  [0.75, 200],
  [0.9, 500],
  [0.95, 975],
  [1, 1000]
];

/** The value at slider position `t`, clamped to the curve's ends. */
export function curveValue(curve: SliderCurve, t: number) {
  const end = curve.findIndex(([position]) => position >= t);
  if (end <= 0) {
    return end === 0 ? curve[0]![1] : curve.at(-1)![1];
  }

  const [p0, v0] = curve[end - 1]!,
    [p1, v1] = curve[end]!;
  return v0 + ((t - p0) * (v1 - v0)) / (p1 - p0);
}

/** The slider position of `value`, from 0 to 1, clamped to the curve's ends. */
export function curvePosition(curve: SliderCurve, value: number) {
  const end = curve.findIndex(([, at]) => at >= value);
  if (end <= 0) {
    return end === 0 ? 0 : 1;
  }

  const [p0, v0] = curve[end - 1]!,
    [p1, v1] = curve[end]!;
  return p0 + ((value - v0) * (p1 - p0)) / (v1 - v0);
}
