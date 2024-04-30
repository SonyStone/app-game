import { Mesh, NormalProgram, OGLRenderingContext, Sphere, Transform } from '@packages/ogl';
import { Vec3Tuple } from '@packages/ogl/math/vec-3';
import { onCleanup } from 'solid-js';
import { effect } from 'solid-js/web';

export function SphereComponent(props: {
  gl: OGLRenderingContext;
  scene: Transform;
  position?: Vec3Tuple;
  radius?: number;
}) {
  const { gl, scene } = props;

  const mesh = new Mesh(gl, {
    geometry: new Sphere(gl, { radius: props.radius ?? 0.05 }),
    program: new NormalProgram(gl)
  });
  scene.addChild(mesh);

  effect(() => {
    mesh.position.set(props.position ?? [0, 0, 0]);
  });

  onCleanup(() => {
    scene.removeChild(mesh);
  });

  return <></>;
}
