import { Geometry, Mesh, OGLRenderingContext, Program, Transform } from '@packages/ogl';
import { Vec3Tuple } from '@packages/ogl/math/vec-3';
import { GL_DATA_TYPE, GL_DRAW_ARRAYS_MODE } from '@packages/webgl/static-variables';
import { toFloat32Array } from './to-float-32-array';
import fragment from './view-uv-map.frag?raw';
import vertex from './view-uv-map.vert?raw';

/**
 *
 * uv:
 *
 * | color                   | uv texcoord                                    |
 * | ----------------------- | ---------------------------------------------- |
 * | Uint8Array(R8 G8 B8 A8) | Float32Array(U32 V32) or Float16Array(U16 V16) |
 *
 */
export function viewUVMap({
  gl,
  scene,
  position,
  uv,
  doubleTexcoord = false,
  index
}: {
  gl: OGLRenderingContext;
  scene: Transform;
  uv: Float32Array;
  doubleTexcoord?: boolean;
  index: Uint32Array;
  position: Vec3Tuple;
}) {
  console.log(`color`, new Uint8Array(uv.buffer, 0, 4).join(' '));
  console.log(`uv texcoord `, toFloat32Array(new Uint16Array(uv.buffer, 4, 2)).join(' '));

  const geometry = new Geometry(gl, {
    color: { size: 4, data: uv, stride: 4 * 0, offset: 4, type: GL_DATA_TYPE.UNSIGNED_INT },
    uv: doubleTexcoord
      ? { size: 2, data: uv, stride: 4 * 2, offset: 4, type: GL_DATA_TYPE.HALF_FLOAT }
      : { size: 2, data: uv, stride: 4 * 5, offset: 4 },
    index: { data: index }
  });

  const program = new Program(gl, {
    vertex: vertex,
    fragment,
    cullFace: null
  });

  const mesh = new Mesh(gl, { mode: GL_DRAW_ARRAYS_MODE.TRIANGLES, geometry: geometry, program });
  mesh.position.set(position);
  mesh.setParent(scene);
}
