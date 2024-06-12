import { OGLRenderingContext, Texture } from '@packages/ogl';
import { Accessor, createSignal } from 'solid-js';
import { effect } from 'solid-js/web';

export const createColorTexture = (
  gl: OGLRenderingContext,
  color: [number, number, number] | Accessor<[number, number, number]>
) => {
  const uColor = { value: typeof color === 'function' ? color() : color };
  const texture = new Texture(gl, {
    image: new Uint8Array([uColor.value[0], uColor.value[1], uColor.value[2], 255]),
    width: 1,
    height: 1,
    wrapS: gl.REPEAT,
    wrapT: gl.REPEAT,
    magFilter: gl.NEAREST
  });

  const [textureS, setTextureS] = createSignal<Texture>(texture, { equals: () => false });

  effect(() => {
    if (typeof color === 'function') {
      uColor.value = color();
    }
    texture.image = new Uint8Array([uColor.value[0], uColor.value[1], uColor.value[2], 255]);
    texture.needsUpdate = true;
    setTextureS(texture);
  });

  return textureS;
};
