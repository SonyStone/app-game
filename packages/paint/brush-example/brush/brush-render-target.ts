import { OGLRenderingContext, RenderTarget } from '@packages/ogl';
import { MaybeAccessor, access } from '@solid-primitives/utils';
import { createSignal } from 'solid-js';
import { effect } from 'solid-js/web';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../defaults';
import { BrushMesh } from './brush-mesh';

export const createBrushRenderTarget = ({
  gl,
  target = new RenderTarget(gl, DEFAULTS_RENDER_TARGET_OPTIONS),
  color = [0, 0, 0]
}: {
  gl: OGLRenderingContext;
  target?: MaybeAccessor<RenderTarget>;
  color?: MaybeAccessor<[number, number, number] | undefined>;
}) => {
  const mesh = new BrushMesh(gl, access(color));

  const [layerS, setLayerS] = createSignal(access(target), { equals: () => false });

  effect(() => {
    mesh.setColor(access(color));
    // gl.clearColor(0, 0, 0, 1);
    gl.renderer.render({
      scene: mesh,
      target: access(target),
      clear: false
    });
    console.log('1️⃣ rendering brush texture', access(target).id);
    setLayerS(access(target));
  });

  return layerS;
};
