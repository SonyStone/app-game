import { Mesh, OGLRenderingContext, Plane, Texture, Transform } from '@packages/ogl';
import { TextureProgram } from '@packages/ogl/extras/texture-program';
import { Vec3Tuple } from '@packages/ogl/math/vec-3';
import { onCleanup } from 'solid-js';
import { effect } from 'solid-js/web';

export const PlaneWithTextureComponent = (props: {
  gl: OGLRenderingContext;
  parent: Transform;
  texture: Texture;
  transparent?: boolean;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
}) => {
  const plane = new Mesh(props.gl, {
    geometry: new Plane(props.gl),
    program: new TextureProgram(props.gl, {
      uniforms: {
        tMap: { value: props.texture }
      },
      depthTest: true,
      transparent: props.transparent ?? false
    })
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
