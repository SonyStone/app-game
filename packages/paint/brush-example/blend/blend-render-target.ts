import { OGLRenderingContext, Texture } from '@packages/ogl';
import { RenderTarget } from '@packages/ogl/core/render-target';
import { MaybeAccessor, access } from '@solid-primitives/utils';
import { createSignal } from 'solid-js';
import { BlendModes, ColorBlendModes } from '../blend-modes';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../defaults';
import { BlendMesh } from './blend-mesh';

/**
 * creates new render target (texture) - sum of blend of two textures
 */
export const createBlendRenderTarget = (props: {
  gl: OGLRenderingContext;
  target?: MaybeAccessor<RenderTarget>;
  texture1?: MaybeAccessor<Texture | undefined>;
  texture2?: MaybeAccessor<Texture | undefined>;
  blendMode?: MaybeAccessor<BlendModes | undefined>;
  colorBlendMode?: MaybeAccessor<ColorBlendModes | undefined>;
  opacity?: MaybeAccessor<number | undefined>;
}) => {
  const { gl, target = new RenderTarget(gl, DEFAULTS_RENDER_TARGET_OPTIONS) } = props;
  const [layer, setLayer] = createSignal(access(target), { equals: () => false });

  const mesh = new BlendMesh(gl);

  const render = () => {
    const texture1 = access(props.texture1);
    const texture2 = access(props.texture2);
    mesh.setTexture1(texture1);
    mesh.setTexture2(texture2);
    mesh.setBlendMode(access(props.blendMode) ?? BlendModes.NORMAL);
    mesh.setColorBlendMode(access(props.colorBlendMode) ?? ColorBlendModes.USING_GAMMA);
    mesh.setOpacity(access(props.opacity) ?? 1.0);

    console.log(`3️⃣ rendering blend apply ${texture2?.id} to ${texture1?.id} to target: ${access(target).id}`);

    gl.renderer.render({
      scene: mesh,
      target: access(target),
      clear: false
    });
    setLayer(access(target));
  };

  return { layer, render };
};
