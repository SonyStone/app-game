import { Mesh, NormalProgram, OGLRenderingContext, Sphere, Transform } from '@app-game/ogl';
import { Vec3Tuple } from '@app-game/ogl/math/vec-3';
import { createTrackedEffect, onCleanup } from 'solid-js';

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

  createTrackedEffect(() => {
    mesh.position.set(props.position ?? [0, 0, 0]);
  });

  onCleanup(() => {
    scene.removeChild(mesh);
  });

  return <></>;
}
