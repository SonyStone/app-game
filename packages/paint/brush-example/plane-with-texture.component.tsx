import { Mesh, OGLRenderingContext, Plane, Texture, Transform } from '@app-game/ogl';
import { TextureProgram } from '@app-game/ogl/extras/texture-program';
import { Vec3Tuple } from '@app-game/ogl/math/vec-3';
import { Accessor, createTrackedEffect, onCleanup, untrack } from 'solid-js';

export const PlaneWithTextureComponent = (props: {
  gl: OGLRenderingContext;
  parent: Transform;
  texture: Texture | Accessor<Texture | undefined>;
  transparent?: boolean;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
}) => {
  const gl = untrack(() => props.gl);
  const parent = untrack(() => props.parent);
  const initialTexture = untrack(() => props.texture);
  const tMap = { value: typeof initialTexture === 'function' ? untrack(initialTexture) : initialTexture };
  const plane = new Mesh(gl, {
    geometry: new Plane(gl),
    program: new TextureProgram(gl, {
      uniforms: {
        tMap
      },
      depthTest: true,
      transparent: untrack(() => props.transparent) ?? false,
      blendFunc: { src: gl.SRC_ALPHA, dst: gl.ONE_MINUS_SRC_ALPHA, srcAlpha: gl.ONE, dstAlpha: gl.ONE_MINUS_SRC_ALPHA }
    })
  });

  createTrackedEffect(() => {
    if (typeof props.texture === 'function') {
      tMap.value = props.texture();
    }
  });

  createTrackedEffect(() => {
    plane.program.setTransparent(props.transparent ?? false);
  });

  createTrackedEffect(() => {
    plane.position.set(props.position ?? [0, 0, 0]);
  });

  createTrackedEffect(() => {
    plane.rotation.set(props.rotation ?? [0, 0, 0]);
  });

  plane.setParent(parent);
  onCleanup(() => {
    parent.removeChild(plane);
  });

  return <></>;
};
