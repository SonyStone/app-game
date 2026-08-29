import { OGLRenderingContext, RenderTarget, Texture } from '@app-game/ogl';
import { MaybeAccessor, access } from '@solid-primitives/utils';
import { createSignal, createTrackedEffect, untrack } from 'solid-js';

import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../../defaults';

import { TextureMesh } from './texture-mesh';

export const createTextureToRenderTarget = (props: {
  gl: OGLRenderingContext;
  texture?: MaybeAccessor<Texture | undefined>;
  target?: MaybeAccessor<RenderTarget>;
}) => {
  const { gl, target = new RenderTarget(gl, DEFAULTS_RENDER_TARGET_OPTIONS) } = props;
  const [layer, setLayer] = createSignal(
    untrack(() => access(target)),
    { equals: () => false }
  );

  const mesh = new TextureMesh(gl, { texture: untrack(() => access(props.texture)) });

  createTrackedEffect(() => {
    mesh.setMap(access(props.texture));

    gl.renderer.render({
      scene: mesh,
      target: access(target),
      clear: false
    });
    console.log('*️⃣ rendering texture', access(target).id);
    setLayer(access(target));
  });

  return layer;
};
