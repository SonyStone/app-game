import { Mesh, NormalProgram, OGLRenderingContext, Plane, Program, Transform } from '@packages/ogl';
import { BlendFunc } from '@packages/ogl/core/renderer';
import { Vec3Tuple } from '@packages/ogl/math/vec-3';
import { onCleanup } from 'solid-js';
import { effect } from 'solid-js/web';

export function PlaneComponent(props: {
  gl: OGLRenderingContext;
  parent: Transform;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
  program?: Program;
  blendFunc?: BlendFunc;
}) {
  const { parent, gl, program } = props;

  const plane = new Mesh(gl, { geometry: new Plane(gl), program: program ?? new NormalProgram(gl) });
  plane.setParent(parent);

  effect(() => {
    if (props.blendFunc && program) {
      program.blendFunc = props.blendFunc;
    }
  });

  effect(() => {
    plane.position.set(props.position ?? [0, 0, 0]);
  });

  effect(() => {
    plane.rotation.set(props.rotation ?? [0, 0, 0]);
  });

  onCleanup(() => {
    parent.removeChild(plane);
  });

  return <></>;
}
