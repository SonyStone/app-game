import { Vec2Tuple } from '@packages/math';
import { OGLRenderingContext, Texture } from '@packages/ogl';
import { RenderTarget, RenderTargetOptions } from '@packages/ogl/core/render-target';
import { MaybeAccessor, access } from '@solid-primitives/utils';
import { createSignal } from 'solid-js';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../defaults';
import { BrushStrokeMesh } from './brush-stroke-mesh';

/**
 * creates new render target (texture) - draw instancing of brushes on it
 *
 * color should be the same as the brush color
 *
 * @params
 * * texture: Texture
 * * color: rgb
 * * instancedCount: number
 * * position:
 * * opacity
 *
 * @returns
 */
export const createBrushInstancing = ({
  gl,
  texture,
  color,
  target = new RenderTarget(gl, DEFAULTS_RENDER_TARGET_OPTIONS),
  swap,
  beforeRender,
  afterRender
}: {
  gl: OGLRenderingContext;
  target?: MaybeAccessor<RenderTarget>;
  texture?: MaybeAccessor<Texture | undefined>;
  color?: MaybeAccessor<[number, number, number] | undefined>;
  options?: Partial<RenderTargetOptions>;
  swap?: () => void;
  beforeRender?: () => void;
  afterRender?: () => void;
}) => {
  const [layer, setLayer] = createSignal(access(target), { equals: () => false });

  let needsUpdate = true;

  const mesh = new BrushStrokeMesh(gl);

  let i = 0;
  const add = (options: { point: Vec2Tuple; opacity: number }) => {
    // console.log(`add`, i);
    if (i > 1000) {
      i = 0;
      swap?.();
    }

    mesh.setBrushSpot(i, options.point, options.opacity);

    mesh.setInstancedCount(i + 1);
    setInstancedCount(i + 1);
    i++;
    needsUpdate = true;
  };

  const [instancedCount, setInstancedCount] = createSignal(0);
  // update the instanced count and attributes
  const apply = () => {
    i = 0;
    swap?.();
    needsUpdate = true;
  };

  const render = () => {
    if (!needsUpdate) {
      return;
    }

    // update uniforms
    {
      mesh.setBrushTexture(access(texture));
      mesh.setBrushColor(access(color));
    }

    beforeRender?.();
    gl.clearColor(mesh.uColor.value[0], mesh.uColor.value[1], mesh.uColor.value[2], 0);
    gl.renderer.render({
      scene: mesh,
      target: access(target),
      clear: true
    });
    console.log('2️⃣ rendering brush stroke', access(target).id);
    setLayer(access(target));
    needsUpdate = false;
    afterRender?.();
  };

  const clear = () => {
    gl.clearColor(mesh.uColor.value[0], mesh.uColor.value[1], mesh.uColor.value[2], 0);
  };

  return { layer, render, clear, add, apply, instancedCount };
};
