import { record } from '@app-game/abr-brush/form';
import { z } from 'zod';
import type { Brush, Dab } from './brush';
import type { Point } from './camera';

/** Document-space symmetry axes. Rotation is clockwise radians; segment count includes the original stroke. */
export const paintSymmetrySchema = z
  .object({
    mode: z.enum(['off', 'vertical', 'horizontal', 'dual', 'diagonal', 'radial', 'mandala']),
    x: z.number().finite(),
    y: z.number().finite(),
    angle: z.number().finite(),
    segments: z.number().int().min(2).max(12),
    visible: z.boolean()
  })
  .refine((value) => value.mode !== 'mandala' || (value.segments >= 3 && value.segments <= 10), {
    message: 'Mandala requires 3 to 10 segments.'
  });
export type PaintSymmetry = z.infer<typeof paintSymmetrySchema>;

/** New and legacy documents start with symmetry disabled. */
export function defaultPaintSymmetry(): PaintSymmetry {
  return { mode: 'off', x: 0, y: 0, angle: 0, segments: 6, visible: true };
}

/** Mirrors paint tools, not canvas-dependent retouch or physical/live tips. Custom engines opt in separately. */
export function supportsPaintSymmetry(brush: Brush): boolean {
  if (!brush.engine || brush.engine.id === 'round') return true;
  if (brush.engine.id !== 'abr') return false;
  const values = record(record(brush.engine.settings).values);
  return (
    ['PbTl', 'PcTl', 'ErTl'].includes(String(record(values.tool).type)) &&
    !['dBrush', 'dTips'].includes(String(values.tipKind))
  );
}

/** Reusable rigid 2D transform about the document's symmetry origin. */
export type SymmetryTransform = { a: number; b: number; c: number; d: number; x: number; y: number };

/** Identity first, followed by each reflected/rotated copy. No duplicate full turns are emitted. */
export function symmetryTransforms(value: PaintSymmetry): SymmetryTransform[] {
  const state = paintSymmetrySchema.parse(value);
  const rotate = (angle: number) => matrix(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), state);
  // Reflect about the vertical axis rotated by angle.
  const reflect = (angle: number) =>
    matrix(-Math.cos(2 * angle), -Math.sin(2 * angle), -Math.sin(2 * angle), Math.cos(2 * angle), state);
  const identity = matrix(1, 0, 0, 1, state);
  if (state.mode === 'off') return [identity];
  if (state.mode === 'vertical') return [identity, reflect(state.angle)];
  if (state.mode === 'horizontal') return [identity, reflect(state.angle + Math.PI / 2)];
  if (state.mode === 'diagonal') return [identity, reflect(state.angle - Math.PI / 4)];
  if (state.mode === 'dual')
    return [identity, reflect(state.angle), reflect(state.angle + Math.PI / 2), rotate(Math.PI)];
  const result: SymmetryTransform[] = [];
  for (let i = 0; i < state.segments; i++) {
    const angle = (i * Math.PI * 2) / state.segments;
    result.push(i === 0 ? identity : rotate(angle));
    if (state.mode === 'mandala') result.push(reflect(state.angle + angle / 2));
  }
  return result;
}

/** Applies a rigid transform without changing the caller's point. */
export function symmetryPoint(point: Point, transform: SymmetryTransform): Point {
  return {
    x: transform.a * point.x + transform.c * point.y + transform.x,
    y: transform.b * point.x + transform.d * point.y + transform.y
  };
}

/** Copies sampled stamps after dynamics/interpolation, preserving pressure, spacing, RNG and atomic stroke opacity.
 * ABR orientation and UV handedness are transformed together, including the secondary tip.
 * Texture lookup remains in document coordinates, as it does for ordinary painting.
 */
export function symmetryDabs(dabs: readonly Dab[], transforms: readonly SymmetryTransform[]): readonly Dab[] {
  if (transforms.length < 2 || !dabs.length) return dabs;
  const result: Dab[] = [];
  for (const dab of dabs) {
    result.push(dab);
    for (let i = 1; i < transforms.length; i++) {
      const transform = transforms[i]!;
      const position = symmetryPoint(dab, transform);
      let abr = dab.abr;
      if (abr) {
        const data = abr.data.slice();
        const cosine = data[4]!,
          sine = data[5]!;
        data[0] = position.x;
        data[1] = position.y;
        data[4] = transform.a * cosine + transform.c * sine;
        data[5] = transform.b * cosine + transform.d * sine;
        if (transform.a * transform.d - transform.b * transform.c < 0) data[7] = -data[7]!;
        abr = { ...abr, data };
      }
      result.push({ ...dab, ...position, abr });
    }
  }
  return result;
}

/** Document-space guide rays use the same axes as the stroke transform. Length only affects the overlay. */
export function symmetryGuide(state: PaintSymmetry, length: number): [Point, Point][] {
  if (state.mode === 'off') return [];
  const center = { x: state.x, y: state.y };
  const ray = (angle: number, bidirectional = true): [Point, Point] => {
    const x = Math.sin(angle) * length,
      y = -Math.cos(angle) * length;
    return [bidirectional ? { x: center.x - x, y: center.y - y } : center, { x: center.x + x, y: center.y + y }];
  };
  if (state.mode === 'vertical') return [ray(state.angle)];
  if (state.mode === 'horizontal') return [ray(state.angle + Math.PI / 2)];
  if (state.mode === 'diagonal') return [ray(state.angle - Math.PI / 4)];
  if (state.mode === 'dual') return [ray(state.angle), ray(state.angle + Math.PI / 2)];
  const rays = state.segments * (state.mode === 'mandala' ? 2 : 1);
  return Array.from({ length: rays }, (_, i) => ray(state.angle + (i * Math.PI * 2) / rays, false));
}

function matrix(a: number, b: number, c: number, d: number, origin: Point): SymmetryTransform {
  return { a, b, c, d, x: origin.x - a * origin.x - c * origin.y, y: origin.y - b * origin.x - d * origin.y };
}
