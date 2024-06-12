import { Mesh, OGLRenderingContext, Program, RenderTarget } from '@packages/ogl';
import { RenderTargetOptions } from '@packages/ogl/core/render-target';
import { Square } from '@packages/ogl/extras/square';
import { GL_DATA_TYPE } from '@packages/webgl/static-variables';
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
  }
}: {
  gl: OGLRenderingContext;
  options?: Partial<RenderTargetOptions>;
}) => {
  const layer = new RenderTarget(gl, options);

  {
    const geometry = new Square(gl);
    const program = new Program(gl, {
      vertex,
      fragment
    });
    const mesh = new Mesh(gl, { geometry, program });
    gl.renderer.render({
      scene: mesh,
      target: layer,
      clear: false
    });
  }

  return layer;
};
