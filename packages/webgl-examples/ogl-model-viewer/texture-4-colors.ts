import { OGLRenderingContext, Texture } from '@packages/ogl';

export const createTexture4colors = (
  gl: OGLRenderingContext,
  rgba1: [number, number, number, number] = [191, 25, 54, 255],
  rgba2: [number, number, number, number] = [96, 18, 54, 255],
  rgba3: [number, number, number, number] = [96, 18, 54, 255],
  rgba4: [number, number, number, number] = [37, 13, 53, 255]
) =>
  new Texture(gl, {
    image: new Uint8Array([...rgba1, ...rgba2, ...rgba3, ...rgba4]),
    width: 2,
    height: 2,
    wrapS: gl.REPEAT,
    wrapT: gl.REPEAT,
    magFilter: gl.NEAREST
  });
