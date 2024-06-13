import { Mesh, OGLRenderingContext, Program, RenderTarget, Texture } from '@packages/ogl';
import { RenderTargetOptions } from '@packages/ogl/core/render-target';
import { Square } from '@packages/ogl/extras/square';
import { MaybeAccessor, access } from '@solid-primitives/utils';
import { effect } from 'solid-js/web';
import { BlendModes, ColorBlendModes } from '../blend-modes';
import { DEFAULTS_RENDER_TARGET_OPTIONS } from '../defaults';
import fragment from './blend.frag?raw';
import vertex from './blend.vert?raw';

export const createBlendRenderTarget = (props: {
  gl: OGLRenderingContext;
  options?: Partial<RenderTargetOptions>;
  texture1?: MaybeAccessor<Texture | undefined>;
  texture2?: MaybeAccessor<Texture | undefined>;
  blendMode?: MaybeAccessor<BlendModes | undefined>;
  colorBlendMode?: MaybeAccessor<ColorBlendModes | undefined>;
  opacity?: MaybeAccessor<number | undefined>;
}) => {
  const { gl, options = DEFAULTS_RENDER_TARGET_OPTIONS } = props;

  const layer = new RenderTarget(gl, options);
  const geometry = new Square(gl);
  const uniforms = {
    tMap1: { value: access(props.texture1) },
    tMap2: { value: access(props.texture2) },
    blendMode: {
      value: access(props.blendMode) ?? BlendModes.NORMAL
    },
    colorBlendMode: {
      value: access(props.colorBlendMode) ?? ColorBlendModes.DEFAULT
    },
    uOpacity: { value: access(props.opacity) ?? 1.0 }
  };
  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms
  });
  const mesh = new Mesh(gl, { geometry, program });

  effect(() => {
    uniforms.tMap1.value = access(props.texture1);
    uniforms.tMap2.value = access(props.texture2);
    uniforms.blendMode.value = access(props.blendMode) ?? BlendModes.NORMAL;
    uniforms.uOpacity.value = access(props.opacity) ?? 1.0;
    uniforms.colorBlendMode.value = access(props.colorBlendMode) ?? ColorBlendModes.DEFAULT;

    gl.renderer.render({
      scene: mesh,
      target: layer,
      clear: false
    });
  });

  return layer;
};
