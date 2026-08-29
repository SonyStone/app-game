import { Mesh, NormalProgram, OGLRenderingContext, Plane, Program, Transform } from '@app-game/ogl';
import { BlendFunc } from '@app-game/ogl/core/renderer';
import { Vec3Tuple } from '@app-game/ogl/math/vec-3';
import { createTrackedEffect, onCleanup } from 'solid-js';

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

  createTrackedEffect(() => {
    if (props.blendFunc && program) {
      program.blendFunc = props.blendFunc;
    }
  });

  createTrackedEffect(() => {
    plane.position.set(props.position ?? [0, 0, 0]);
  });

  createTrackedEffect(() => {
    plane.rotation.set(props.rotation ?? [0, 0, 0]);
  });

  onCleanup(() => {
    parent.removeChild(plane);
  });

  return <></>;
}
