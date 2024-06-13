import { Mesh, OGLRenderingContext, Program, RenderTarget } from '@packages/ogl';
import { RenderTargetOptions } from '@packages/ogl/core/render-target';
import { Square } from '@packages/ogl/extras/square';
import { MaybeAccessor, access } from '@solid-primitives/utils';
import { createSignal } from 'solid-js';
import { effect } from 'solid-js/web';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../defaults';
import fragment from './brush-texture.frag?raw';
import vertex from './brush-texture.vert?raw';

export const createBrushRenderTarget = ({
  gl,
  options = DEFAULTS_RENDER_TARGET_OPTIONS,
  color = [0.27, 0.66, 0.93]
}: {
  gl: OGLRenderingContext;
  options?: Partial<RenderTargetOptions>;
  color?: MaybeAccessor<[number, number, number] | undefined>;
}) => {
  const layer = new RenderTarget(gl, options);

  const uColor = { value: access(color) };

  const geometry = new Square(gl);
  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: { uColor }
  });
  const mesh = new Mesh(gl, { geometry, program });

  const [layerS, setLayerS] = createSignal(layer, { equals: () => false });

  effect(() => {
    uColor.value = access(color);
    gl.renderer.render({
      scene: mesh,
      target: layer,
      clear: false
    });
    setLayerS(layer);
  });

  return layerS;
};
