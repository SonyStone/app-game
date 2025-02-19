import { Mesh, OGLRenderingContext, Plane, Texture, Transform } from '@packages/ogl';
import { TextureProgram } from '@packages/ogl/extras/texture-program';
import { Vec3Tuple } from '@packages/ogl/math/vec-3';
import { Accessor, onCleanup } from 'solid-js';
import { effect } from 'solid-js/web';

export const PlaneWithTextureComponent = (props: {
  gl: OGLRenderingContext;
  parent: Transform;
  texture: Texture | Accessor<Texture | undefined>;
  transparent?: boolean;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
}) => {
  const { gl } = props;
  const tMap = { value: typeof props.texture === 'function' ? props.texture() : props.texture };
  const plane = new Mesh(gl, {
    geometry: new Plane(gl),
    program: new TextureProgram(props.gl, {
      uniforms: {
        tMap
      },
      depthTest: true,
      transparent: props.transparent ?? false,
      blendFunc: { src: gl.SRC_ALPHA, dst: gl.ONE_MINUS_SRC_ALPHA, srcAlpha: gl.ONE, dstAlpha: gl.ONE_MINUS_SRC_ALPHA }
    })
  });

  effect(() => {
    if (typeof props.texture === 'function') {
      tMap.value = props.texture();
    }
  });

  effect(() => {
    plane.program.setTransparent(props.transparent ?? false);
  });

  effect(() => {
    plane.position.set(props.position ?? [0, 0, 0]);
  });

  effect(() => {
    plane.rotation.set(props.rotation ?? [0, 0, 0]);
  });

  plane.setParent(props.parent);
  onCleanup(() => {
    props.parent.removeChild(plane);
  });

  return <></>;
};
