import { Box, Mesh, NormalProgram, OGLRenderingContext, Transform } from '@packages/ogl';
import { Vec3Tuple } from '@packages/ogl/math/vec-3';
import { onCleanup } from 'solid-js';
import { effect } from 'solid-js/web';

export function NormalBox(props: {
  gl: OGLRenderingContext;
  scene: Transform;
  position?: Vec3Tuple;
  matrix?: number[][];
}) {
  const { gl, scene } = props;
  const mesh = new Mesh(gl, { geometry: new Box(gl), program: new NormalProgram(gl) });
  effect(() => {
    mesh.position.set(props.position ?? [0, 0, 0]);
  });

  effect(() => {
    const matrix = props.matrix;
    if (!matrix) {
      return;
    }

    mesh.matrix[0] = matrix[0][0];
    mesh.matrix[1] = matrix[0][1];
    mesh.matrix[2] = matrix[0][2];
    mesh.matrix[3] = matrix[0][3];

    mesh.matrix[4] = matrix[1][0];
    mesh.matrix[5] = matrix[1][1];
    mesh.matrix[6] = matrix[1][2];
    mesh.matrix[7] = matrix[1][3];

    mesh.matrix[8] = matrix[2][0];
    mesh.matrix[9] = matrix[2][1];
    mesh.matrix[10] = matrix[2][2];
    mesh.matrix[11] = matrix[2][3];

    mesh.matrix[12] = matrix[3][0];
    mesh.matrix[13] = matrix[3][1];
    mesh.matrix[14] = matrix[3][2];
    mesh.matrix[15] = matrix[3][3];

    mesh.updateMatrix();
  });

  if (props.matrix) {
    mesh.updateMatrix = () => {
      mesh.worldMatrixNeedsUpdate = true;
    };
  }

  scene.addChild(mesh);

  onCleanup(() => {
    scene.removeChild(mesh);
  });

  return <></>;
}
