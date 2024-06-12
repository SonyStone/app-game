import { Mesh, OGLRenderingContext, Program, RenderTarget } from '@packages/ogl';
import { RenderTargetOptions } from '@packages/ogl/core/render-target';
import { Square } from '@packages/ogl/extras/square';
import { GL_DATA_TYPE } from '@packages/webgl/static-variables';
import { Accessor, createSignal } from 'solid-js';
import { effect } from 'solid-js/web';
import fragment from './brush-texture.frag?raw';
import vertex from './brush-texture.vert?raw';

export const createBrushRenderTarget = ({
  gl,
  options = {
    width: 1024,
    height: 1024,
    type: GL_DATA_TYPE.HALF_FLOAT,
    format: gl.RGBA,
    internalFormat: gl.RGBA16F,
    depth: false
  },
  color = [0.27, 0.66, 0.93]
}: {
  gl: OGLRenderingContext;
  options?: Partial<RenderTargetOptions>;
  color?: [number, number, number] | Accessor<[number, number, number] | undefined>;
}) => {
  const layer = new RenderTarget(gl, options);

  const uColor = { value: typeof color === 'function' ? color() : color };

  const geometry = new Square(gl);
  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: { uColor }
  });
  const mesh = new Mesh(gl, { geometry, program });

  const [layerS, setLayerS] = createSignal(layer, { equals: () => false });

  effect(() => {
    if (typeof color === 'function') {
      uColor.value = color();
    }
    gl.renderer.render({
      scene: mesh,
      target: layer,
      clear: false
    });
    setLayerS(layer);
  });

  return layerS;
};
