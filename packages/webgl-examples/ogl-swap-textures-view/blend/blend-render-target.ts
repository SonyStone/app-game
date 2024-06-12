import { Mesh, OGLRenderingContext, Program, RenderTarget, Texture } from '@packages/ogl';
import { RenderTargetOptions } from '@packages/ogl/core/render-target';
import { Square } from '@packages/ogl/extras/square';
import { GL_DATA_TYPE } from '@packages/webgl/static-variables';
import { Accessor } from 'solid-js';
import { effect } from 'solid-js/web';
import { BlendModes, ColorBlendModes } from '../blend-modes';
import fragment from './blend.frag?raw';
import vertex from './blend.vert?raw';

export const createBlendRenderTarget = (props: {
  gl: OGLRenderingContext;
  texture1?: Texture | Accessor<Texture | undefined>;
  texture2?: Texture | Accessor<Texture | undefined>;
  blendMode?: BlendModes | Accessor<BlendModes | undefined>;
  colorBlendMode?: ColorBlendModes | Accessor<ColorBlendModes | undefined>;
  opacity?: number | Accessor<number | undefined>;
  options?: Partial<RenderTargetOptions>;
}) => {
  const {
    gl,
    options = {
      width: 1024,
      height: 1024,
      type: GL_DATA_TYPE.HALF_FLOAT,
      format: gl.RGBA,
      internalFormat: gl.RGBA16F,
      depth: false
    }
  } = props;

  const layer = new RenderTarget(gl, options);
  const geometry = new Square(gl);
  const tMap1 = { value: typeof props.texture1 === 'function' ? props.texture1() : props.texture1 };
  const tMap2 = { value: typeof props.texture2 === 'function' ? props.texture2() : props.texture2 };
  const blendMode = {
    value: (typeof props.blendMode === 'function' ? props.blendMode() : props.blendMode) ?? BlendModes.NORMAL
  };
  const colorBlendMode = {
    value:
      (typeof props.colorBlendMode === 'function' ? props.colorBlendMode() : props.colorBlendMode) ??
      ColorBlendModes.DEFAULT
  };
  const uOpacity = { value: typeof props.opacity === 'function' ? props.opacity() : props.opacity ?? 1.0 };
  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      tMap1,
      tMap2,
      blendMode,
      colorBlendMode,
      uOpacity
    }
  });
  const mesh = new Mesh(gl, { geometry, program });
  effect(() => {
    if (typeof props.texture1 === 'function') {
      tMap1.value = props.texture1();
    }
    if (typeof props.texture2 === 'function') {
      tMap2.value = props.texture2();
    }
    if (typeof props.blendMode === 'function') {
      blendMode.value = props.blendMode() ?? BlendModes.NORMAL;
    }
    if (typeof props.opacity === 'function') {
      uOpacity.value = props.opacity() ?? 1.0;
    }
    if (typeof props.colorBlendMode === 'function') {
      colorBlendMode.value = props.colorBlendMode() ?? ColorBlendModes.DEFAULT;
    }

    gl.renderer.render({
      scene: mesh,
      target: layer,
      clear: false
    });
  });

  return layer;
};
