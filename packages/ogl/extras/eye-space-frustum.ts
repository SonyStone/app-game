import { degToRad } from '@packages/ogl-examples/skinning-fbx/fbx-loader/math-utils';
import { OGLRenderingContext } from '..';
import { Geometry } from '../core/geometry';
import { createBoxAttributes } from './box';

export class EyeSpaceFrustum extends Geometry {
  constructor(gl: OGLRenderingContext, { near = 0.1, far = 100, fov = 45, aspect = 1 }) {
    const tanHFov = Math.tan(degToRad(fov * 0.5));
    const nearHeight = tanHFov * near;
    const nearWidth = tanHFov * near * aspect;
    const farHeight = tanHFov * far;
    const farWidth = tanHFov * far * aspect;

    const attributes = createBoxAttributes();

    const position = attributes.position.data!;

    const points = [
      [-nearWidth, nearHeight, -near],
      [nearWidth, nearHeight, -near],
      [-nearWidth, -nearHeight, -near],
      [nearWidth, -nearHeight, -near],

      [-farWidth, farHeight, -far],
      [farWidth, farHeight, -far],
      [-farWidth, -farHeight, -far],
      [farWidth, -farHeight, -far]
    ] as const;

    const back = [0, 1, 2, 3];
    const front = [4, 5, 6, 7];

    const top = [0, 1, 4, 5];
    const bottom = [2, 3, 6, 7];

    const left = [1, 3, 5, 7];
    const right = [0, 2, 4, 6];

    const pointsIndices = [...left, ...right, ...top, ...bottom, ...front, ...back];

    for (let i = 0; i < pointsIndices.length; i++) {
      position[i * 3] = points[pointsIndices[i]][0];
      position[i * 3 + 1] = points[pointsIndices[i]][1];
      position[i * 3 + 2] = points[pointsIndices[i]][2];
    }

    attributes.position.needsUpdate = true;

    super(gl, attributes);
  }
}
