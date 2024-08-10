import { OGLRenderingContext, Texture } from '@packages/ogl';
import { MaybeAccessor, access } from '@solid-primitives/utils';
import { createSignal, untrack } from 'solid-js';
import { effect } from 'solid-js/web';

export const createColorTexture = (
  gl: OGLRenderingContext,
  color: MaybeAccessor<[number, number, number] | [number, number, number, number]>
) => {
  let uColor = access(color);
  const image = new Uint8Array([uColor[0], uColor[1], uColor[2], uColor[3] ?? 255]);
  const [texture, setTexture] = createSignal<Texture>(
    new Texture(gl, {
      image,
      width: 1,
      height: 1,
      wrapS: gl.REPEAT,
      wrapT: gl.REPEAT,
      magFilter: gl.NEAREST
    }),
    { equals: () => false }
  );

  effect(() => {
    const t = untrack(texture);
    uColor = access(color);
    image[0] = uColor[0];
    image[1] = uColor[1];
    image[2] = uColor[2];
    t.needsUpdate = true;
    setTexture(t);
  });

  return texture;
};
