import { OGLRenderingContext, Texture } from '@packages/ogl';

export const createColorTexture = (gl: OGLRenderingContext, color: [number, number, number]) =>
  new Texture(gl, {
    image: new Uint8Array([color[0], color[1], color[2], 255]),
    width: 1,
    height: 1,
    wrapS: gl.REPEAT,
    wrapT: gl.REPEAT,
    magFilter: gl.NEAREST
  });
