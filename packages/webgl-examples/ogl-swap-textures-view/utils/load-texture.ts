import { OGLRenderingContext, Texture } from '@packages/ogl';

export const loadTextureAsync = (gl: OGLRenderingContext, src: string) => {
  const texture = new Texture(gl);
  const img = new Image();
  img.src = src;
  return new Promise<Texture>((resolve, reject) => {
    img.onload = () => {
      texture.image = img;
      resolve(texture);
    };
    img.onerror = () => {
      reject(texture);
    };
  });
};

export const loadTexture = (gl: OGLRenderingContext, src: string) => {
  const texture = new Texture(gl);
  const img = new Image();
  img.src = src;
  img.onload = () => {
    texture.image = img;
  };
  return texture;
};
