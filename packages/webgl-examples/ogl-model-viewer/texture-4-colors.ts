import { OGLRenderingContext, Texture } from '@packages/ogl';

export const createTexture4colors = (gl: OGLRenderingContext) =>
  new Texture(gl, {
    image: new Uint8Array([191, 25, 54, 255, 96, 18, 54, 255, 96, 18, 54, 255, 37, 13, 53, 255]),
    width: 2,
    height: 2,
    wrapS: gl.REPEAT,
    wrapT: gl.REPEAT,
    magFilter: gl.NEAREST
  });
