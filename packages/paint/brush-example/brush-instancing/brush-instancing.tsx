import { OGLRenderingContext, Texture } from '@packages/ogl';
import { RenderTargetOptions } from '@packages/ogl/core/render-target';
import { MaybeAccessor, access } from '@solid-primitives/utils';
import { createEffect } from 'solid-js';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../defaults';
import { curve } from '../utils/curve';
import { createBrushInstancing } from './create-brush-instancing';

export const createBrushInstancingRenderTarget = ({
  gl,
  texture,
  instancedCount = 300,
  color,
  options = DEFAULTS_RENDER_TARGET_OPTIONS,
  points = [
    [0.1, 0.1],
    [0.1, 0.8],
    [0.2, 0.9],
    [0.9, 0.9]
  ]
}: {
  gl: OGLRenderingContext;
  texture?: MaybeAccessor<Texture | undefined>;
  color?: MaybeAccessor<[number, number, number] | undefined>;
  instancedCount?: MaybeAccessor<number | undefined>;
  options?: Partial<RenderTargetOptions>;
  points?: MaybeAccessor<[number, number][] | undefined>;
}) => {
  const brush = createBrushInstancing({
    gl,
    texture,
    color,
    options
  });

  let realInstancedCount = 0;
  const setOffset = (num: number, points: [number, number][]) => {
    let step = 1 / num;
    let i = 0;
    let prevPoint = [0, 0];
    const SPACING = 0.009;
    for (let p = 0; p <= 1; p = p + step) {
      const point = curve(p, points[0] ?? 0, points[1] ?? 0, points[2] ?? 0, points[3] ?? 0);

      if (Math.abs(prevPoint[0] - point[0]) < SPACING && Math.abs(prevPoint[1] - point[1]) < SPACING) {
        continue;
      }

      brush.add({ point, opacity: p });

      prevPoint[0] = point[0];
      prevPoint[1] = point[1];
      i++;
    }
    realInstancedCount = i;
  };

  createEffect(() => {
    const num = access(instancedCount) ?? 300;

    // update the instanced count and attributes
    setOffset(num, access(points) ?? []);
    brush.apply();
    brush.render();
  });

  return brush.layer;
};
