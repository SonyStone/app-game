import * as m4 from '@webgl/math/mut-m4';
import { GL_DATA_TYPE } from '@webgl/static-variables/data-type';

import { createShader } from '../Shader2';
import fragmentShader from './frag_shader.frag?raw';
import vertexShader from './vert_shader.vert?raw';

export function createWireframe(
  gl: WebGL2RenderingContext,
  vertices: any[],
  color: any
) {
  return createShader(gl)
    .createProgram(vertexShader, fragmentShader)
    .addAttribute(
      'aPosition',
      3,
      vertices.length / 3,
      new Float32Array(vertices.slice(0))
    )
    .addUniform('camera', GL_DATA_TYPE.FLOAT_MAT4, m4.identity())
    .addUniform('uColor', GL_DATA_TYPE.FLOAT_VEC3, color)
    .build();
}
