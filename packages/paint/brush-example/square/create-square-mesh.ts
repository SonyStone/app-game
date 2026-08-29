import { Mesh, OGLRenderingContext, Program, Texture } from '@app-game/ogl';
import { Square } from '@app-game/ogl/extras/square';
import { MaybeAccessor, access } from '@solid-primitives/utils';
import { createTrackedEffect, untrack } from 'solid-js';

import fragment from './square.frag?raw';
import vertex from './square.vert?raw';

export const createSquareMesh = (props: {
  gl: OGLRenderingContext;
  texture: MaybeAccessor<Texture | undefined>;
  transparent?: MaybeAccessor<boolean>;
  position?: { top: number; bottom: number; left: number; right: number };
  zIndex?: MaybeAccessor<number>;
}) => {
  const gl = untrack(() => props.gl);
  const initialPosition = untrack(() => props.position);
  const tMap = { value: untrack(() => access(props.texture)) };
  const zIndex = { value: untrack(() => access(props.zIndex)) ?? 0 };
  const mesh = new Mesh(gl, {
    geometry: new Square(gl, { position: initialPosition }),
    program: new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        tMap,
        zIndex
      },
      depthTest: true,
      transparent: untrack(() => access(props.transparent)) ?? false,
      blendFunc: { src: gl.SRC_ALPHA, dst: gl.ONE_MINUS_SRC_ALPHA, srcAlpha: gl.ONE, dstAlpha: gl.ONE_MINUS_SRC_ALPHA }
    })
  });

  createTrackedEffect(() => {
    tMap.value = access(props.texture);
  });

  createTrackedEffect(() => {
    zIndex.value = access(props.zIndex) ?? 0;
  });

  createTrackedEffect(() => {
    mesh.program.setTransparent(access(props.transparent) ?? false);
  });

  return mesh;
};
