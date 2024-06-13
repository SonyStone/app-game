import { Mesh, OGLRenderingContext, Program, RenderTarget, Texture } from '@packages/ogl';
import { RenderTargetOptions } from '@packages/ogl/core/render-target';
import { Square } from '@packages/ogl/extras/square';
import { MaybeAccessor, access } from '@solid-primitives/utils';
import { createEffect, createSignal, untrack } from 'solid-js';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../defaults';
import { curve } from '../utils/curve';
import fragment from './brush-instancing.frag?raw';
import vertex from './brush-instancing.vert?raw';

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
  const [layer, setLayer] = createSignal(new RenderTarget(gl, options), { equals: () => false });

  const MAX_COUNT = 500;

  const offset = new Float32Array(MAX_COUNT * 4);
  const opacity = new Float32Array(MAX_COUNT);
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

      offset.set(point, i * 2);
      opacity.set([p], i);

      prevPoint[0] = point[0];
      prevPoint[1] = point[1];
      i++;
    }
    realInstancedCount = i;
  };

  const geometry = new Square(gl, {
    attributes: {
      offset: { instanced: 1, size: 2, data: offset },
      opacity: { instanced: 1, size: 1, data: opacity }
    }
  });

  const tBrush = { value: access(texture) };
  const uColor = { value: access(color) ?? ([0, 0, 0] as [number, number, number]) };

  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: { tBrush },
    transparent: true,
    blendFunc: {
      src: gl.SRC_ALPHA,
      dst: gl.ONE_MINUS_SRC_ALPHA,
      srcAlpha: gl.ONE,
      dstAlpha: gl.ONE_MINUS_SRC_ALPHA
    }
  });

  const mesh = new Mesh(gl, { geometry, program });

  createEffect(() => {
    const num = access(instancedCount) ?? 300;

    // update the instanced count and attributes
    {
      setOffset(num, access(points) ?? []);
      geometry.instancedCount = realInstancedCount;
      geometry.attributes.offset.needsUpdate = true;
      geometry.attributes.opacity.needsUpdate = true;
    }

    // update uniforms
    {
      tBrush.value = access(texture);
      uColor.value = access(color) ?? ([0, 0, 0] as [number, number, number]);
    }

    gl.clearColor(uColor.value[0], uColor.value[1], uColor.value[2], 0);
    gl.renderer.render({
      scene: mesh,
      target: untrack(layer),
      clear: true
    });
    setLayer(untrack(layer));
  });

  return layer;
};
