import { OGLRenderingContext, RenderTarget, Texture } from '@packages/ogl';
import { MaybeAccessor, access } from '@solid-primitives/utils';
import { createSignal } from 'solid-js';
import { effect } from 'solid-js/web';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../../defaults';

import { TextureMesh } from './texture-mesh';

export const createTextureToRenderTarget = (props: {
  gl: OGLRenderingContext;
  texture?: MaybeAccessor<Texture | undefined>;
  target?: MaybeAccessor<RenderTarget>;
}) => {
  const { gl, target = new RenderTarget(gl, DEFAULTS_RENDER_TARGET_OPTIONS) } = props;
  const [layer, setLayer] = createSignal(access(target), { equals: () => false });

  const mesh = new TextureMesh(gl, { texture: access(props.texture) });

  effect(() => {
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
